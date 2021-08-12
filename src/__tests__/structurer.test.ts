import Structurer, {
    ComplexStructure,
    ObjectMap,
    StructureValue,
} from '../structurer';
import Tracker from '../tracker';

function s(value: any): StructureValue {
    return {
        type: 'simple',
        value,
    };
}
function ref(objectID: number): StructureValue {
    return {
        type: 'reference',
        objectID,
    };
}
function o(map: ObjectMap, funcs: string[] = []): ComplexStructure {
    return {
        type: 'object',
        map,
        funcs,
        array: null,
    };
}
function arr(values: StructureValue[], map: ObjectMap = {}): ComplexStructure {
    return {
        type: 'object',
        map,
        funcs: [],
        array: values,
    };
}

function f(map: ObjectMap = {}): ComplexStructure {
    return {
        type: 'function',
        map,
    };
}

describe('Structurer', () => {
    describe('getValue', () => {
        const AGen = () =>
            class A {
                name: string;
                constructor(name: string = 'a') {
                    this.name = name;
                }
                static nextID = 1;
                static getNextID() {}
                getName() {}
            };
        const aStructure = (A: any, startID: number) => ({
            [startID]: {
                obj: A,
                struct: f({
                    nextID: s(1),
                    getNextID: ref(startID + 1),
                }),
            },
            [startID + 1]: {
                obj: A.getNextID,
                struct: f(),
            },
        });

        type Expected =
            | [any, any]
            | [
                  any, // input
                  any, // expected value
                  Record<
                      number,
                      {
                          obj: any;
                          struct: ComplexStructure;
                      }
                  > // expected tracked objects
              ];

        const cases: Record<string, Expected | (() => Expected)> = {
            'simple string': ['hello', s('hello')],
            'simple number': [1234, s(1234)],
            'simple boolean': [true, s(true)],
            'simple undefined': [undefined, s(undefined)],
            'simple null': [null, s(null)],
            object: () => {
                const obj = { a: 1, b: 'yay' };
                return [
                    obj,
                    ref(1),
                    {
                        1: {
                            obj,
                            struct: o({
                                a: s(1),
                                b: s('yay'),
                            }),
                        },
                    },
                ];
            },
            function: () => {
                function func() {}
                return [
                    func,
                    ref(1),
                    {
                        1: {
                            obj: func,
                            struct: f(),
                        },
                    },
                ];
            },
            function2: () => {
                function A(this: any) {
                    this.name = 'a';
                }
                A.prototype.getName = function () {};
                A.nextID = 1;
                A.getNextID = function () {};
                return [
                    A,
                    ref(1),
                    {
                        1: {
                            obj: A,
                            struct: f({
                                nextID: s(1),
                                getNextID: ref(2),
                            }),
                        },
                        2: {
                            obj: A.getNextID,
                            struct: f(),
                        },
                    },
                ];
            },
            class: () => {
                const A = AGen();
                return [A, ref(1), aStructure(A, 1)];
            },
            instance: () => {
                const A = AGen();
                const a = new A('bob');
                return [
                    a,
                    ref(1),
                    {
                        1: {
                            obj: a,
                            struct: o({ name: s('bob') }, ['getName']),
                        },
                    },
                ];
            },
            'object with class and instance': () => {
                const A = AGen();
                const obj = {
                    class: A,
                    instance: new A('rob'),
                };
                return [
                    obj,
                    ref(1),
                    {
                        1: {
                            obj,
                            struct: o({
                                class: ref(2),
                                instance: ref(4),
                            }),
                        },
                        ...aStructure(A, 2),
                        4: {
                            obj: obj.instance,
                            struct: o({ name: s('rob') }, ['getName']),
                        },
                    },
                ];
            },
            'array - simple': () => {
                const obj = [1, 'a', false];
                return [
                    obj,
                    ref(1),
                    {
                        1: {
                            obj,
                            struct: arr([s(1), s('a'), s(false)]),
                        },
                    },
                ];
            },
            'array - simple with props': () => {
                const obj: any = [1, 'fish'];
                obj.fun = {
                    yes: true,
                };
                return [
                    obj,
                    ref(1),
                    {
                        1: {
                            obj,
                            struct: arr([s(1), s('fish')], {
                                fun: ref(2),
                            }),
                        },
                        2: {
                            obj: obj.fun,
                            struct: o({
                                yes: s(true),
                            }),
                        },
                    },
                ];
            },
            'array - complex': () => {
                class A {
                    constructor(public name: string) {}
                    getName() {}
                }
                const obj: any = [new A('first'), 'hi', new A('third'), A];
                obj.prop = new A('yes');
                return [
                    obj,
                    ref(1),
                    {
                        1: {
                            obj,
                            struct: arr([ref(2), s('hi'), ref(3), ref(4)], {
                                prop: ref(5),
                            }),
                        },
                        2: {
                            obj: obj[0],
                            struct: o(
                                {
                                    name: s('first'),
                                },
                                ['getName']
                            ),
                        },
                        3: {
                            obj: obj[2],
                            struct: o(
                                {
                                    name: s('third'),
                                },
                                ['getName']
                            ),
                        },
                        4: {
                            obj: A,
                            struct: f({}),
                        },
                        5: {
                            obj: obj.prop,
                            struct: o(
                                {
                                    name: s('yes'),
                                },
                                ['getName']
                            ),
                        },
                    },
                ];
            },
        };

        Object.keys(cases).forEach((name) => {
            let testCase = cases[name];
            if (typeof testCase === 'function') {
                testCase = testCase();
            }
            let [input, expected] = testCase;
            const trackedObjects = testCase[2] ?? [];
            test(name, () => {
                const tracker = new Tracker('_netclass_id');
                const anyTracker: any = tracker;
                const { value, objectIDs } = Structurer.getValue(
                    input,
                    tracker
                );
                expect(value).toEqual(expected);
                const numTrackedObjects = Object.keys(trackedObjects).length;
                expect(anyTracker.nextID).toBe(numTrackedObjects + 1);
                for (let [strID, expected] of Object.entries(trackedObjects)) {
                    const objectID = parseInt(strID);
                    const trackedObject = tracker.getTrackedObject(objectID);
                    expect(trackedObject.object).toBe(expected.obj);
                    expect(trackedObject.structure).toEqual(expected.struct);
                }
                const expectedObjectIDs = new Array(numTrackedObjects)
                    .fill(null)
                    .map((_, idx) => idx + 1);
                expect(objectIDs.sort()).toEqual(expectedObjectIDs);
            });
        });
    });
});
