import { IYNSocket } from '@yesness/socket';
import { FunctionRef, PacketInit, SPacket } from '../internalTypes';
import {
    ComplexStructure,
    FunctionStructure,
    ObjectMap,
    ObjectStructure,
    ObjectStructureMap,
    StructureValue,
    UpdateBundle,
    ValueBundle,
} from '../structureTypes';
import { INCClient, NCClientOptions } from '../types';
import BaseClient, { IBaseClient } from './base';

type UpsertState = {
    map: ObjectStructureMap;
    completedIDs: number[];
};

class NCClient<T> implements INCClient<T> {
    private objects: Record<number, any>;
    private proxy: T;
    private idProperty: string;

    constructor(
        private client: IBaseClient,
        { valueBundle, idProperty }: PacketInit
    ) {
        this.objects = {};
        this.idProperty = idProperty;
        this.proxy = this.convertValueBundle(valueBundle);
        client.on('spacket', (packet) => this.onSPacket(packet));
    }

    private onSPacket(packet: SPacket) {
        switch (packet.type) {
            case 'update':
                this.applyUpdateBundle(packet.bundle);
                break;
        }
    }

    private getProxy(value: StructureValue, upsert: UpsertState): any {
        if (value.type === 'simple') {
            return value.value;
        } else {
            if (
                value.objectID in upsert.map &&
                !upsert.completedIDs.includes(value.objectID)
            ) {
                this.objects[value.objectID] = this.buildProxy(
                    upsert.map[value.objectID],
                    upsert,
                    value.objectID
                );
                upsert.completedIDs.push(value.objectID);
            }
            return this.objects[value.objectID];
        }
    }

    private buildProxy(
        structure: ComplexStructure,
        upsert: UpsertState,
        objectID: number
    ): any {
        let obj;
        switch (structure.type) {
            case 'function':
                obj = this.buildFunctionProxy(structure, upsert, {
                    funcObjectID: objectID,
                });
                break;
            case 'object':
                obj = this.buildObjectProxy(structure, upsert, objectID);
                break;
        }
        Object.defineProperty(obj, this.idProperty, { value: objectID });
        return obj;
    }

    private buildFunctionProxy(
        structure: FunctionStructure,
        upsert: UpsertState,
        functionRef: FunctionRef
    ): any {
        const _this = this;
        function ProxyFunc(...args: any[]) {
            if (new.target != null) {
                throw new Error(
                    'Instance creation with "new" is not supported. Instead' +
                        ' call a static async function that creates and returns an instance.'
                );
            } else {
                return _this.callFunc(functionRef, args);
            }
        }
        return this.addStructure(ProxyFunc, structure.map, upsert);
    }

    private buildObjectProxy(
        structure: ObjectStructure,
        upsert: UpsertState,
        objectID: number
    ): any {
        let proxy: any = {};
        if (structure.array !== null) {
            proxy = structure.array.map((value) =>
                this.getProxy(value, upsert)
            );
        }
        this.addStructure(proxy, structure.map, upsert);
        this.addFuncs(proxy, structure.funcs, objectID);
        return proxy;
    }

    private addStructure(proxy: any, map: ObjectMap, upsert: UpsertState): any {
        Object.keys(map).forEach((key) => {
            proxy[key] = this.getProxy(map[key], upsert);
        });
        return proxy;
    }

    private addFuncs(proxy: any, funcs: string[], objectID: number): any {
        for (let func of funcs) {
            proxy[func] = this.buildFunctionProxy(
                {
                    type: 'function',
                    map: {},
                },
                {
                    map: {},
                    completedIDs: [],
                },
                { objectID, funcName: func }
            );
        }
        return proxy;
    }

    getObject(): T {
        return this.proxy;
    }

    private async callFunc(
        functionRef: FunctionRef,
        args: any[]
    ): Promise<any> {
        const packet = await this.client.send({
            type: 'call_func',
            functionRef,
            args: args.map((arg) => {
                if (typeof arg === 'object' && this.idProperty in arg) {
                    return {
                        type: 'reference',
                        objectID: arg[this.idProperty],
                    };
                } else {
                    return {
                        type: 'raw',
                        arg,
                    };
                }
            }),
        });
        if (packet.type !== 'call_func_result') {
            throw new Error('Invalid response packet');
        }
        for (const trackArg of packet.trackArgs) {
            this.objects[trackArg.objectID] = args[trackArg.idx];
        }
        this.applyUpdateBundle(packet.updateBundle);
        return this.convertValueBundle(packet.valueBundle);
    }

    private convertValueBundle({ value, newObjects }: ValueBundle): any {
        return this.getProxy(value, {
            map: newObjects,
            completedIDs: [],
        });
    }

    private applyUpdateBundle({ updates, newObjects }: UpdateBundle) {
        for (const [strID, update] of Object.entries(updates)) {
            const objID = parseInt(strID);
            const object = this.objects[objID];
            for (const key of update.deleted) {
                delete object[key];
            }
            for (const [key, value] of Object.entries(update.map)) {
                object[key] = this.convertValueBundle({ value, newObjects });
            }
        }
    }
}

export default async function initClient<T>(
    socket: IYNSocket,
    options: NCClientOptions
): Promise<NCClient<T>> {
    const client = new BaseClient(socket, options?.debugLogging ?? false);
    const initPacket = await client.init();
    return new NCClient(client, initPacket);
}
