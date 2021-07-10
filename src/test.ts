function ANY(x: any): any {
    return x;
}

class Foo {
    constructor(public bar: number) {}
}

class What {
    constructor(...args: any[]) {
        console.log('constructor called with', args);
        return new Proxy(this, {
            get: (target, prop, receiver) => {
                const name = prop.toString();
                console.log('Getting', name);
                return Reflect.get(target, prop, receiver);
            },
        });
    }
}

const MyFoo: typeof Foo = ANY(What);

const w = new MyFoo(1);
console.log('what', w.bar);

class Trick {
    static blob: string = 'BLOB';

    static printBlob() {
        console.log(Trick.blob);
    }

    name: string;
    constructor(n: string) {
        console.log('Trick.constructor called with', n);
        this.name = n;
    }

    haha() {
        console.log('haha called', this.name);
    }
}
class Trix {
    constructor(n: string) {
        console.log('Trix.constructor called with', n);
        const construct = Trick.prototype.constructor.bind(this);
        construct(n.toUpperCase());
    }
}
Trix.prototype = Trick.prototype;
Object.keys(Trick).forEach((key) => {
    const a: any = Trick;
    const b: any = Trix;
    b[key] = a[key];
});

const MyTrick: typeof Trick = ANY(Trix);
const trick = new MyTrick('hello');
console.log(trick.name);
trick.haha();
console.log(Trick.blob);
console.log(MyTrick.blob);
console.log(Object.getOwnPropertyNames(Trick));
console.log(Object.keys(Trick));
console.log(Trick.printBlob());
console.log(MyTrick.printBlob());
