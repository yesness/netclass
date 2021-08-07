import Tracker from './tracker';
import { isInstance } from './util';

export type FunctionStructure = {
    type: 'function';
    structure: Record<string, Structure>;
    instanceStructure: Record<string, Structure>;
    objectID?: number;
};

export type ObjectStructure = {
    type: 'object';
    structure: Record<string, Structure>;
    objectID?: number;
};

export type SimpleStructure = {
    type: 'simple';
    value: string | number | boolean | null | undefined;
};

export type Structure = FunctionStructure | ObjectStructure | SimpleStructure;

type GetStructureReturn = {
    structure: Structure;
    objectIDs: number[];
};

type GetStructureState = {
    object: any;
    tracker: Tracker;
    objectIDs: number[];
    alreadyTracked: boolean;
};

class StructurerClass {
    objectStop: any;
    functionStop: any;
    defaultFunctionProps: string[];
    defaultInstanceProps: string[];

    constructor() {
        function EmptyFunc() {}
        const B: any = EmptyFunc;
        this.objectStop = Object.getPrototypeOf({});
        this.functionStop = Object.getPrototypeOf(EmptyFunc);
        this.defaultFunctionProps = [];
        this.defaultFunctionProps = this.getAllProps(EmptyFunc, 'function');
        this.defaultInstanceProps = [];
        this.defaultInstanceProps = this.getAllProps(new B(), 'instance');
    }

    getStructure(object: any, tracker: Tracker): GetStructureReturn {
        const objectIDs: number[] = [];
        const structure = this.getStructureInternal({
            object,
            tracker,
            objectIDs,
            alreadyTracked: false,
        });
        return { structure, objectIDs };
    }

    private getStructureInternal(state: GetStructureState): Structure {
        const { object, tracker, objectIDs, alreadyTracked } = state;

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

        // Handle objects and instances
        else if (typeof object === 'object') {
            const objectIsInstance = isInstance(object);
            let objectID = undefined;
            if (objectIsInstance && !alreadyTracked) {
                objectID = tracker.trackObject(object);
                objectIDs.push(objectID);
            }
            return {
                type: 'object',
                structure: this.getStructureHelper(
                    {
                        ...state,
                        alreadyTracked: alreadyTracked || objectIsInstance,
                    },
                    objectIsInstance ? 'instance' : 'object'
                ),
                objectID,
            };
        }

        // Handle classes and functions
        else if (typeof object === 'function') {
            let objectID = undefined;
            if (!alreadyTracked) {
                objectID = tracker.trackObject(object);
                objectIDs.push(objectID);
            }
            return {
                type: 'function',
                structure: this.getStructureHelper(
                    {
                        ...state,
                        alreadyTracked: true,
                    },
                    'function'
                ),
                instanceStructure: this.getStructureHelper(
                    {
                        ...state,
                        object: object.prototype,
                        alreadyTracked: true,
                    },
                    'instance'
                ),
                objectID,
            };
        }

        throw new Error(`Unsupported data type: ${typeof object}`);
    }

    private getStructureHelper(
        state: GetStructureState,
        type: 'function' | 'instance' | 'object'
    ): Record<string, Structure> {
        const structure: Record<string, Structure> = {};
        const props = this.getAllProps(state.object, type);
        for (let prop of props) {
            const struct = this.getStructureInternal({
                ...state,
                object: state.object[prop],
            });
            if (struct !== null) {
                structure[prop] = struct;
            }
        }
        return structure;
    }

    getAllProps(
        toCheck: any,
        type: 'function' | 'instance' | 'object'
    ): string[] {
        const props: string[] = [];
        let obj = toCheck;
        while (true) {
            if (
                !obj ||
                obj === this.objectStop ||
                (type === 'function' && obj === this.functionStop)
            )
                break;
            props.push(...Object.getOwnPropertyNames(obj));
            obj = Object.getPrototypeOf(obj);
        }
        return props.sort().filter((prop, idx, arr) => {
            if (
                (type === 'function' &&
                    this.defaultFunctionProps.includes(prop)) ||
                (type === 'instance' &&
                    this.defaultInstanceProps.includes(prop))
            ) {
                return false;
            }
            return prop != arr[idx + 1];
        });
    }
}

const Structurer = new StructurerClass();
export default Structurer;
