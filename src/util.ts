import { Structure } from './internalTypes';
import { INCSocket } from './types';
import { isClass } from './wrapper';

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
    });
    return (json) => {
        socket.send(Buffer.from(`${JSON.stringify(json)}\n`, 'utf-8'));
    };
}

function getAllFuncs(toCheck: any): string[] {
    const props: string[] = [];
    let obj = toCheck;
    do {
        props.push(...Object.getOwnPropertyNames(obj));
    } while ((obj = Object.getPrototypeOf(obj)));

    const ignore = [
        'caller',
        'callee',
        'arguments',
        '__defineGetter__',
        '__defineSetter__',
        '__lookupGetter__',
        '__lookupSetter__',
        'apply',
        'bind',
        'call',
        'constructor',
        'hasOwnProperty',
        'isPrototypeOf',
        'propertyIsEnumerable',
        'toLocaleString',
        'toString',
        'valueOf',
    ];

    return props.sort().filter((e, i, arr) => {
        if (ignore.includes(e)) return false;
        if (e != arr[i + 1] && typeof toCheck[e] == 'function') return true;
    });
}

export function getStructure(object: any): Structure | null {
    const objIsClass = isClass(object);
    if (objIsClass || typeof object === 'object') {
        const structure: Record<string, Structure> = {};
        getAllFuncs(object).forEach((key) => {
            const struct = getStructure(object[key]);
            if (struct !== null) {
                structure[key] = struct;
            }
        });
        if (objIsClass) {
            const instanceStructure = getStructure(object.prototype);
            if (instanceStructure === null) {
                throw new Error('Instance structure cannot be null');
            }
            if (instanceStructure.type !== 'object') {
                throw new Error('Instance structure must be type object');
            }
            return {
                type: 'class',
                classStructure: structure,
                instanceStructure: instanceStructure.structure,
            };
        } else {
            return {
                type: 'object',
                structure,
            };
        }
    } else if (typeof object === 'function') {
        return { type: 'function' };
    }
    return null;
}
