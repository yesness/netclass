import { Structure } from './internalTypes';
import { INCSocket } from './types';
import { isClass, wrapClass } from './wrapper';

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

const EmptyClass = wrapClass(class EmptyClass {});
const classStop = Object.getPrototypeOf(EmptyClass);
const instanceStop = Object.getPrototypeOf(EmptyClass.prototype);
const defaultClassProps = getAllProps(EmptyClass);
const defaultInstanceProps = getAllProps(EmptyClass.prototype);

function getAllProps(toCheck: any): string[] {
    const props: string[] = [];
    let obj = toCheck;
    while (true) {
        if (!obj || obj === classStop || obj === instanceStop) break;
        props.push(...Object.getOwnPropertyNames(obj));
        obj = Object.getPrototypeOf(obj);
    }
    return props.sort().filter((e, i, arr) => {
        if (e != arr[i + 1]) return true;
    });
}

function getStructureHelper(
    object: any,
    type: 'class' | 'instance' | 'object'
): Record<string, Structure> {
    const structure: Record<string, Structure> = {};
    let props = getAllProps(object);
    for (let prop of props) {
        if (
            (type === 'class' && defaultClassProps.includes(prop)) ||
            (type === 'instance' && defaultInstanceProps.includes(prop))
        )
            continue;
        const struct = getStructure(object[prop]);
        if (struct !== null) {
            structure[prop] = struct;
        }
    }
    return structure;
}

export function getStructure(object: any): Structure | null {
    if (object == null) return null;
    const objIsClass = isClass(object);
    if (objIsClass || typeof object === 'object') {
        if (objIsClass) {
            return {
                type: 'class',
                classStructure: getStructureHelper(object, 'class'),
                instanceStructure: getStructureHelper(
                    object.prototype,
                    'instance'
                ),
            };
        } else {
            return {
                type: 'object',
                structure: getStructureHelper(object, 'object'),
            };
        }
    } else if (typeof object === 'function') {
        return { type: 'function' };
    }
    return null;
}
