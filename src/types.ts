import { IYNSocket } from '@yesness/socket';

export type NCServerOptions<T> = {
    object: T;
    includeUnderscoreProperties?: boolean; // default: false
    trackFunctionReturnValues?: boolean; // default: true
    netclassPropertyName?: string; // default: "_netclass_info"
    debugLogging?: boolean;
};

export type NCClientOptions = {
    debugLogging?: boolean;
};

export interface INCServer {
    connect(socket: IYNSocket): void;
}

export interface INCClient<T> {
    getObject(): T;
}
