import DelayProxy from './delayProxy';
import {
    ComplexStructure,
    ObjectMap,
    ObjectStructureMap,
    StructureValue,
} from './structureTypes';
import { PropUtil } from './util';

type TrackedObject = {
    object: any;
    structure: ComplexStructure;
};

type NetClassInfo = {
    objectID: number;
};

type ObjectUpdate = {
    map: ObjectMap;
    deleted: string[];
};

export default class Tracker {
    private objects: Record<number, TrackedObject> = {};
    private nextID: number = 1;
    private updates: Record<number, ObjectUpdate> = {};

    constructor(public infoProperty: string) {}

    private static isInstance(object: any): boolean {
        return object && object.constructor !== Object;
    }

    getValue(object: any): StructureValue {
        // Handle simple values
        if (
            ['string', 'number', 'boolean', 'undefined'].includes(
                typeof object
            ) ||
            object === null
        ) {
            return {
                type: 'simple',
                value: object,
            };
        }

        // Handle objects and functions
        else if (['object', 'function'].includes(typeof object)) {
            return {
                type: 'reference',
                objectID: this.trackObject(object),
            };
        }

        throw new Error(`Unsupported data type: ${typeof object}`);
    }

    getTrackedObject(objID: number): TrackedObject {
        if (!(objID in this.objects)) {
            throw new Error(`Invalid objID: ${objID}`);
        }
        return this.objects[objID];
    }

    getObjectStructureMap(
        objectID: number,
        skipObjectIDs: number[] = []
    ): ObjectStructureMap {
        const map: ObjectStructureMap = {};
        this.getObjectStructureMapInternal(objectID, map, skipObjectIDs);
        return map;
    }

    private getObjectStructureMapInternal(
        objectID: number,
        map: ObjectStructureMap,
        skipObjectIDs: number[]
    ): void {
        if (skipObjectIDs.includes(objectID)) return;
        map[objectID] = this.getTrackedObject(objectID).structure;
        const objIDs = this.getObjectIDDependencies(map[objectID]);
        for (const objID of objIDs) {
            this.getObjectStructureMapInternal(objID, map, skipObjectIDs);
        }
    }

    private trackObject(object: any): number {
        if (this.infoProperty in object) {
            const { objectID }: NetClassInfo = object[this.infoProperty];
            return objectID;
        }
        const objectID = this.nextID++;
        const ncInfo: NetClassInfo = {
            objectID,
        };
        Object.defineProperty(object, this.infoProperty, {
            value: ncInfo,
        });
        const structure = this.getComplexStructure(object);
        this.objects[objectID] = {
            object,
            structure,
        };

        // Handle DelayProxy
        if (DelayProxy.isProxy(object)) {
            const { setHandler } = DelayProxy.get(object);
            setHandler({
                set: (target, prop, value, receiver) => {
                    if (typeof prop === 'string') {
                        if (
                            typeof value === 'object' &&
                            !DelayProxy.isProxy(value)
                        ) {
                            value = DelayProxy.create(value);
                        }
                        const update = this.getUpdate(objectID);
                        update.map[prop] = this.getValue(value);
                        const delIdx = update.deleted.indexOf(prop);
                        if (delIdx >= 0) {
                            update.deleted.splice(delIdx, 1);
                        }
                    }
                    return Reflect.set(target, prop, value, receiver);
                },
                deleteProperty: (target, prop) => {
                    if (typeof prop === 'string') {
                        const update = this.getUpdate(objectID);
                        if (!update.deleted.includes(prop)) {
                            update.deleted.push(prop);
                        }
                        delete update.map[prop];
                    }
                    return Reflect.deleteProperty(target, prop);
                },
            });
        }

        return objectID;
    }

    private getComplexStructure(object: any): ComplexStructure {
        // Handle objects and arrays
        if (typeof object === 'object') {
            let objectIsInstance = false;
            let funcs: string[] = [];
            let array = null;
            let type: 'object' | 'instance' | 'array';
            if (Array.isArray(object)) {
                array = object.map((element) => this.getValue(element));
                type = 'array';
            } else {
                objectIsInstance = Tracker.isInstance(object);
                type = 'object';
                if (objectIsInstance) {
                    funcs = PropUtil.getAllProps(
                        Object.getPrototypeOf(object),
                        'instance',
                        this.infoProperty
                    );
                    type = 'instance';
                }
            }
            const map = this.getObjectMap(object, type, funcs);
            return {
                type: 'object',
                map,
                funcs,
                array,
            };
        }

        // Handle classes and functions
        else if (typeof object === 'function') {
            return {
                type: 'function',
                map: this.getObjectMap(object, 'function'),
            };
        }

        throw new Error(
            `Object must have type object or function but got ${typeof object}`
        );
    }

    private getObjectMap(
        object: any,
        type: 'function' | 'instance' | 'object' | 'array',
        excludeFuncs: string[] = []
    ): ObjectMap {
        const map: ObjectMap = {};
        const props = PropUtil.getAllProps(object, type, this.infoProperty);
        for (let prop of props) {
            if (excludeFuncs.includes(prop)) continue;
            map[prop] = this.getValue(object[prop]);
        }
        return map;
    }

    private getObjectIDDependencies(struct: ComplexStructure): number[] {
        const objectIDs: number[] = [];
        const addValues = (values: StructureValue[]) => {
            for (let value of values) {
                if (value.type !== 'simple') {
                    objectIDs.push(value.objectID);
                }
            }
        };
        addValues(Object.values(struct.map));
        if (struct.type === 'object') {
            addValues(struct.array ?? []);
        }
        return objectIDs;
    }

    private getUpdate(objectID: number): ObjectUpdate {
        if (!(objectID in this.updates)) {
            this.updates[objectID] = {
                map: {},
                deleted: [],
            };
        }
        return this.updates[objectID];
    }
}
