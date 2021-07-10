import {
    Message,
    MessageCallFunc,
    MessageCreateInstance,
    Packet,
    PartialPacket,
    Structure,
} from './internalTypes';
import { ClassOf, INCServer, INCSocket, NCServerOptions } from './types';
import { getStructure, handleSocket, SocketSend } from './util';
import { getInstanceID, getInstanceMap } from './wrapper';

class Client<T> {
    private idMap: Record<string, string>;
    private send: SocketSend<Packet>;

    constructor(private server: NCServer<T>, socket: INCSocket) {
        this.idMap = {};
        this.send = handleSocket(socket, {
            onJSON: (msg: Message) => this.onMessage(msg),
        });
    }

    private onMessage(msg: Message) {
        console.debug('[SERVER] onMessage', JSON.stringify(msg, null, 2));
        this.messageHandler(msg)
            .then((packet) =>
                this.send({
                    ...packet,
                    msgID: msg.msgID,
                })
            )
            .catch((error) =>
                this.send({
                    type: 'error',
                    msgID: msg.msgID,
                    error:
                        error?.message ??
                        error?.toString() ??
                        '<no error message found>',
                })
            );
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
        const stack = this.server.traverse(msg.path, this.idMap);
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
        return {
            type: 'result',
            result,
        };
    }

    private async createInstance(
        msg: MessageCreateInstance
    ): Promise<PartialPacket> {
        const [clazz] = this.server.traverse(msg.path, this.idMap);
        if (typeof clazz !== 'function') {
            throw new Error('Path must point to a class');
        }
        const instance = new clazz(...msg.args);
        this.idMap[msg.instanceID] = getInstanceID(instance);
        return {
            type: 'success',
        };
    }
}

export default class NCServer<T> implements INCServer {
    private object: T;
    structure: Structure;

    constructor(options: NCServerOptions<T>) {
        this.object = options.object;
        const struct = getStructure(this.object);
        if (struct === null) {
            throw new Error('Invalid options.object');
        }
        this.structure = struct;
    }

    connect(socket: INCSocket): void {
        new Client(this, socket);
    }

    getInstances<T>(clazz: ClassOf<T>): T[] {
        const instanceMap = getInstanceMap(clazz);
        return Object.values(instanceMap);
    }

    traverse(
        path: MessageCallFunc['path'],
        idMap: Record<string, string>
    ): any[] {
        const stack: any[] = [this.object];
        for (let part of path) {
            let obj = stack[0];
            if (typeof part === 'string') {
                if (!(part in obj)) {
                    throw new Error(
                        `Failed to resolve "${part}" in ${JSON.stringify(path)}`
                    );
                }
                stack.unshift(obj[part]);
            } else {
                let iid = part.instanceID;
                if (iid in idMap) {
                    iid = idMap[iid];
                }
                const instanceMap = getInstanceMap(obj);
                if (!(iid in instanceMap)) {
                    throw new Error(`Invalid instance ID: ${iid}`);
                }
                stack.unshift(instanceMap[iid]);
            }
        }
        return stack;
    }
}
