import Tracker from './tracker';

type Simple = {
    type: 'simple';
    value: string | number | boolean | null | undefined;
};

type ObjectReference = {
    type: 'reference';
    objectID: number;
};

export type StructureValue = Simple | ObjectReference;
export type ObjectMap = Record<string, StructureValue>;

export type FunctionStructure = {
    type: 'function';
    map: ObjectMap;
    instanceFuncs: string[];
};

export type ObjectStructure = {
    type: 'object';
    map: ObjectMap;
    funcs: string[];
    array: StructureValue[] | null;
};

export type ComplexStructure = FunctionStructure | ObjectStructure;

export type GetValueReturn = {
    value: StructureValue;
    objectIDs: number[];
};

type State = {
    object: any;
    tracker: Tracker;
    objectIDs: number[];
};

class StructurerClass {
    objectStop: any;
    functionStop: any;
    defaultFunctionProps: string[];
    defaultInstanceProps: string[];
    defaultArrayProps: string[];

    constructor() {
        function EmptyFunc() {}
        const B: any = EmptyFunc;
        this.objectStop = Object.getPrototypeOf({});
        this.functionStop = Object.getPrototypeOf(EmptyFunc);
        this.defaultFunctionProps = [];
        this.defaultFunctionProps = this.getAllProps(EmptyFunc, 'function');
        this.defaultInstanceProps = [];
        this.defaultInstanceProps = this.getAllProps(new B(), 'instance');
        this.defaultArrayProps = [];
        this.defaultArrayProps = this.getAllProps([], 'array');
    }

    getValue(object: any, tracker: Tracker): GetValueReturn {
        const objectIDs: number[] = [];
        const value = this.getValueInternal({
            object,
            tracker,
            objectIDs,
        });
        return { value, objectIDs };
    }

    private getValueInternal(state: State): StructureValue {
        const { object, tracker, objectIDs } = state;

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
                objectID: tracker.trackObject(object, objectIDs),
            };
        }

        throw new Error(`Unsupported data type: ${typeof object}`);
    }

    getComplexStructure(state: State): ComplexStructure {
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
                objectIsInstance = StructurerClass.isInstance(object);
                type = 'object';
                if (objectIsInstance) {
                    funcs = this.getAllProps(
                        Object.getPrototypeOf(object),
                        'instance',
                        state.tracker.idProperty
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
                instanceFuncs: this.getAllProps(
                    object.prototype,
                    'instance',
                    state.tracker.idProperty
                ),
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
        const props = this.getAllProps(
            state.object,
            type,
            state.tracker.idProperty
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

    getAllProps(
        toCheck: any,
        type: 'function' | 'instance' | 'object' | 'array',
        excludeProp?: string
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
                    this.defaultInstanceProps.includes(prop)) ||
                (type === 'array' &&
                    (this.defaultArrayProps.includes(prop) ||
                        !isNaN(parseInt(prop)))) ||
                prop === excludeProp
            ) {
                return false;
            }
            return prop != arr[idx + 1];
        });
    }

    private static isInstance(object: any): boolean {
        return object && object.constructor !== Object;
    }
}

const Structurer = new StructurerClass();
export default Structurer;
