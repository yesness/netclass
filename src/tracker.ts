type TrackedObject = {
    object: any;
    refIDs: string[];
};

export default class Tracker {
    private objects: Record<number, TrackedObject> = {};
    private refs: Record<string, number[]> = {};
    private nextID: number = 1;

    trackObjectFromClient(object: any, clientID: number): number {
        return this.trackObject(object, `client-${clientID}`);
    }

    onClientDisconnect(clientID: number) {
        this.removeReference(`client-${clientID}`);
    }

    private trackObject(object: any, refID: string): number {
        const objID = this.nextID++;
        this.objects[objID] = {
            object,
            refIDs: [refID],
        };
        this.addReference(refID, objID);
        return objID;
    }

    private removeReference(refID: string) {
        const objIDs = this.getReferencedObjectIDs(refID);
        for (let objID of objIDs) {
            const obj = this.objects[objID];
            obj.refIDs.splice(obj.refIDs.indexOf(refID), 1);
            if (obj.refIDs.length === 0) {
                delete this.objects[objID];
            }
        }
    }

    private addReference(refID: string, objID: number) {
        const objIDs = this.getReferencedObjectIDs(refID);
        objIDs.push(objID);
        this.refs[refID] = objIDs;
    }

    private getReferencedObjectIDs(refID: string): number[] {
        return this.refs[refID] ?? [];
    }
}
