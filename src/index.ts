import initClient from './client/client';
import NCServer from './server';
import {
    INCClient,
    INCServer,
    INCSocket,
    NCClientOptions,
    NCServerOptions,
} from './types';
import { getClassData, INSTANCE_KEY } from './wrapper';

export default class NetClass {
    static createServer<T>(options: NCServerOptions<T>): INCServer {
        return new NCServer(options);
    }

    static async createClient<T>(
        socket: INCSocket,
        options?: NCClientOptions
    ): Promise<INCClient<T>> {
        return await initClient(socket, options ?? {});
    }

    constructor() {
        const classData = getClassData(new.target);
        const id = `internal-${classData.nextID++}`;
        classData.instanceMap[id] = this;
        const _this: any = this;
        _this[INSTANCE_KEY] = id;
    }
}
