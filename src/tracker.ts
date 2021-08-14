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
    refIDs: string[];
};

type NetClassInfo = {
    objectID: number;
};

type Reference =
    | {
          clientID: number;
      }
    | {
          type: 'persist';
      }
    | {
          objectID: number;
      };

export default class Tracker {
    private objects: Record<number, TrackedObject> = {};
    private refs: Record<string, number[]> = {}; // Maps reference to object IDs
    private nextID: number = 1;

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

    getObjectStructureMap(objectID: number): ObjectStructureMap {
        const map: ObjectStructureMap = {};
        this.getObjectStructureMapInternal(objectID, map);
        return map;
    }

    private getObjectStructureMapInternal(
        objectID: number,
        map: ObjectStructureMap
    ): void {
        map[objectID] = this.getTrackedObject(objectID).structure;
        for (const objID of this.getReferencedObjectIDs(
            this.getRefID({ objectID })
        )) {
            this.getObjectStructureMapInternal(objID, map);
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
            refIDs: [],
        };
        this.referenceObjects(
            { objectID },
            this.getObjectIDDependencies(structure)
        );

        // Handle DelayProxy
        if (DelayProxy.isProxy(object)) {
            const { setHandler } = DelayProxy.get(object);
            setHandler({
                set: (target, prop, value, receiver) => {
                    return Reflect.set(target, prop, value, receiver);
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

    referenceObjects(ref: Reference, objIDs: number[]) {
        for (let objID of objIDs) {
            this.referenceObject(ref, objID);
        }
    }

    referenceObject(ref: Reference, objID: number) {
        const refID = this.getRefID(ref);
        // Add to this.objects
        const trackedObject = this.getTrackedObject(objID);
        if (!trackedObject.refIDs.includes(refID)) {
            trackedObject.refIDs.push(refID);
        }
        // Add to this.refs
        const objIDs = this.getReferencedObjectIDs(refID);
        if (!objIDs.includes(objID)) {
            objIDs.push(objID);
        }
        this.refs[refID] = objIDs;
    }

    dereferenceAllObjects(ref: Reference) {
        const refID = this.getRefID(ref);
        const objIDs = this.getReferencedObjectIDs(refID);
        for (let objID of objIDs) {
            this.dereferenceObjectInternal(refID, objID);
        }
    }

    dereferenceObject(ref: Reference, objID: number) {
        this.dereferenceObjectInternal(this.getRefID(ref), objID);
    }

    private dereferenceObjectInternal(refID: string, objectID: number) {
        const obj = this.getTrackedObject(objectID);
        obj.refIDs.splice(obj.refIDs.indexOf(refID), 1);
        if (obj.refIDs.length === 0) {
            this.dereferenceAllObjects({ objectID });
            delete this.objects[objectID];
        }
        const allReferences = this.getReferencedObjectIDs(refID);
        allReferences.splice(allReferences.indexOf(objectID), 1);
        if (allReferences.length === 0) {
            delete this.refs[refID];
        }
    }

    private getReferencedObjectIDs(refID: string): number[] {
        return this.refs[refID] ?? [];
    }

    private getRefID(ref: Reference): string {
        if ('clientID' in ref) {
            return `client-${ref.clientID}`;
        } else if ('type' in ref) {
            switch (ref.type) {
                case 'persist':
                    return 'persist';
            }
        } else if ('objectID' in ref) {
            return `object-${ref.objectID}`;
        }
        throw new Error(`Invalid reference: ${JSON.stringify(ref)}`);
    }
}
