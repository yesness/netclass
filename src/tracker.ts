import Structurer, { ComplexStructure } from './structurer';

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

export default class Tracker {
    private objects: Record<number, TrackedObject> = {};
    private refs: Record<string, number[]> = {};
    private nextID: number = 1;

    constructor(public infoProperty: string) {}

    trackObject(object: any, objectIDs: number[]): number {
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
            structure: Structurer.getComplexStructure({
                object,
                tracker: this,
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
