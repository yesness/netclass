import {
    CallPath,
    Message,
    MessageCallFunc,
    MessageCreateInstance,
    Packet,
    PartialPacket,
} from './internalTypes';
import Structurer, { Structure } from './structurer';
import Tracker from './tracker';
import { INCServer, INCSocket, NCServerOptions } from './types';
import { handleSocket, isInstance, SocketSend } from './util';

class Client<T> {
    private idMap: Record<number, number>;
    private send: SocketSend<Packet>;

    constructor(
        private id: number,
        private server: NCServer<T>,
        socket: INCSocket
    ) {
        this.idMap = {};
        this.send = handleSocket(socket, {
            onJSON: (msg: Message) => this.onMessage(msg),
            onClose: () => {
                this.server.tracker.dereferenceAllObjects({
                    clientID: this.id,
                });
            },
        });
    }

    private onMessage(msg: Message) {
        if (this.server.debugLogging) {
            console.debug('[SERVER] onMessage', JSON.stringify(msg, null, 2));
        }
        this.messageHandler(msg)
            .then((packet) =>
                this.send({
                    ...packet,
                    msgID: msg.msgID,
                })
            )
            .catch((error) => {
                if (this.server.debugLogging) {
                    console.error('messageHandler error:', error);
                }
                this.send({
                    type: 'error',
                    msgID: msg.msgID,
                    error:
                        error?.message ??
                        error?.toString() ??
                        '<no error message found>',
                });
            });
    }

    private async messageHandler(msg: Message): Promise<PartialPacket> {
        switch (msg.type) {
            case 'get_structure':
                return {
                    type: 'get_structure_result',
                    structure: this.server.structure,
                };
            case 'call_func':
                return await this.callFunc(msg);
            case 'create_instance':
                return await this.createInstance(msg);
        }
    }

    private async callFunc(msg: MessageCallFunc): Promise<PartialPacket> {
        if (msg.path.objectID != null && msg.path.objectID in this.idMap) {
            msg.path.objectID = this.idMap[msg.path.objectID];
        }
        const stack = this.server.traverse(msg.path);
        const [func, obj] = stack;
        if (typeof func !== 'function') {
            throw new Error('Path must point to a function');
        }
        let boundFunc = func;
        if (obj != null && isInstance(obj)) {
            boundFunc = func.bind(obj);
        }
        const maybeResult = boundFunc(...msg.args);
        let result;
        if (maybeResult instanceof Promise) {
            result = await maybeResult;
        } else {
            result = maybeResult;
        }
        const { structure, objectIDs } = Structurer.getStructure(
            result,
            this.server.tracker
        );
        this.server.tracker.referenceObjects({ clientID: this.id }, objectIDs);
        return {
            type: 'call_func_result',
            structure,
        };
    }

    private async createInstance(
        msg: MessageCreateInstance
    ): Promise<PartialPacket> {
        const [clazz] = this.server.traverse(msg.path);
        if (typeof clazz !== 'function') {
            throw new Error('Path must point to a class');
        }
        const instance = new clazz(...msg.args);
        this.idMap[msg.instanceID] = this.server.tracker.trackObject(instance);
        this.server.tracker.referenceObject(
            { clientID: this.id },
            this.idMap[msg.instanceID]
        );
        return {
            type: 'success',
        };
    }
}

export default class NCServer<T> implements INCServer {
    debugLogging: boolean;
    tracker: Tracker;
    structure: Structure;
    private nextClientID: number = 1;

    constructor(options: NCServerOptions<T>) {
        this.debugLogging = options.debugLogging ?? false;
        this.tracker = new Tracker();
        const { structure, objectIDs } = Structurer.getStructure(
            options.object,
            this.tracker
        );
        this.structure = structure;
        this.tracker.referenceObjects({ type: 'persist' }, objectIDs);
    }

    connect(socket: INCSocket): void {
        new Client(this.nextClientID++, this, socket);
    }

    traverse({ path, objectID }: CallPath): any[] {
        const stack: any[] = [this.tracker.getObject(objectID)];
        for (let part of path) {
            let obj = stack[0];
            if (!(part in obj)) {
                throw new Error(
                    `Failed to resolve "${part}" in ${JSON.stringify(path)}`
                );
            }
            stack.unshift(obj[part]);
        }
        return stack;
    }
}
