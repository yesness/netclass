import YNEvents from '@yesness/events';
import { IYNSocket } from '@yesness/socket';
import NetClass, { NCUtil } from '..';
import { INCClient, INCServer, NCServerOptions } from '../types';

function sleep(time: number) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

function getSockets(delay: number = 1): [IYNSocket, IYNSocket] {
    class TestSocket extends YNEvents implements IYNSocket {
        send(data: Buffer | string) {
            this.emit('ourdata', data);
        }
        close() {
            this.emit('ourclose');
        }
    }
    const s1 = new TestSocket();
    const s2 = new TestSocket();
    s1.on('ourdata', (data) => {
        setTimeout(() => s2.emit('data', data), delay);
    });
    s2.on('ourdata', (data) => {
        setTimeout(() => s1.emit('data', data), delay);
    });
    const close = () => {
        s1.emit('close');
        s2.emit('close');
    };
    s1.on('ourclose', close);
    s2.on('ourclose', close);
    return [s1, s2];
}

type TestData<T> = {
    s1: IYNSocket;
    s2: IYNSocket;
    server: INCServer;
    client: INCClient<T>;
    serverObject: T;
    clientObject: T;
};

async function initTest<T>(
    object: T,
    options?: Omit<NCServerOptions<T>, 'object'>
): Promise<TestData<T>> {
    const [s1, s2] = getSockets();
    const server = NetClass.createServer<T>({
        object,
        ...options,
    });
    server.connect(s1);
    const client = await NetClass.createClient<T>(s2);
    const clientObject = client.getObject();
    return {
        s1,
        s2,
        server,
        client,
        serverObject: object,
        clientObject,
    };
}

type MultiTestData<T> = TestData<T> & {
    client2: INCClient<T>;
    clientObject2: T;
    c2s1: IYNSocket;
    c2s2: IYNSocket;
};

async function initMultiClientTest<T>(
    object: T,
    options?: Omit<NCServerOptions<T>, 'object'>
): Promise<MultiTestData<T>> {
    const testData = await initTest(object, options);
    const [s1, s2] = getSockets();
    testData.server.connect(s1);
    const client2 = await NetClass.createClient<T>(s2);
    return {
        ...testData,
        client2,
        clientObject2: client2.getObject(),
        c2s1: s1,
        c2s2: s2,
    };
}

function getNumTrackedObjects(server: INCServer): number {
    const s: any = server;
    const { objects } = s.tracker;
    return Object.keys(objects).length;
}

function clean(obj: any) {
    const clone = { ...obj };
    delete clone['_netclass_id'];
    return clone;
}

describe('NetClass - general', () => {
    test('object with functions', async () => {
        type Obj = {
            set: (val: string) => Promise<void>;
            get: () => Promise<string>;
        };

        let value: string = 'start';

        const [s1, s2] = getSockets();
        const server = NetClass.createServer<Obj>({
            object: {
                set: async (val) => {
                    value = val;
                },
                get: async () => {
                    return value;
                },
            },
        });
        server.connect(s1);
        const client = await NetClass.createClient<Obj>(s2);
        const clientObject = client.getObject();

        expect(await clientObject.get()).toBe('start');
        await clientObject.set('newval');
        expect(value).toBe('newval');
        expect(await clientObject.get()).toBe('newval');
    });

    test('class with static functions', async () => {
        interface IFoo {
            set(key: string, val: string): Promise<void>;
            get(key: string): Promise<string | null>;
            mark(): Promise<void>;
            isMarked(): Promise<boolean>;
        }
        class ServerFoo {
            static values: Record<string, string> = {};
            static marked: boolean = false;
            static async set(key: string, val: string): Promise<void> {
                ServerFoo.values[key] = val;
            }
            static async get(key: string): Promise<string | null> {
                return ServerFoo.values[key] ?? null;
            }
            static async mark(): Promise<void> {
                ServerFoo.marked = true;
            }
            static async isMarked(): Promise<boolean> {
                return ServerFoo.marked;
            }
        }
        const [s1, s2] = getSockets();
        const server = NetClass.createServer<IFoo>({
            object: ServerFoo,
        });
        server.connect(s1);
        const client = await NetClass.createClient<IFoo>(s2);
        const ClientFoo = client.getObject();
        expect(await ClientFoo.get('key1')).toBeNull();
        await ClientFoo.set('key2', 'val2');
        expect(clean(ServerFoo.values)).toEqual({ key2: 'val2' });
        expect(await ClientFoo.get('key1')).toBeNull();
        expect(await ClientFoo.get('key2')).toBe('val2');

        expect(ServerFoo.marked).toBeFalsy();
        expect(await ClientFoo.isMarked()).toBeFalsy();
        await ClientFoo.mark();
        expect(await ClientFoo.isMarked()).toBeTruthy();
        expect(ServerFoo.marked).toBeTruthy();
    });

    test('class with instance functions', async () => {
        class Person {
            static async create(name: string) {
                return new Person(name);
            }
            private name: string;
            constructor(name: string) {
                this.name = name;
            }
            async getName(): Promise<string> {
                return this.name;
            }
            async setName(name: string): Promise<void> {
                this.name = name;
            }
        }
        const [s1, s2] = getSockets();
        const server = NetClass.createServer<typeof Person>({
            object: Person,
        });
        server.connect(s1);
        const client = await NetClass.createClient<typeof Person>(s2);
        const ClientPerson = client.getObject();
        const p1 = await ClientPerson.create('alice');
        const p2 = await ClientPerson.create('bob');
        expect(p1.getName()).resolves.toBe('alice');
        expect(p2.getName()).resolves.toBe('bob');
        expect(p2.setName('carol')).resolves.toBeUndefined();
        expect(p2.getName()).resolves.toBe('carol');
        expect(p1.getName()).resolves.toBe('alice');
    });

    test('instance as return type', async () => {
        class Person {
            private name: string;
            constructor(name: string) {
                this.name = name;
            }
            async getName(): Promise<string> {
                return this.name;
            }
            async setName(name: string): Promise<void> {
                this.name = name;
            }
        }
        class People {
            static async create() {
                return new People();
            }
            private person: Person | null = null;
            async set(name: string) {
                this.person = new Person(name);
            }
            async get(): Promise<Person | null> {
                return this.person;
            }
        }
        const [s1, s2] = getSockets();
        const server = NetClass.createServer<typeof People>({
            object: People,
        });
        const assertNumTracked = (num: number) =>
            expect(getNumTrackedObjects(server)).toBe(num);
        server.connect(s1);
        const client = await NetClass.createClient<typeof People>(s2);
        const ClientPeople = client.getObject();
        assertNumTracked(2);
        const ppl = await ClientPeople.create();
        assertNumTracked(3);
        expect(ppl.get()).resolves.toBeNull();
        expect(ppl.set('bob')).resolves.toBeUndefined();
        assertNumTracked(3);
        const bob = await ppl.get();
        assertNumTracked(4);
        expect(bob).not.toBeNull();
        if (bob === null) throw new Error('not possible');
        expect(bob.getName()).resolves.toBe('bob');
        expect(bob.setName('alice')).resolves.toBeUndefined();
        expect(bob.getName()).resolves.toBe('alice');
        assertNumTracked(4);
        const alice = await ppl.get();
        assertNumTracked(4);
        expect(alice).not.toBeNull();
        if (alice === null) throw new Error('not possible');
        expect(alice.getName()).resolves.toBe('alice');
    });

    test('client same object equality', async () => {
        class A {
            constructor(public name: string) {}
        }
        class B {
            static a: A = new A('hello');
            static async get(): Promise<A> {
                return B.a;
            }
        }
        const { clientObject: ClientB } = await initTest(B);
        const x = await ClientB.get();
        expect(x.name).toBe('hello');
        const y = await ClientB.get();
        expect(y.name).toBe('hello');
        expect(x === y).toBeTruthy();
    });

    test('array example', async () => {
        class Person {
            constructor(public name: string) {}
        }
        class People {
            static async init() {
                return new People();
            }

            private people: Person[] = [];

            async addPerson(name: string): Promise<Person> {
                const person = new Person(name);
                this.people.push(person);
                return person;
            }

            async getPeople(): Promise<Person[]> {
                return this.people.slice();
            }
        }
        const [s1, s2] = getSockets();
        const server = NetClass.createServer<typeof People>({
            object: People,
        });
        server.connect(s1);
        const client = await NetClass.createClient<typeof People>(s2);
        const ClientPeople = client.getObject();
        const ppl = await ClientPeople.init();
        const alice = await ppl.addPerson('alice');
        const bob = await ppl.addPerson('bob');
        const arr = await ppl.getPeople();
        expect(alice.name).toBe('alice');
        expect(bob.name).toBe('bob');
        expect(arr[0]).toBe(alice);
        expect(arr[1]).toBe(bob);
    });

    test('instance properties on create - resolveAll', async () => {
        class A {
            static async init(name: string) {
                return new A(name);
            }
            constructor(public name: string) {}
            async getName(): Promise<string> {
                return this.name;
            }
        }
        const [s1, s2] = getSockets();
        const server = NetClass.createServer<typeof A>({
            object: A,
        });
        server.connect(s1);
        const client = await NetClass.createClient<typeof A>(s2);
        const ClientA = client.getObject();
        const a = await ClientA.init('alice');
        expect(a.name).toBe('alice');
        expect(a.getName()).resolves.toBe('alice');
    });

    test('netclass id property', async () => {
        const { clientObject } = await initTest({
            a: 1,
            b: {
                c: 'hello',
            },
        });
        const obj: any = clientObject;
        expect(obj._netclass_info).toBe(1);
        expect(obj.b._netclass_info).toBe(2);
        expect(clientObject).toEqual({
            a: 1,
            b: {
                c: 'hello',
            },
        });
    });

    test('tracked object as argument', async () => {
        class Person {
            static async init(name: string) {
                return new Person(name);
            }
            constructor(public name: string) {}
        }
        class A {
            static person: Person | null = null;

            static async setPerson(person: Person) {
                A.person = person;
            }

            static async getPerson(): Promise<Person | null> {
                return A.person;
            }
        }
        const {
            clientObject: { A: ClientA, Person: ClientPerson },
        } = await initTest({ A, Person });
        expect(await ClientA.getPerson()).toBeNull();
        const alice = await ClientPerson.init('alice');
        expect(alice.name).toBe('alice');
        await ClientA.setPerson(alice);
        expect(await ClientA.getPerson()).toBe(alice);
    });

    test('track function arguments', async () => {
        const A = NCUtil.sync(
            class {
                static obj: any = { a: 1 };

                static async setObj(obj: any) {
                    A.obj = obj;
                    A.obj.hi = true;
                }
            }
        );
        const { clientObject: CA, clientObject2: CA2 } =
            await initMultiClientTest(A);
        const obj1 = CA.obj;
        const obj2 = CA2.obj;
        expect(obj1).toEqual({ a: 1 });
        expect(obj2).toEqual({ a: 1 });
        expect(obj1).not.toBe(obj2);
        const newObj = { b: 2 };
        await CA.setObj(newObj);
        expect(newObj).toEqual({ b: 2, hi: true });
        expect(CA.obj).not.toBe(obj1);
        expect(CA.obj).toBe(newObj);
        await sleep(10);
        expect(CA2.obj).not.toBe(obj2);
        expect(CA2.obj).not.toBe(newObj);
        expect(CA2.obj).toEqual(newObj);
    });

    test('exclude underscores', async () => {
        const obj = {
            a: {
                b: 1,
                _c: 2,
            },
            _d: 3,
            e: 'yes',
        };
        const { clientObject } = await initTest(obj);
        expect(clientObject).toEqual({
            a: {
                b: 1,
            },
            e: 'yes',
        });
    });

    test('include underscores', async () => {
        const obj = {
            a: {
                b: 1,
                _c: 2,
            },
            _d: 3,
            e: 'yes',
        };
        const { clientObject } = await initTest(obj, {
            includeUnderscoreProperties: true,
        });
        expect(clientObject).toEqual({
            a: {
                b: 1,
                _c: 2,
            },
            _d: 3,
            e: 'yes',
        });
    });
});

describe('Netclass - prop updates', () => {
    test('simple updates', async () => {
        const Person = NCUtil.sync(
            class P {
                static nextID: number = 1;
                static async create(name: string): Promise<P> {
                    return new Person(Person.nextID++, name);
                }
                constructor(public id: number, public name: string) {}
                async setName(name: string) {
                    this.name = name;
                }
            }
        );
        const { clientObject: CPerson } = await initTest(Person);
        expect(CPerson.nextID).toBe(1);
        const alice = await CPerson.create('alice');
        expect(CPerson.nextID).toBe(2);
        expect(alice.id).toBe(1);
        expect(alice.name).toBe('alice');
        await alice.setName('bob');
        expect(alice.name).toBe('bob');
    });

    test('multi client updates', async () => {
        const A = NCUtil.sync(
            class {
                static val: string = 'first';

                static async setVal(val: string) {
                    A.val = val;
                }
            }
        );
        const { clientObject: CA, clientObject2: CA2 } =
            await initMultiClientTest(A);
        expect(CA.val).toBe('first');
        expect(CA2.val).toBe('first');
        await CA.setVal('next');
        expect(CA.val).toBe('next');
        await sleep(10);
        expect(CA2.val).toBe('next');
    });

    test('new values are proxies', async () => {
        const A = NCUtil.sync(
            class {
                static obj: any = { a: 1 };

                static async set(path: string[], key: string, val: any) {
                    let obj = A.obj;
                    for (let p of path) {
                        if (!(p in obj)) {
                            obj[p] = {};
                        }
                        obj = obj[p];
                    }
                    obj[key] = val;
                }
            }
        );
        const { clientObject: CA, clientObject2: CA2 } =
            await initMultiClientTest(A);
        expect(CA.obj).toEqual({ a: 1 });
        expect(CA2.obj).toEqual({ a: 1 });
        await CA.set([], 'a', 'hello');
        expect(CA.obj).toEqual({ a: 'hello' });
        await sleep(10);
        expect(CA2.obj).toEqual({ a: 'hello' });
        await CA2.set(['b', 'c'], 'd', 'eee');
        expect(CA2.obj).toEqual({ a: 'hello', b: { c: { d: 'eee' } } });
        await sleep(10);
        expect(CA.obj).toEqual({ a: 'hello', b: { c: { d: 'eee' } } });
    });
});

describe('Netclass - garbage collection', () => {
    test('simple gc', async () => {
        class A {
            static async wrap(n: number) {
                return { n };
            }
        }
        const {
            server,
            s2,
            c2s2,
            clientObject: CA,
            clientObject2: CA2,
        } = await initMultiClientTest(A);
        const base = 2;
        expect(getNumTrackedObjects(server)).toBe(base);
        await CA.wrap(1);
        expect(getNumTrackedObjects(server)).toBe(base + 1);
        await CA.wrap(1);
        expect(getNumTrackedObjects(server)).toBe(base + 2);
        await CA.wrap(1);
        expect(getNumTrackedObjects(server)).toBe(base + 3);
        await CA2.wrap(1);
        expect(getNumTrackedObjects(server)).toBe(base + 4);
        s2.close();
        expect(getNumTrackedObjects(server)).toBe(base + 1);
        c2s2.close();
        expect(getNumTrackedObjects(server)).toBe(base);
    });

    test('instance gc', async () => {
        class Person {
            static async create(name: string) {
                return new Person(name);
            }
            constructor(public name: string) {}
        }
        const {
            server,
            s2,
            c2s2,
            clientObject: CA,
            clientObject2: CA2,
        } = await initMultiClientTest(Person);
        const base = 2;
        expect(getNumTrackedObjects(server)).toBe(base);
        await CA.create('a');
        expect(getNumTrackedObjects(server)).toBe(base + 1);
        await CA.create('b');
        expect(getNumTrackedObjects(server)).toBe(base + 2);
        await CA2.create('c');
        expect(getNumTrackedObjects(server)).toBe(base + 3);
        s2.close();
        expect(getNumTrackedObjects(server)).toBe(base + 1);
        c2s2.close();
        expect(getNumTrackedObjects(server)).toBe(base);
    });

    test('shared object', async () => {
        let db: { value: any } = NCUtil.sync({ value: { a: 1 } });
        const {
            server,
            clientObject: CA,
            clientObject2: CA2,
            s2,
            c2s2,
        } = await initMultiClientTest({
            set: async (value: any) => {
                db.value = value;
            },
            get: async () => {
                return db;
            },
        });
        const base = 3;
        expect(getNumTrackedObjects(server)).toBe(base);
        const db1 = await CA.get();
        expect(db1.value).toEqual({ a: 1 });
        expect(getNumTrackedObjects(server)).toBe(base + 2);
        const db2 = await CA2.get();
        expect(db2.value).toEqual({ a: 1 });
        expect(getNumTrackedObjects(server)).toBe(base + 2);
        const newVal = { b: 2 };
        await CA.set(newVal);
        expect(getNumTrackedObjects(server)).toBe(base + 3);
        // TODO once GC is run, we should delete the OG {a:1} and tell all clients to delete as well
        expect(db1.value).toBe(newVal);
        await sleep(10);
        expect(getNumTrackedObjects(server)).toBe(base + 3);
        expect(db2.value).toEqual({ b: 2 });
        s2.close();
        expect(getNumTrackedObjects(server)).toBe(base + 3);
        c2s2.close();
        expect(getNumTrackedObjects(server)).toBe(base);
    });

    function trackedFunctionReturnTest(options: {
        wrapTracked: boolean;
        wrapUntracked: boolean;
        defaultTracked: boolean;
        isTracked: boolean;
    }) {
        test(`function return ${JSON.stringify(options)}`, async () => {
            class A {
                private static _obj: any = { a: 1 };

                static async foo() {
                    if (options.wrapTracked) {
                        return NCUtil.tracked(A._obj);
                    } else if (options.wrapUntracked) {
                        return NCUtil.untracked(A._obj);
                    } else {
                        return A._obj;
                    }
                }
            }
            const {
                server,
                clientObject: CA,
                s2,
            } = await initTest(A, {
                trackFunctionReturnValues: options.defaultTracked,
            });
            const base = 2;
            const add = options.isTracked ? 1 : 0;
            expect(getNumTrackedObjects(server)).toBe(base);
            const obj = await CA.foo();
            expect(getNumTrackedObjects(server)).toBe(base + add);
            expect(obj).toEqual({ a: 1 });
            const obj2 = await CA.foo();
            expect(getNumTrackedObjects(server)).toBe(base + add);
            expect(obj2).toEqual({ a: 1 });
            if (options.isTracked) {
                expect(obj2).toBe(obj);
            } else {
                expect(obj2).not.toBe(obj);
            }
            s2.close();
            expect(getNumTrackedObjects(server)).toBe(base);
        });
    }

    trackedFunctionReturnTest({
        wrapTracked: false,
        wrapUntracked: false,
        defaultTracked: true,
        isTracked: true,
    });
    trackedFunctionReturnTest({
        wrapTracked: false,
        wrapUntracked: true,
        defaultTracked: true,
        isTracked: false,
    });
    trackedFunctionReturnTest({
        wrapTracked: false,
        wrapUntracked: false,
        defaultTracked: false,
        isTracked: false,
    });
    trackedFunctionReturnTest({
        wrapTracked: true,
        wrapUntracked: false,
        defaultTracked: false,
        isTracked: true,
    });

    test('nc properties are removed from GCed objects', async () => {
        class A {
            static _obj: any = { a: 1 };

            static async foo() {
                return A._obj;
            }
        }
        const { server, clientObject: CA, s2 } = await initTest(A);
        const base = 2;
        expect(getNumTrackedObjects(server)).toBe(base);
        await CA.foo();
        expect(getNumTrackedObjects(server)).toBe(base + 1);
        await CA.foo();
        expect(getNumTrackedObjects(server)).toBe(base + 1);
        s2.close();
        expect(getNumTrackedObjects(server)).toBe(base);

        const [s1, s3] = getSockets();
        server.connect(s1);
        const client2 = await NetClass.createClient<typeof A>(s3);
        const CA2 = client2.getObject();
        expect(getNumTrackedObjects(server)).toBe(base);
        await CA2.foo();
        expect(getNumTrackedObjects(server)).toBe(base + 1);
        await CA2.foo();
        expect(getNumTrackedObjects(server)).toBe(base + 1);
        s3.close();
        expect(getNumTrackedObjects(server)).toBe(base);
    });
});

describe('NetClass - split socket', () => {
    test('split socket', async () => {
        const [s1, s2] = getSockets();
        const Host1 = NCUtil.sync(
            class H1 {
                static str: string = 'host1';
                static async setStr(str: string) {
                    Host1.str = str;
                }
            }
        );
        const Host2 = NCUtil.sync(
            class H2 {
                static num: number = 1;
                static async setNum(num: number) {
                    Host2.num = num;
                }
            }
        );
        const h1Sockets = NCUtil.splitSocket(s1);
        const h2Sockets = NCUtil.splitSocket(s2);
        const h1Server = NetClass.createServer({
            object: Host1,
        });
        const h2Server = NetClass.createServer({
            object: Host2,
        });
        h1Server.connect(h1Sockets.server);
        h2Server.connect(h2Sockets.server);
        const h1Client = await NetClass.createClient<typeof Host2>(
            h1Sockets.client
        );
        const h2Client = await NetClass.createClient<typeof Host1>(
            h2Sockets.client
        );
        const h1Host2 = h1Client.getObject();
        const h2Host1 = h2Client.getObject();
        expect(h1Host2.num).toBe(1);
        expect(h2Host1.str).toBe('host1');
        await h1Host2.setNum(42);
        expect(h1Host2.num).toBe(42);
        await h2Host1.setStr('hello');
        expect(h2Host1.str).toBe('hello');
    });
});
