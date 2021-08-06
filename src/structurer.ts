type FunctionStructure = {
    type: 'function';
    structure: Record<string, Structure>;
    instanceStructure: Record<string, Structure>;
};

type ObjectStructure = {
    type: 'object';
    structure: Record<string, Structure>;
};

type SimpleStructure = {
    type: 'simple';
    value: string | number | boolean | null | undefined;
};

export type Structure = FunctionStructure | ObjectStructure | SimpleStructure;

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

    getStructure(object: any): Structure | null {
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
            return {
                type: 'object',
                structure: this.getStructureHelper(
                    object,
                    object.constructor === Object ? 'object' : 'instance'
                ),
            };
        }

        // Handle classes and functions
        else if (typeof object === 'function') {
            return {
                type: 'function',
                structure: this.getStructureHelper(object, 'function'),
                instanceStructure: this.getStructureHelper(
                    object.prototype,
                    'instance'
                ),
            };
        }

        return null;
    }

    getStructureHelper(
        object: any,
        type: 'function' | 'instance' | 'object'
    ): Record<string, Structure> {
        const structure: Record<string, Structure> = {};
        const props = this.getAllProps(object, type);
        for (let prop of props) {
            const struct = this.getStructure(object[prop]);
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
