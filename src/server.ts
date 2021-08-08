import {
    FunctionRef,
    Message,
    MessageCallFunc,
    MessageCreateInstance,
    ObjectStructureMap,
    Packet,
    PartialPacket,
} from './internalTypes';
import Structurer, { GetValueReturn } from './structurer';
import Tracker from './tracker';
import { INCServer, INCSocket, NCServerOptions } from './types';
import { handleSocket, SocketSend } from './util';

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
        this.send = handleSocket(socket, {
            onJSON: (msg: Message) => this.onMessage(msg),
            onClose: () => {
                this.server.tracker.dereferenceAllObjects({
                    clientID: this.id,
                });
            },
        });
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
            case 'get_structure':
                return {
                    type: 'get_structure_result',
                    value: this.server.structure.value,
                    newObjects: this.getObjectStructuresAndSync(
                        this.server.structure.objectIDs
                    ),
                };
            case 'call_func':
                return await this.callFunc(msg);
            case 'create_instance':
                return await this.createInstance(msg);
        }
    }

    private async callFunc(msg: MessageCallFunc): Promise<PartialPacket> {
        const func = this.getFunction(msg.functionRef);
        const maybeResult = func(...msg.args);
        let result;
        if (maybeResult instanceof Promise) {
            result = await maybeResult;
        } else {
            result = maybeResult;
        }
        const { value, objectIDs } = Structurer.getValue(
            result,
            this.server.tracker
        );
        this.server.tracker.referenceObjects({ clientID: this.id }, objectIDs);
        return {
            type: 'call_func_result',
            value,
            newObjects: this.getObjectStructuresAndSync(objectIDs),
        };
    }

    private async createInstance(
        msg: MessageCreateInstance
    ): Promise<PartialPacket> {
        const clazz = this.getFunction(msg.functionRef);
        const instance = new clazz(...msg.args);
        const objectIDs: number[] = [];
        this.idMap[msg.instanceID] = this.server.tracker.trackObject(
            instance,
            objectIDs
        );
        this.server.tracker.referenceObjects({ clientID: this.id }, objectIDs);
        return {
            type: 'create_instance_result',
            newObjects: this.getObjectStructuresAndSync(objectIDs),
        };
    }

    private getObjectStructuresAndSync(
        objectIDs: number[]
    ): ObjectStructureMap {
        const map: ObjectStructureMap = {};
        for (let objID of objectIDs) {
            if (this.syncedObjectIDs.includes(objID)) continue;
            this.syncedObjectIDs.push(objID);
            map[objID] = this.server.tracker.getTrackedObject(objID).structure;
        }
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
    structure: GetValueReturn;
    private nextClientID: number = 1;

    constructor(options: NCServerOptions<T>) {
        this.debugLogging = options.debugLogging ?? false;
        this.tracker = new Tracker();
        this.structure = Structurer.getValue(options.object, this.tracker);
        this.tracker.referenceObjects(
            { type: 'persist' },
            this.structure.objectIDs
        );
    }

    connect(socket: INCSocket): void {
        new Client(this.nextClientID++, this, socket);
    }
}
