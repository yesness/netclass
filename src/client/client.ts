import { CallPath, Structure } from '../internalTypes';
import { INCClient, INCSocket } from '../types';
import BaseClient from './base';

class NCClient<T> implements INCClient<T> {
    private nextID: number;
    private proxy: T;

    constructor(private client: BaseClient, structure: Structure) {
        this.nextID = 1;
        this.proxy = this.buildProxy(structure, []);
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
            case 'class':
                const { instanceStructure } = structure;
                const _this = this;
                class ProxyClass {
                    constructor(...args: any[]) {
                        const instanceID = `${_this.nextID++}`;
                        // TODO handle the promise
                        _this.client.createInstance({
                            instanceID,
                            path,
                            args,
                        });
                        return _this.buildProxy(
                            {
                                type: 'object',
                                structure: instanceStructure,
                            },
                            [...path, { instanceID }]
                        );
                    }
                }
                struct = structure.classStructure;
                proxy = ProxyClass;
                break;
        }
        Object.keys(struct).forEach((key) => {
            proxy[key] = this.buildProxy(struct[key], [...path, key]);
        });
        return proxy;
    }

    getObject(): T {
        return this.proxy;
    }

    delete(instance: any): void {
        throw new Error('Method not implemented.');
    }
}

export default async function initClient<T>(
    socket: INCSocket
): Promise<NCClient<T>> {
    const client = new BaseClient(socket);
    const structure = await client.getStructure();
    return new NCClient(client, structure);
}
