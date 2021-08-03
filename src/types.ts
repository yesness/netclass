export type NCServerOptions<T> = {
    object: T;
    debugLogging?: boolean;
    garbageCollectInterval?: number; // in milliseconds, defaults to 10 minutes
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
    garbageCollect(): void;
}

export interface INCClient<T> {
    getObject(): T;
    resolveAll(): Promise<void>;
}
