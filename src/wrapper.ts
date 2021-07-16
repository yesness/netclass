import NetClass from '.';
import { ClassOf } from './types';

export const CLASS_KEY = '__netclass_data';
export const INSTANCE_KEY = '__netclass_id';

export function getClassData<T>(clazz: ClassOf<T>): {
    nextID: number;
    instanceMap: Record<string, T>;
} {
    const anyClass: any = clazz;
    if (!(CLASS_KEY in anyClass)) {
        anyClass[CLASS_KEY] = {
            nextID: 1,
            instanceMap: {},
        };
    }
    return anyClass[CLASS_KEY];
}

export function getInstanceID(instance: any): string {
    if (INSTANCE_KEY in instance) {
        return instance[INSTANCE_KEY];
    }
    throw new Error('No instance ID found for provided instance');
}

export function isNetClass(obj: any): boolean {
    if (typeof obj !== 'function') return false;
    return obj.prototype instanceof NetClass;
}
