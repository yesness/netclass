import { PropUtil } from '../util';

describe('PropUtil', () => {
    test('constants', () => {
        const any: any = PropUtil;
        expect(any.defaultFunctionProps).toEqual([
            'length',
            'name',
            'prototype',
        ]);

        expect(any.defaultInstanceProps).toEqual(['constructor']);
    });

    test('object props', () => {
        expect(PropUtil.getAllProps({}, 'object')).toEqual([]);

        expect(
            PropUtil.getAllProps(
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
        expect(PropUtil.getAllProps(function () {}, 'function')).toEqual([]);

        function b() {}
        b.prop1 = 1;
        expect(PropUtil.getAllProps(b, 'function')).toEqual(['prop1']);
    });

    test('function instance props', () => {
        function A() {}
        const AA: any = A;
        const a = new AA();
        expect(PropUtil.getAllProps(a, 'instance')).toEqual([]);

        function B(this: any) {
            this.name = 'b';
        }
        B.prototype.getName = function () {};
        const BB: any = B;
        const b = new BB();
        expect(PropUtil.getAllProps(b, 'instance')).toEqual([
            'getName',
            'name',
        ]);
    });

    test('class instance props', () => {
        class A {}
        const a = new A();
        expect(PropUtil.getAllProps(a, 'instance')).toEqual([]);

        class B {
            name: string;
            constructor() {
                this.name = 'b';
            }
            getName() {}
        }
        const b = new B();
        expect(PropUtil.getAllProps(b, 'instance')).toEqual([
            'getName',
            'name',
        ]);
    });
});
