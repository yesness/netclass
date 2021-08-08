import {
    FunctionRef,
    MessageCreateInstance,
    ObjectStructureMap,
    PacketStructure,
} from '../internalTypes';
import {
    ComplexStructure,
    FunctionStructure,
    ObjectMap,
    ObjectStructure,
    StructureValue,
} from '../structurer';
import { INCClient, INCSocket, NCClientOptions } from '../types';
import BaseClient from './base';

type UpsertState = {
    map: ObjectStructureMap;
    completedIDs: number[];
};

class NCClient<T> implements INCClient<T> {
    private nextID: number;
    private objects: Record<number, any>;
    private proxy: T;
    private pendingObjects: Array<Promise<void>> = [];

    constructor(private client: BaseClient, structure: PacketStructure) {
        this.nextID = 1;
        this.objects = {};
        this.proxy = this.getProxy(structure.value, {
            map: structure.newObjects,
            completedIDs: [],
        });
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
        switch (structure.type) {
            case 'function':
                return this.buildFunctionProxy(structure, upsert, {
                    funcObjectID: objectID,
                });
            case 'object':
                return this.buildObjectProxy(structure, upsert, objectID);
        }
    }

    private buildFunctionProxy(
        structure: FunctionStructure,
        upsert: UpsertState,
        functionRef: FunctionRef
    ): any {
        const _this = this;
        function ProxyFunc(...args: any[]) {
            if (new.target != null) {
                const instanceID = _this.nextID++;
                // TODO handle the promise
                _this.pendingObjects.push(
                    _this.createInstance({
                        instanceID,
                        functionRef,
                        args,
                    })
                );
                return _this.addFuncs({}, structure.instanceFuncs, instanceID);
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
        const proxy: any = {};
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
                    instanceFuncs: [],
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

    async resolveAll(): Promise<void> {
        console.log(this.pendingObjects.length);
        await Promise.all(
            this.pendingObjects.splice(0, this.pendingObjects.length)
        );
    }

    private async callFunc(
        functionRef: FunctionRef,
        args: any[]
    ): Promise<any> {
        const packet = await this.client.send({
            type: 'call_func',
            functionRef,
            args,
        });
        if (packet.type !== 'call_func_result') {
            throw new Error('Invalid response packet');
        }
        return this.getProxy(packet.value, {
            map: packet.newObjects,
            completedIDs: [],
        });
    }

    private async createInstance(
        args: Pick<MessageCreateInstance, 'instanceID' | 'functionRef' | 'args'>
    ): Promise<void> {
        const packet = await this.client.send({
            type: 'create_instance',
            ...args,
        });
        if (packet.type !== 'create_instance_result') {
            throw new Error('Invalid response packet');
        }
        // TODO handle newObjects
    }
}

export default async function initClient<T>(
    socket: INCSocket,
    options: NCClientOptions
): Promise<NCClient<T>> {
    const client = new BaseClient(socket, options?.debugLogging ?? false);
    const structure = await client.getStructure();
    return new NCClient(client, structure);
}
