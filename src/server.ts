import {
    CallPath,
    Message,
    MessageCallFunc,
    MessageCreateInstance,
    Packet,
    PacketResult,
    PartialPacket,
} from './internalTypes';
import Structurer, { Structure } from './structurer';
import Tracker from './tracker';
import { INCServer, INCSocket, NCServerOptions } from './types';
import { handleSocket, isNetClass, SocketSend } from './util';

class Client<T> {
    private idMap: Record<number, number>;
    private send: SocketSend<Packet>;

    constructor(
        private id: number,
        private server: NCServer<T>,
        socket: INCSocket,
        onClose: () => void
    ) {
        this.idMap = {};
        this.send = handleSocket(socket, {
            onJSON: (msg: Message) => this.onMessage(msg),
            onClose,
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
                    type: 'structure',
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
        if (stack.length < 2) {
            throw new Error('Must be at least 2 items on stack');
        }
        const [func, obj] = stack;
        if (typeof func !== 'function') {
            throw new Error('Path must point to a function');
        }
        const boundFunc = func.bind(obj);
        const maybeResult = boundFunc(...msg.args);
        let result;
        if (maybeResult instanceof Promise) {
            result = await maybeResult;
        } else {
            result = maybeResult;
        }
        let object: PacketResult['object'] = undefined;
        if (typeof result === 'object') {
            let structure = Structurer.getStructure(result);
            if (structure === null || structure.type !== 'object') {
                throw new Error('not possible');
            }
            if (Object.keys(structure.structure).length > 0) {
                object = {
                    id: this.server.tracker.trackObjectFromClient(
                        result,
                        this.id
                    ),
                    structure,
                };
            }
        }

        return {
            type: 'result',
            result,
            object,
        };
    }

    private async createInstance(
        msg: MessageCreateInstance
    ): Promise<PartialPacket> {
        const [clazz] = this.server.traverse(msg.path);
        if (!isNetClass(clazz)) {
            throw new Error('Path must point to a class');
        }
        const instance = new clazz(...msg.args);
        this.idMap[msg.instanceID] = this.server.tracker.trackObjectFromClient(
            instance,
            this.id
        );
        return {
            type: 'success',
        };
    }
}

export default class NCServer<T> implements INCServer {
    private object: T;
    debugLogging: boolean;
    tracker: Tracker;
    structure: Structure;
    private nextClientID: number = 1;
    private clients: Record<string, Client<T>> = {};

    constructor(options: NCServerOptions<T>) {
        this.object = options.object;
        this.debugLogging = options.debugLogging ?? false;
        this.tracker = new Tracker();
        const struct = Structurer.getStructure(this.object);
        if (struct === null) {
            throw new Error('Invalid options.object');
        }
        this.structure = struct;
    }

    connect(socket: INCSocket): void {
        const id = this.nextClientID++;
        this.clients[id] = new Client(id, this, socket, () => {
            delete this.clients[id];
        });
    }

    traverse({ path, objectID }: CallPath): any[] {
        // const stack: any[] = [];
        // if (objectID != null) {
        //     if (!(objectID in this.trackedObjects)) {
        //         throw new Error(`Invalid objectID: ${objectID}`);
        //     }
        //     stack.push(this.trackedObjects[objectID].object);
        // } else {
        //     stack.push(this.object);
        // }
        // for (let part of path) {
        //     let obj = stack[0];
        //     if (!(part in obj)) {
        //         throw new Error(
        //             `Failed to resolve "${part}" in ${JSON.stringify(path)}`
        //         );
        //     }
        //     stack.unshift(obj[part]);
        // }
        // return stack;
        return [];
    }
}
