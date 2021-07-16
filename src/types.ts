export type ClassOf<T> = { new (...args: any[]): T };

export type NCServerOptions<T> = {
    object: T;
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
    getInstances<T>(clazz: ClassOf<T>): T[];
}

export interface INCClient<T> {
    getObject(): T;
    delete(instance: any): void;
}
