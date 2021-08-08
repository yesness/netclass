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
    };
}
function f(
    map: ObjectMap = {},
    instanceFuncs: string[] = []
): ComplexStructure {
    return {
        type: 'function',
        map,
        instanceFuncs,
    };
}

describe('Structurer', () => {
    test('constants', () => {
        expect(Structurer.defaultFunctionProps).toEqual([
            'length',
            'name',
            'prototype',
        ]);

        expect(Structurer.defaultInstanceProps).toEqual(['constructor']);
    });

    describe('getAllProps', () => {
        test('object props', () => {
            expect(Structurer.getAllProps({}, 'object')).toEqual([]);

            expect(
                Structurer.getAllProps(
                    {
                        c: 1,
                        b: 2,
                        a: 3,
                    },
                    'object'
                )
            ).toEqual(['a', 'b', 'c']);
        });

        test('function props', () => {
            expect(Structurer.getAllProps(function () {}, 'function')).toEqual(
                []
            );

            function b() {}
            b.prop1 = 1;
            expect(Structurer.getAllProps(b, 'function')).toEqual(['prop1']);
        });

        test('function instance props', () => {
            function A() {}
            const AA: any = A;
            const a = new AA();
            expect(Structurer.getAllProps(a, 'instance')).toEqual([]);

            function B(this: any) {
                this.name = 'b';
            }
            B.prototype.getName = function () {};
            const BB: any = B;
            const b = new BB();
            expect(Structurer.getAllProps(b, 'instance')).toEqual([
                'getName',
                'name',
            ]);
        });

        test('class instance props', () => {
            class A {}
            const a = new A();
            expect(Structurer.getAllProps(a, 'instance')).toEqual([]);

            class B {
                name: string;
                constructor() {
                    this.name = 'b';
                }
                getName() {}
            }
            const b = new B();
            expect(Structurer.getAllProps(b, 'instance')).toEqual([
                'getName',
                'name',
            ]);
        });
    });

    describe('getValue', () => {
        class A {
            name: string;
            constructor(name: string = 'a') {
                this.name = name;
            }
            static nextID = 1;
            static getNextID() {}
            getName() {}
        }
        const aStructure = (startID: number) => ({
            [startID]: {
                obj: A,
                struct: f(
                    {
                        nextID: s(1),
                        getNextID: ref(startID + 1),
                    },
                    ['getName']
                ),
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
                            struct: f(
                                {
                                    nextID: s(1),
                                    getNextID: ref(2),
                                },
                                ['getName']
                            ),
                        },
                        2: {
                            obj: A.getNextID,
                            struct: f(),
                        },
                    },
                ];
            },
            class: [A, ref(1), aStructure(1)],
            instance: () => {
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
                        ...aStructure(2),
                        4: {
                            obj: obj.instance,
                            struct: o({ name: s('rob') }, ['getName']),
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
                const tracker = new Tracker();
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
