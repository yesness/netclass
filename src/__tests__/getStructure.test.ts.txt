import NetClass from '..';
import { getStructure } from '../util';

const FUNC = () => {};
const TFUNC = { type: 'function' };

function TOBJ(structure: any): any {
    return {
        type: 'object',
        structure,
    };
}

function TCLASS(classStructure: any, instanceStructure: any): any {
    return {
        type: 'class',
        classStructure,
        instanceStructure,
    };
}

const TEST_CASES: Record<string, any> = {
    'simple function': [FUNC, TFUNC],
    'simple object': [
        {
            func1: FUNC,
            func2: FUNC,
        },
        TOBJ({
            func1: TFUNC,
            func2: TFUNC,
        }),
    ],
    'nested object': [
        {
            obj1: {
                func1: FUNC,
                sub: {
                    func2: FUNC,
                },
            },
            func3: FUNC,
            obj2: {
                func4: FUNC,
                sub2: {
                    sub3: {
                        func5: FUNC,
                    },
                },
            },
        },
        TOBJ({
            obj1: TOBJ({
                func1: TFUNC,
                sub: TOBJ({
                    func2: TFUNC,
                }),
            }),
            func3: TFUNC,
            obj2: TOBJ({
                func4: TFUNC,
                sub2: TOBJ({
                    sub3: TOBJ({
                        func5: TFUNC,
                    }),
                }),
            }),
        }),
    ],
    'class instance method': [
        class A extends NetClass {
            hello() {}
        },
        TCLASS({}, { hello: TFUNC }),
    ],
    'class static method': [
        class A extends NetClass {
            static goodbye() {}
        },
        TCLASS({ goodbye: TFUNC }, {}),
    ],
    'class with props and methods': [
        class A extends NetClass {
            static id: any = { a: FUNC };
            name: any = { b: FUNC };
            constructor() {
                super();
                this.name = { b: () => {} };
            }
            static wait() {}
            no() {}
        },
        TCLASS(
            { id: TOBJ({ a: TFUNC }), wait: TFUNC },
            { /* name: TOBJ({ b: TFUNC }), */ no: TFUNC } // instance props not supported
        ),
    ],
    'object with classes': [
        {
            Foo: class Foo extends NetClass {
                func1() {}
            },
            Bar: class Bar extends NetClass {
                static func2() {}
            },
        },
        TOBJ({
            Foo: TCLASS({}, { func1: TFUNC }),
            Bar: TCLASS({ func2: TFUNC }, {}),
        }),
    ],
    'child class': () => {
        class Parent extends NetClass {
            static parentStatic() {}
            parentInstance() {}
        }
        class Child extends Parent {
            static childStatic() {}
            childInstance() {}
        }
        return [
            {
                Parent,
                Child,
            },
            TOBJ({
                Parent: TCLASS(
                    { parentStatic: TFUNC },
                    { parentInstance: TFUNC }
                ),
                Child: TCLASS(
                    { parentStatic: TFUNC, childStatic: TFUNC },
                    { parentInstance: TFUNC, childInstance: TFUNC }
                ),
            }),
        ];
    },
    'class not extend NetClass': [
        class A {
            static hello() {}
            goodbye() {}
        },
        TOBJ({
            hello: TFUNC,
        }),
    ],
    'function not extend NetClass': () => {
        function A() {}
        A.staticFunc = FUNC;
        return [A, TOBJ({ staticFunc: TFUNC })];
    },
};

describe('getStructure', () => {
    Object.keys(TEST_CASES).forEach((name) => {
        test(name, () => {
            let arr = TEST_CASES[name];
            if (typeof arr === 'function') {
                arr = arr();
            }
            const [input, expected] = arr;
            expect(getStructure(input)).toEqual(expected);
        });
    });
});
