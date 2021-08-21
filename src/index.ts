import { IYNSocket } from '@yesness/socket';
import initClient from './client/client';
import DelayProxy from './delayProxy';
import NCServer from './server';
import Tracker from './tracker';
import {
    INCClient,
    INCServer,
    NCClientOptions,
    NCServerOptions,
} from './types';

type SyncOptions = {
    recursive?: boolean; // default: true
};

export class NCUtil {
    static sync<T extends object>(object: T, options?: SyncOptions): T {
        if (options?.recursive ?? true) {
            const obj: any = object;
            for (const [key, value] of Object.entries(object)) {
                if (!Tracker.isTrackable(value)) continue;
                obj[key] = this.sync(value, options);
            }
        }
        if (DelayProxy.isProxy(object)) {
            return object;
        } else {
            return DelayProxy.create(object);
        }
    }

    static tracked<T extends object>(object: T): T {
        Tracker.setTracked(object, true);
        return object;
    }

    static untracked<T extends object>(object: T): T {
        Tracker.setTracked(object, false);
        return object;
    }
}

export default class NetClass {
    static createServer<T>(options: NCServerOptions<T>): INCServer {
        return new NCServer(options);
    }

    static async createClient<T>(
        socket: IYNSocket,
        options?: NCClientOptions
    ): Promise<INCClient<T>> {
        return await initClient(socket, options ?? {});
    }
}
