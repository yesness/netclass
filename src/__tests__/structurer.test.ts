import Structurer from '../structurer';

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

    describe('getStructure', () => {
        const s = (value: any) => ({
            type: 'simple',
            value,
        });
        const o = (structure: Object, objectID?: number) => ({
            type: 'object',
            structure,
            objectID,
        });
        const f = (
            structure: Object = {},
            instanceStructure: Object = {},
            objectID?: number
        ) => ({
            type: 'function',
            structure,
            instanceStructure,
            objectID,
        });

        class A {
            name: string;
            constructor(name: string = 'a') {
                this.name = name;
            }
            static nextID = 1;
            static getNextID() {}
            getName() {}
        }
        const aStructure = (objectID: number) =>
            f(
                {
                    nextID: s(1),
                    getNextID: f(),
                },
                {
                    getName: f(),
                },
                objectID
            );

        type Expected =
            | [any, any]
            | [
                  any, // input
                  any, // expected structure
                  any[] // tracked objects
              ];

        const cases: Record<string, Expected | (() => Expected)> = {
            'simple string': ['hello', s('hello')],
            'simple number': [1234, s(1234)],
            'simple boolean': [true, s(true)],
            'simple undefined': [undefined, s(undefined)],
            'simple null': [null, s(null)],
            object: [
                { a: 1, b: 'yay' },
                o({
                    a: s(1),
                    b: s('yay'),
                }),
            ],
            function: () => {
                function func() {}
                return [func, f({}, {}, 1), [func]];
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
                    f(
                        {
                            nextID: s(1),
                            getNextID: f(),
                        },
                        { getName: f() }, // 'name' should NOT be included since it isn't part of the prototype
                        1
                    ),
                    [A],
                ];
            },
            class: [A, aStructure(1), [A]],
            instance: () => {
                const a = new A('bob');
                return [
                    a,
                    o(
                        {
                            name: s('bob'),
                            getName: f(),
                        },
                        1
                    ),
                    [a],
                ];
            },
            'object with class and instance': () => {
                const instance = new A('rob');
                return [
                    {
                        class: A,
                        instance,
                    },
                    o({
                        class: aStructure(1),
                        instance: o(
                            {
                                name: s('rob'),
                                getName: f(),
                            },
                            2
                        ),
                    }),
                    [A, instance],
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
                let nextID = 1;
                const tracker: any = {
                    trackObject: (object: any) => {
                        expect(object).toBe(trackedObjects[nextID - 1]);
                        return nextID++;
                    },
                };
                const { structure, objectIDs } = Structurer.getStructure(
                    input,
                    tracker
                );
                expect(structure).toEqual(expected);
                expect(nextID).toBe(trackedObjects.length + 1);
                const expectedObjectIDs = new Array(trackedObjects.length)
                    .fill(null)
                    .map((_, idx) => idx + 1);
                expect(objectIDs).toEqual(expectedObjectIDs);
            });
        });
    });
});
