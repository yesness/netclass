import DelayProxy from './delayProxy';
import {
    ComplexStructure,
    ObjectMap,
    ObjectStructureMap,
    ObjectUpdate,
    ObjectUpdateMap,
    SimpleValue,
    StructureValue,
} from './structureTypes';
import { GetAllPropsType, PropUtil } from './util';

export const NC_TRACKED_PROP = '_netclass_tracked';

type TrackedObject = {
    object: any;
    structure: ComplexStructure;
};

type NetClassInfo = {
    objectID: number;
};

export default class Tracker {
    static isTrackable(object: any): boolean {
        return object != null && ['object', 'function'].includes(typeof object);
    }

    static setTracked(object: object, tracked: boolean) {
        Object.defineProperty(object, NC_TRACKED_PROP, { value: tracked });
    }

    private static isInstance(object: any): boolean {
        return object && object.constructor !== Object;
    }

    private static getSimpleValue(value: any): SimpleValue {
        return {
            type: 'simple',
            value,
        };
    }

    private objects: Record<number, TrackedObject> = {};
    private nextID: number = 1;
    private updates: ObjectUpdateMap = {};

    constructor(
        public infoProperty: string,
        private excludeUnderscore: boolean
    ) {}

    popUpdates(): ObjectUpdateMap {
        const updates = this.updates;
        this.updates = {};
        return updates;
    }

    getFunctionReturnValue(
        object: any,
        defaultTracked: boolean
    ): StructureValue {
        const trackable = Tracker.isTrackable(object);
        if (trackable && NC_TRACKED_PROP in object) {
            return object[NC_TRACKED_PROP]
                ? this.getValue(object)
                : Tracker.getSimpleValue(object);
        } else {
            return defaultTracked
                ? this.getValue(object)
                : Tracker.getSimpleValue(object);
        }
    }

    getValue(object: any): StructureValue {
        // Handle simple values
        if (
            ['string', 'number', 'boolean', 'undefined'].includes(
                typeof object
            ) ||
            object === null
        ) {
            return Tracker.getSimpleValue(object);
        }

        // Handle trackable objects
        else if (Tracker.isTrackable(object)) {
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

    isTracked(object: any): boolean {
        return this.getInfo(object) !== null;
    }

    getTrackedObjectID(object: any): number {
        const info = this.getInfo(object);
        if (info === null) {
            throw new Error('Object is not tracked');
        }
        return info.objectID;
    }

    getObjectStructureMap(
        objectID: number,
        skipObjectIDs: number[] = []
    ): ObjectStructureMap {
        const map: ObjectStructureMap = {};
        this.getObjectStructureMapInternal(objectID, map, skipObjectIDs);
        return map;
    }

    garbageCollect(rootObjectIDs: number[]) {
        const allIDs = Object.keys(this.objects).map((strID) =>
            parseInt(strID)
        );
        const mark = (id: number) => {
            const idx = allIDs.indexOf(id);
            if (idx >= 0) allIDs.splice(idx, 1);
        };
        let todo = rootObjectIDs.slice();
        while (todo.length > 0) {
            const id = todo.pop() ?? -1;
            if (!allIDs.includes(id)) continue;
            mark(id);
            todo = todo.concat(
                this.getObjectIDDependencies(this.objects[id].structure)
            );
        }
        for (const objID of allIDs) {
            delete this.objects[objID];
        }
    }

    private getInfo(object: any): NetClassInfo | null {
        return object[this.infoProperty] ?? null;
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
        const info = this.getInfo(object);
        if (info !== null) {
            return info.objectID;
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
                            Tracker.isTrackable(value) &&
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
                    const result = Reflect.set(target, prop, value, receiver);
                    this.objects[objectID].structure =
                        this.getComplexStructure(target);
                    return result;
                },
                deleteProperty: (target, prop) => {
                    if (typeof prop === 'string') {
                        const update = this.getUpdate(objectID);
                        if (!update.deleted.includes(prop)) {
                            update.deleted.push(prop);
                        }
                        delete update.map[prop];
                    }
                    const result = Reflect.deleteProperty(target, prop);
                    this.objects[objectID].structure =
                        this.getComplexStructure(target);
                    return result;
                },
                construct: (target, args) => {
                    const instance = Reflect.construct(target, args);
                    const proxy = DelayProxy.create(instance);
                    this.trackObject(proxy);
                    return proxy;
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
                    funcs = this.getAllProps(
                        Object.getPrototypeOf(object),
                        'instance'
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
        const props = this.getAllProps(object, type);
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

    private getAllProps(object: any, type: GetAllPropsType): string[] {
        return PropUtil.getAllProps(object, type, {
            excludeProps: [this.infoProperty, NC_TRACKED_PROP],
            excludeUnderscore: this.excludeUnderscore,
        });
    }
}
