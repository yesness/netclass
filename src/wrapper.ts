import { ClassOf } from './types';

const CLASS_KEY = '__netclass_instances';
const INSTANCE_KEY = '__netclass_id';

interface IPrototype {
    prototype: any;
}

export function wrapClass<T extends IPrototype>(clazz: T): T {
    let nextID = 1;
    class Wrapped {
        constructor(...args: any[]) {
            const id = `internal-${nextID++}`;
            anyWrapped[CLASS_KEY][id] = this;
            const _this: any = this;
            _this[INSTANCE_KEY] = id;
            const construct = clazz.prototype.constructor.bind(this);
            construct(...args);
        }
    }
    Wrapped.prototype = clazz.prototype;
    const anyWrapped: any = Wrapped;
    const anyClass: any = clazz;
    Object.keys(anyClass).forEach((key) => {
        anyWrapped[key] = anyClass[key];
    });
    anyWrapped[CLASS_KEY] = {};
    return anyWrapped;
}

export function getInstanceMap<T>(clazz: ClassOf<T>): Record<string, T> {
    const anyClass: any = clazz;
    return anyClass[CLASS_KEY] ?? {};
}

export function getInstanceID(instance: any): string {
    if (INSTANCE_KEY in instance) {
        return instance[INSTANCE_KEY];
    }
    throw new Error('No instance ID found for provided instance');
}

export function isClass(obj: any): boolean {
    if (typeof obj !== 'function') return false;
    return CLASS_KEY in obj;
}
