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
        const o = (structure: any) => ({
            type: 'object',
            structure,
        });
        const f = (structure: any = {}, instanceStructure: any = {}) => ({
            type: 'function',
            structure,
            instanceStructure,
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
        const aStructure = f(
            {
                nextID: s(1),
                getNextID: f(),
            },
            {
                getName: f(),
            }
        );

        const cases: Record<string, [any, any]> = {
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
            function: [() => function () {}, f()],
            function2: [
                () => {
                    function A(this: any) {
                        this.name = 'a';
                    }
                    A.prototype.getName = function () {};
                    A.nextID = 1;
                    A.getNextID = function () {};
                    return A;
                },
                f(
                    {
                        nextID: s(1),
                        getNextID: f(),
                    },
                    { getName: f() } // 'name' should NOT be included since it isn't part of the prototype
                ),
            ],
            class: [() => A, aStructure],
            instance: [
                new A('bob'),
                o({
                    name: s('bob'),
                    getName: f(),
                }),
            ],
            'object with class and instance': [
                {
                    class: A,
                    instance: new A('rob'),
                },
                o({
                    class: aStructure,
                    instance: o({
                        name: s('rob'),
                        getName: f(),
                    }),
                }),
            ],
        };

        Object.keys(cases).forEach((name) => {
            let [input, expected] = cases[name];
            if (typeof input === 'function') {
                input = input();
            }
            test(name, () => {
                expect(Structurer.getStructure(input)).toEqual(expected);
            });
        });
    });
});
