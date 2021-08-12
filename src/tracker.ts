import { ComplexStructure, ObjectMap, StructureValue } from './structureTypes';
import { PropUtil } from './util';

type TrackedObject = {
    object: any;
    structure: ComplexStructure;
    refIDs: string[];
    ncInfo: NetClassInfo;
};

type NetClassInfo = {
    objectID: number;
    isProxy: boolean;
};

type Reference =
    | {
          clientID: number;
      }
    | {
          type: 'persist';
      };

type State = {
    object: any;
    objectIDs: number[];
};

export type GetValueReturn = {
    value: StructureValue;
    objectIDs: number[];
};

export default class Tracker {
    private objects: Record<number, TrackedObject> = {};
    private refs: Record<string, number[]> = {};
    private nextID: number = 1;

    constructor(public infoProperty: string) {}

    private static isInstance(object: any): boolean {
        return object && object.constructor !== Object;
    }

    getValue(object: any): GetValueReturn {
        const objectIDs: number[] = [];
        const value = this.getValueInternal({
            object,
            objectIDs,
        });
        return { value, objectIDs };
    }

    private getValueInternal(state: State): StructureValue {
        const { object, objectIDs } = state;

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
                objectID: this.trackObject(object, objectIDs),
            };
        }

        throw new Error(`Unsupported data type: ${typeof object}`);
    }

    private trackObject(object: any, objectIDs: number[]): number {
        if (this.infoProperty in object) {
            const { objectID }: NetClassInfo = object[this.infoProperty];
            this.addAllObjectDependencies(objectID, objectIDs);
            return objectID;
        }
        const objectID = this.nextID++;
        const ncInfo: NetClassInfo = {
            objectID,
            isProxy: false,
        };
        Object.defineProperty(object, this.infoProperty, {
            value: ncInfo,
        });
        this.objects[objectID] = {
            object,
            structure: this.getComplexStructure({
                object,
                objectIDs,
            }),
            refIDs: [],
            ncInfo,
        };
        objectIDs.push(objectID);
        return objectID;
    }

    private addAllObjectDependencies(objID: number, objectIDs: number[]) {
        objectIDs.push(objID);
        const { structure } = this.objects[objID];
        for (let value of Object.values(structure.map)) {
            if (value.type !== 'simple') {
                this.addAllObjectDependencies(value.objectID, objectIDs);
            }
        }
    }

    private getComplexStructure(state: State): ComplexStructure {
        const { object } = state;

        // Handle objects and arrays
        if (typeof object === 'object') {
            let objectIsInstance = false;
            let funcs: string[] = [];
            let array = null;
            let type: 'object' | 'instance' | 'array';
            if (Array.isArray(object)) {
                array = object.map((element) =>
                    this.getValueInternal({
                        ...state,
                        object: element,
                    })
                );
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
            const map = this.getObjectMap(state, type, funcs);
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
                map: this.getObjectMap(state, 'function'),
            };
        }

        throw new Error(
            `Object must have type object or function but got ${typeof object}`
        );
    }

    private getObjectMap(
        state: State,
        type: 'function' | 'instance' | 'object' | 'array',
        excludeFuncs: string[] = []
    ): ObjectMap {
        const map: ObjectMap = {};
        const props = PropUtil.getAllProps(
            state.object,
            type,
            this.infoProperty
        );
        for (let prop of props) {
            if (excludeFuncs.includes(prop)) continue;
            map[prop] = this.getValueInternal({
                ...state,
                object: state.object[prop],
            });
        }
        return map;
    }

    referenceObjects(ref: Reference, objIDs: number[]) {
        for (let objID of objIDs) {
            this.referenceObject(ref, objID);
        }
    }

    referenceObject(ref: Reference, objID: number) {
        const refID = this.getRefID(ref);
        // Add to this.objects
        const trackedObject = this.objects[objID];
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

    getTrackedObject(objID: number): TrackedObject {
        if (!(objID in this.objects)) {
            throw new Error(`Invalid objID: ${objID}`);
        }
        return this.objects[objID];
    }

    private dereferenceObjectInternal(refID: string, objID: number) {
        const obj = this.objects[objID];
        obj.refIDs.splice(obj.refIDs.indexOf(refID), 1);
        if (obj.refIDs.length === 0) {
            delete this.objects[objID];
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
        }
        throw new Error(`Invalid reference: ${JSON.stringify(ref)}`);
    }
}
