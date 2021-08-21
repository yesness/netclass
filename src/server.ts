import { IYNSocket } from '@yesness/socket';
import {
    FunctionRef,
    Message,
    MessageCallFunc,
    Packet,
    PacketCallFuncResult,
    PartialPacket,
} from './internalTypes';
import {
    ObjectStructureMap,
    ObjectUpdateMap,
    StructureValue,
    UpdateBundle,
    ValueBundle,
} from './structureTypes';
import Tracker from './tracker';
import { INCServer, NCServerOptions } from './types';
import { handleSocket, SocketSend } from './util';

class Client<T> {
    private idMap: Record<number, number>;
    private send: SocketSend<Packet>;
    syncedObjectIDs: number[];

    constructor(private server: NCServer<T>, socket: IYNSocket) {
        this.idMap = {};
        const send = handleSocket<Packet, Message>(socket, {
            onJSON: (msg: Message) => this.onMessage(msg),
            onClose: () => this.server.onDisconnect(this),
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
            valueBundle: this.getValueBundle(this.server.structure),
            idProperty: this.server.tracker.infoProperty,
        };
    }

    private async callFunc(msg: MessageCallFunc): Promise<PartialPacket> {
        const { tracker } = this.server;
        const func = this.getFunction(msg.functionRef);
        const args = msg.args.map((arg) => {
            if (arg.type === 'raw') {
                return arg.arg;
            } else {
                return tracker.getTrackedObject(arg.objectID).object;
            }
        });
        const maybeResult = func(...args);
        let result;
        if (maybeResult instanceof Promise) {
            result = await maybeResult;
        } else {
            result = maybeResult;
        }
        const value = tracker.getFunctionReturnValue(
            result,
            this.server.trackFunctionReturnValues
        );
        const updates = tracker.popUpdates();
        for (const client of this.server.clients) {
            if (client !== this) {
                client.sendUpdates(updates);
            }
        }
        const trackArgs: PacketCallFuncResult['trackArgs'] = [];
        const updateBundle = this.getUpdateBundle(updates);
        msg.args.forEach((arg, idx) => {
            if (arg.type === 'raw' && tracker.isTracked(arg.arg)) {
                const objectID = tracker.getTrackedObjectID(arg.arg);
                trackArgs.push({
                    idx,
                    objectID,
                });
                delete updateBundle.newObjects[objectID]; // TODO this is a little messy
            }
        });
        return {
            type: 'call_func_result',
            valueBundle: this.getValueBundle(value),
            trackArgs,
            updateBundle,
        };
    }

    private getValueBundle(value: StructureValue): ValueBundle {
        let newObjects: ObjectStructureMap = {};
        if (value.type === 'reference') {
            newObjects = this.updateSyncedObjectIDs(
                this.server.tracker.getObjectStructureMap(
                    value.objectID,
                    this.syncedObjectIDs
                )
            );
        }
        return { value, newObjects };
    }

    private sendUpdates(updates: ObjectUpdateMap) {
        const bundle = this.getUpdateBundle(updates);
        if (
            Object.keys(bundle.newObjects).length +
                Object.keys(bundle.updates).length ===
            0
        ) {
            return;
        }
        this.send({
            type: 'update',
            bundle,
        });
    }

    private getUpdateBundle(updates: ObjectUpdateMap): UpdateBundle {
        let newObjects: ObjectStructureMap = {};
        for (const [strID, value] of Object.entries(updates)) {
            const objID = parseInt(strID);
            if (!this.syncedObjectIDs.includes(objID)) continue;
            for (const structVal of Object.values(value.map)) {
                if (structVal.type === 'reference') {
                    newObjects = {
                        ...newObjects,
                        ...this.server.tracker.getObjectStructureMap(
                            structVal.objectID,
                            this.syncedObjectIDs
                        ),
                    };
                }
            }
        }
        return {
            updates,
            newObjects: this.updateSyncedObjectIDs(newObjects),
        };
    }

    private updateSyncedObjectIDs(map: ObjectStructureMap): ObjectStructureMap {
        this.syncedObjectIDs = this.syncedObjectIDs.concat(
            Object.keys(map).map((strID) => parseInt(strID))
        );
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
    clients: Client<T>[] = [];
    trackFunctionReturnValues: boolean;

    constructor(options: NCServerOptions<T>) {
        this.debugLogging = options.debugLogging ?? false;
        this.tracker = new Tracker(
            options.netclassPropertyName ?? '_netclass_info',
            !(options.includeUnderscoreProperties ?? false)
        );
        this.structure = this.tracker.getValue(options.object);
        this.trackFunctionReturnValues =
            options.trackFunctionReturnValues ?? true;
    }

    connect(socket: IYNSocket): void {
        const client = new Client(this, socket);
        this.clients.push(client);
    }

    onDisconnect(client: Client<T>) {
        const idx = this.clients.indexOf(client);
        if (idx === -1) {
            throw new Error('Client disconnected but was not tracked');
        }
        this.clients.splice(idx, 1);
        let rootIDs = [];
        if (this.structure.type === 'reference') {
            rootIDs.push(this.structure.objectID);
        }
        for (const client of this.clients) {
            rootIDs = rootIDs.concat(client.syncedObjectIDs);
        }
        this.tracker.garbageCollect(rootIDs);
    }
}
