import initClient from './client/client';
import NCServer from './server';
import { INCClient, INCServer, INCSocket, NCServerOptions } from './types';

export default class NetClass {
    static createServer<T>(options: NCServerOptions<T>): INCServer {
        return new NCServer(options);
    }

    static async createClient<T>(socket: INCSocket): Promise<INCClient<T>> {
        return await initClient(socket);
    }
}
