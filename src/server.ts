import DelayProxy from './delayProxy';
import {
    FunctionRef,
    Message,
    MessageCallFunc,
    Packet,
    PartialPacket,
} from './internalTypes';
import { ObjectStructureMap, StructureValue } from './structureTypes';
import Tracker from './tracker';
import { INCServer, INCSocket, NCServerOptions } from './types';
import { handleSocket, SocketSend } from './util';

type SyncOptions = {
    recursive?: boolean; // default: true
};

class Client<T> {
    private idMap: Record<number, number>;
    private send: SocketSend<Packet>;
    private syncedObjectIDs: number[];

    constructor(
        private id: number,
        private server: NCServer<T>,
        socket: INCSocket
    ) {
        this.idMap = {};
        const send = handleSocket(socket, {
            onJSON: (msg: Message) => this.onMessage(msg),
            onClose: () => {
                this.server.tracker.dereferenceAllObjects({
                    clientID: this.id,
                });
            },
        });
        this.send = (packet: Packet) => {
            if (this.server.debugLogging) {
                console.debug('[SERVER] send', JSON.stringify(packet, null, 2));
            }
            send(packet);
        };
        this.syncedObjectIDs = [];
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
            case 'init':
                return await this.init();
            case 'call_func':
                return await this.callFunc(msg);
        }
    }

    private async init(): Promise<PartialPacket> {
        return {
            type: 'init',
            structure: {
                value: this.server.structure,
                newObjects: this.getObjectStructuresAndSync(
                    this.server.structure
                ),
            },
            idProperty: this.server.tracker.infoProperty,
        };
    }

    private async callFunc(msg: MessageCallFunc): Promise<PartialPacket> {
        const func = this.getFunction(msg.functionRef);
        const args = msg.args.map((arg) => {
            if (arg.type === 'raw') {
                return arg.arg;
            } else {
                return this.server.tracker.getTrackedObject(arg.objectID)
                    .object;
            }
        });
        const maybeResult = func(...args);
        let result;
        if (maybeResult instanceof Promise) {
            result = await maybeResult;
        } else {
            result = maybeResult;
        }
        const value = this.server.tracker.getValue(result);
        if (value.type === 'reference') {
            this.server.tracker.referenceObject(
                { clientID: this.id },
                value.objectID
            );
        }
        return {
            type: 'call_func_result',
            result: {
                value,
                newObjects: this.getObjectStructuresAndSync(value),
            },
        };
    }

    private getObjectStructuresAndSync(
        value: StructureValue
    ): ObjectStructureMap {
        if (
            value.type === 'simple' ||
            this.syncedObjectIDs.includes(value.objectID)
        ) {
            return {};
        }
        const map = this.server.tracker.getObjectStructureMap(value.objectID);
        for (const strID of Object.keys(map)) {
            const objID = parseInt(strID);
            if (this.syncedObjectIDs.includes(objID)) {
                delete map[objID];
            } else {
                this.syncedObjectIDs.push(objID);
            }
        }
        this.syncedObjectIDs.push(value.objectID);
        return map;
    }

    private getFunction(ref: FunctionRef): any {
        const assertFunc = (obj: any) => {
            if (typeof obj !== 'function') {
                throw new Error('Invalid function ref: must point to function');
            }
            return obj;
        };
        if ('funcObjectID' in ref) {
            return assertFunc(
                this.server.tracker.getTrackedObject(ref.funcObjectID).object
            );
        } else {
            let { objectID } = ref;
            if (objectID in this.idMap) {
                objectID = this.idMap[objectID];
            }
            const obj = this.server.tracker.getTrackedObject(objectID).object;
            const func = assertFunc(obj[ref.funcName]);
            return func.bind(obj);
        }
    }
}

export default class NCServer<T> implements INCServer {
    debugLogging: boolean;
    tracker: Tracker;
    structure: StructureValue;
    private nextClientID: number = 1;

    constructor(options: NCServerOptions<T>) {
        this.debugLogging = options.debugLogging ?? false;
        this.tracker = new Tracker(
            options.netclassPropertyName ?? '_netclass_info'
        );
        this.structure = this.tracker.getValue(options.object);
        if (this.structure.type === 'reference') {
            this.tracker.referenceObject(
                { type: 'persist' },
                this.structure.objectID
            );
        }
    }

    connect(socket: INCSocket): void {
        new Client(this.nextClientID++, this, socket);
    }

    static sync<T extends object>(object: T, options?: SyncOptions): T {
        if (options?.recursive ?? true) {
            const obj: any = object;
            for (const [key, value] of Object.entries(object)) {
                obj[key] = this.sync(value, options);
            }
        }
        if (DelayProxy.isProxy(object)) {
            return object;
        } else {
            return DelayProxy.create(object);
        }
    }
}
