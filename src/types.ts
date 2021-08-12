export type NCServerOptions<T> = {
    object: T;
    netclassPropertyName?: string; // default: "_netclass_info"
    debugLogging?: boolean;
};

export type NCClientOptions = {
    debugLogging?: boolean;
};

export interface INCSocket {
    send(data: Buffer): void;
    close(): void;
    onData(cb: (data: Buffer) => void): void;
    onClose(cb: () => void): void;
}

export interface INCServer {
    connect(socket: INCSocket): void;
}

export interface INCClient<T> {
    getObject(): T;
}
