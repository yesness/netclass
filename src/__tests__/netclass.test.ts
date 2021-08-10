import NetClass from '..';
import { INCServer, INCSocket } from '../types';

type DataCB = (data: Buffer) => void;
type CloseCB = () => void;

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

function getNumTrackedObjects(server: INCServer): number {
    const s: any = server;
    const { objects } = s.tracker;
    return Object.keys(objects).length;
}

function sleep(time: number) {
    return new Promise((resolve) => setTimeout(resolve, time));
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
        expect(ServerFoo.values).toEqual({ key2: 'val2' });
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

    test('garbage collection', async () => {
        class A {
            static async create() {
                return new A();
            }
        }
        const [s1, s2] = getSockets();
        const server = NetClass.createServer<typeof A>({
            object: A,
        });
        server.connect(s1);
        const client = await NetClass.createClient<typeof A>(s2);
        const ClientA = client.getObject();
        expect(getNumTrackedObjects(server)).toBe(2);
        await ClientA.create();
        expect(getNumTrackedObjects(server)).toBe(3);
        s1.close();
        expect(getNumTrackedObjects(server)).toBe(2);
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
        const [s1, s2] = getSockets();
        const server = NetClass.createServer<typeof B>({
            object: B,
        });
        server.connect(s1);
        const client = await NetClass.createClient<typeof B>(s2);
        const ClientB = client.getObject();
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
});
