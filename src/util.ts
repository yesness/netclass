import { INCSocket } from './types';

export type SocketSend<T> = (json: T) => void;

export function randomString(length: number): string {
    const alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let str = '';
    for (let i = 0; i < length; i++) {
        str += alpha[Math.floor(Math.random() * alpha.length)];
    }
    return str;
}

export function handleSocket<TSend, TReceive>(
    socket: INCSocket,
    callbacks: {
        onJSON: (json: TReceive) => void;
        onClose?: () => void;
    }
): SocketSend<TSend> {
    let closed = false;
    let buffer = '';
    socket.onData((data) => {
        if (closed) return;
        try {
            buffer += data.toString('utf-8');
            const spl = buffer.split('\n');
            buffer = spl.splice(spl.length - 1, 1)[0];
            for (let line of spl) {
                let json: TReceive;
                try {
                    json = JSON.parse(line);
                } catch (e) {
                    throw new Error(
                        `JSON error when parsing line "${line}": ${e.message}`
                    );
                }
                callbacks.onJSON(json);
            }
        } catch (e) {
            closed = true;
            console.error('Socket error', e);
            socket.close();
        }
    });
    socket.onClose(() => {
        closed = true;
        callbacks.onClose?.();
    });
    return (json) => {
        socket.send(Buffer.from(`${JSON.stringify(json)}\n`, 'utf-8'));
    };
}

export function isInstance(object: any): boolean {
    return object && object.constructor !== Object;
}
