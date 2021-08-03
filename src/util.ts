import NetClass from '.';
import { Structure } from './internalTypes';
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

class EmptyClass {}
class GetStructureHelper {
    static classStop = Object.getPrototypeOf(EmptyClass);
    static instanceStop = Object.getPrototypeOf(EmptyClass.prototype);
    // Pass in 'object' to include all props
    static defaultClassProps = GetStructureHelper.getAllProps(
        EmptyClass,
        'object'
    );
    static defaultInstanceProps = GetStructureHelper.getAllProps(
        EmptyClass.prototype,
        'object'
    );
    static defaultFunctionProps = GetStructureHelper.getAllProps(function () {},
    'object');

    static getStructure(object: any): Structure | null {
        if (object == null) return null;

        // Handle net classes
        if (isNetClass(object)) {
            return {
                type: 'class',
                classStructure: GetStructureHelper.getStructureHelper(
                    object,
                    'class'
                ),
                instanceStructure: GetStructureHelper.getStructureHelper(
                    object.prototype,
                    'instance'
                ),
            };
        }

        // Handle objects
        else if (typeof object === 'object') {
            return {
                type: 'object',
                structure: GetStructureHelper.getStructureHelper(
                    object,
                    'object'
                ),
            };
        }

        // Handle functions
        else if (typeof object === 'function') {
            const structure = GetStructureHelper.getStructureHelper(
                object,
                'class'
            );
            if (Object.keys(structure).length > 0) {
                return {
                    type: 'object',
                    structure,
                };
            }
            return { type: 'function' };
        }

        return null;
    }

    static getAllProps(
        toCheck: any,
        type: 'class' | 'instance' | 'object'
    ): string[] {
        const props: string[] = [];
        let obj = toCheck;
        while (true) {
            if (
                !obj ||
                obj === GetStructureHelper.classStop ||
                obj === GetStructureHelper.instanceStop ||
                obj === NetClass
            )
                break;
            props.push(...Object.getOwnPropertyNames(obj));
            obj = Object.getPrototypeOf(obj);
        }
        return props.sort().filter((prop, idx, arr) => {
            if (
                (type === 'class' &&
                    GetStructureHelper.isClassOrFunctionProp(prop)) ||
                (type === 'instance' &&
                    GetStructureHelper.defaultInstanceProps.includes(prop))
            ) {
                return false;
            }
            return prop != arr[idx + 1];
        });
    }

    static getStructureHelper(
        object: any,
        type: 'class' | 'instance' | 'object'
    ): Record<string, Structure> {
        const structure: Record<string, Structure> = {};
        const props = GetStructureHelper.getAllProps(object, type);
        for (let prop of props) {
            const struct = getStructure(object[prop]);
            if (struct !== null) {
                structure[prop] = struct;
            }
        }
        return structure;
    }

    static isClassOrFunctionProp(prop: string): boolean {
        return (
            GetStructureHelper.defaultClassProps.includes(prop) ||
            GetStructureHelper.defaultFunctionProps.includes(prop)
        );
    }
}

export function getStructure(object: any): Structure | null {
    return GetStructureHelper.getStructure(object);
}

export function isNetClass(obj: any): boolean {
    if (typeof obj !== 'function') return false;
    return obj.prototype instanceof NetClass;
}
