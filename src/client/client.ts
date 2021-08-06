import { CallPath } from '../internalTypes';
import { Structure } from '../structurer';
import { INCClient, INCSocket, NCClientOptions } from '../types';
import BaseClient from './base';

class NCClient<T> implements INCClient<T> {
    private nextID: number;
    private proxy: T;
    private pendingObjects: Array<Promise<void>> = [];

    constructor(private client: BaseClient, structure: Structure) {
        this.nextID = 1;
        this.proxy = this.buildProxy(structure, { path: [] });
    }

    private buildProxy(structure: Structure, path: CallPath): any {
        let struct: Record<string, Structure>;
        let proxy: any;
        switch (structure.type) {
            case 'function':
                return async (...args: any[]) => {
                    return await this.client.callFunc(path, args);
                };
            case 'object':
                struct = structure.structure;
                proxy = {};
                break;
            case 'function':
                const { instanceStructure } = structure;
                const _this = this;
                class ProxyClass {
                    constructor(...args: any[]) {
                        const instanceID = _this.nextID++;
                        // TODO handle the promise
                        _this.pendingObjects.push(
                            _this.client.createInstance({
                                instanceID,
                                path,
                                args,
                            })
                        );
                        return _this.buildProxy(
                            {
                                type: 'object',
                                structure: instanceStructure,
                            },
                            {
                                objectID: instanceID,
                                path: [],
                            }
                        );
                    }
                }
                struct = structure.structure;
                proxy = ProxyClass;
                break;
            case 'simple':
                struct = {};
                // TODO
                break;
        }
        Object.keys(struct).forEach((key) => {
            proxy[key] = this.buildProxy(struct[key], {
                objectID: path.objectID,
                path: [...path.path, key],
            });
        });
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
}

export default async function initClient<T>(
    socket: INCSocket,
    options: NCClientOptions
): Promise<NCClient<T>> {
    const client = new BaseClient(socket, options?.debugLogging ?? false);
    const structure = await client.getStructure();
    return new NCClient(client, structure);
}
