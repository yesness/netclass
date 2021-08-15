import NetClass from '..';
import NCServer from '../server';
import { INCClient, INCServer, INCSocket } from '../types';

type DataCB = (data: Buffer) => void;
type CloseCB = () => void;

function sleep(time: number) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

function getSockets(delay: number = 1): [INCSocket, INCSocket] {
    const s1data: DataCB[] = [];
    const s2data: DataCB[] = [];
    const s1close: CloseCB[] = [];
    const s2close: CloseCB[] = [];
    const onClose = () => s1close.concat(s2close).forEach((cb) => cb());
    const s1: INCSocket = {
        send: (data: Buffer) => {
            setTimeout(() => s2data.forEach((cb) => cb(data)), delay);
        },
        close: onClose,
        onData: (cb: DataCB) => {
            s1data.push(cb);
        },
        onClose: (cb: CloseCB) => {
            s1close.push(cb);
        },
    };
    const s2: INCSocket = {
        send: (data: Buffer) => {
            setTimeout(() => s1data.forEach((cb) => cb(data)), delay);
        },
        close: onClose,
        onData: (cb: DataCB) => {
            s2data.push(cb);
        },
        onClose: (cb: CloseCB) => {
            s2close.push(cb);
        },
    };
    return [s1, s2];
}

type TestData<T> = {
    s1: INCSocket;
    s2: INCSocket;
    server: INCServer;
    client: INCClient<T>;
    serverObject: T;
    clientObject: T;
};

async function initTest<T>(
    object: T,
    debugLogging?: boolean
): Promise<TestData<T>> {
    const [s1, s2] = getSockets();
    const server = NetClass.createServer<T>({
        object,
        debugLogging,
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
    c2s1: INCSocket;
    c2s2: INCSocket;
};

async function initMultiClientTest<T>(
    object: T,
    debugLogging?: boolean
): Promise<MultiTestData<T>> {
    const testData = await initTest(object, debugLogging);
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
        const A = NCServer.sync(
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
});

describe('Netclass - prop updates', () => {
    test('simple updates', async () => {
        const Person = NCServer.sync(
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
        const A = NCServer.sync(
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
        const A = NCServer.sync(
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
        let db: { value: any } = NCServer.sync({ value: { a: 1 } });
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
});
