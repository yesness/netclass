import { CallPath, MessageCreateInstance } from '../internalTypes';
import { FunctionStructure, Structure } from '../structurer';
import { INCClient, INCSocket, NCClientOptions } from '../types';
import BaseClient from './base';

class NCClient<T> implements INCClient<T> {
    private nextID: number;
    private proxy: T;
    private pendingObjects: Array<Promise<void>> = [];

    constructor(private client: BaseClient, structure: Structure) {
        this.nextID = 1;
        this.proxy = this.buildProxy(structure, null);
    }

    private buildProxy(structure: Structure, path: CallPath | null): any {
        switch (structure.type) {
            case 'function':
                return this.buildFunctionProxy(
                    structure,
                    this.assertPath(path, structure)
                );
            case 'object':
                return this.addStructure(
                    {},
                    structure.structure,
                    this.maybePath(path, structure)
                );
            case 'simple':
                return structure.value;
        }
    }

    private addStructure(
        proxy: any,
        struct: Record<string, Structure>,
        path: CallPath | null
    ): any {
        Object.keys(struct).forEach((key) => {
            let keyPath = null;
            if (path !== null) {
                keyPath = {
                    objectID: path.objectID,
                    path: [...path.path, key],
                };
            }
            proxy[key] = this.buildProxy(struct[key], keyPath);
        });
        return proxy;
    }

    private buildFunctionProxy(
        structure: FunctionStructure,
        path: CallPath
    ): any {
        const _this = this;
        function ProxyFunc(...args: any[]) {
            if (new.target != null) {
                const instanceID = _this.nextID++;
                // TODO handle the promise
                _this.pendingObjects.push(
                    _this.createInstance({
                        instanceID,
                        path,
                        args,
                    })
                );
                return _this.buildProxy(
                    {
                        type: 'object',
                        structure: structure.instanceStructure,
                    },
                    {
                        objectID: instanceID,
                        path: [],
                    }
                );
            } else {
                return _this.callFunc(path, args);
            }
        }
        return this.addStructure(ProxyFunc, structure.structure, path);
    }

    private assertPath(
        path: CallPath | null,
        structure: { objectID?: number }
    ): CallPath {
        const ret = this.maybePath(path, structure);
        if (ret === null) {
            throw new Error('Path cannot be null');
        }
        return ret;
    }

    private maybePath(
        path: CallPath | null,
        { objectID }: { objectID?: number }
    ): CallPath | null {
        if (objectID != null) {
            return {
                path: [],
                objectID,
            };
        } else {
            return path;
        }
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

    private async callFunc(path: CallPath, args: any[]): Promise<any> {
        const packet = await this.client.send({
            type: 'call_func',
            path,
            args,
        });
        if (packet.type !== 'call_func_result') {
            throw new Error('Invalid response packet');
        }
        return this.buildProxy(packet.structure, null);
    }

    private async createInstance(
        args: Pick<MessageCreateInstance, 'instanceID' | 'path' | 'args'>
    ): Promise<void> {
        const packet = await this.client.send({
            type: 'create_instance',
            ...args,
        });
        if (packet.type !== 'success') {
            throw new Error('Invalid response packet');
        }
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
