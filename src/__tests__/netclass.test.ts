import NetClass from '..';
import { INCServer, INCSocket } from '../types';

type DataCB = (data: Buffer) => void;
type CloseCB = () => void;

function getSockets(): [INCSocket, INCSocket] {
    const s1data: DataCB[] = [];
    const s2data: DataCB[] = [];
    const s1close: CloseCB[] = [];
    const s2close: CloseCB[] = [];
    const onClose = () => s1close.concat(s2close).forEach((cb) => cb());
    const s1: INCSocket = {
        send: (data: Buffer) => {
            s2data.forEach((cb) => cb(data));
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
            s1data.forEach((cb) => cb(data));
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
    return Object.keys(s.trackedObjects).length;
}

describe('NetClass', () => {
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
        expect(clientObject.get()).resolves.toBe('start');
        expect(clientObject.set('newval')).resolves.toBeUndefined();
        expect(value).toBe('newval');
        expect(clientObject.get()).resolves.toBe('newval');
    });

    test('class with static functions', async () => {
        interface IFoo {
            set(key: string, val: string): Promise<void>;
            get(key: string): Promise<string | null>;
            mark(): Promise<void>;
            isMarked(): Promise<boolean>;
        }
        class ServerFoo extends NetClass {
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
        expect(ClientFoo.get('key1')).resolves.toBeNull();
        expect(ClientFoo.set('key2', 'val2')).resolves.toBeUndefined();
        expect(ServerFoo.values).toEqual({ key2: 'val2' });
        expect(ClientFoo.get('key1')).resolves.toBeNull();
        expect(ClientFoo.get('key2')).resolves.toBe('val2');

        expect(ServerFoo.marked).toBeFalsy();
        expect(ClientFoo.isMarked()).resolves.toBeFalsy();
        expect(ClientFoo.mark()).resolves.toBeUndefined();
        expect(ClientFoo.isMarked()).resolves.toBeTruthy();
        expect(ServerFoo.marked).toBeTruthy();
    });

    test('class with instance functions', async () => {
        class Person extends NetClass {
            private name: string;
            constructor(name: string) {
                super();
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
        const p1 = new ClientPerson('alice');
        const p2 = new ClientPerson('bob');
        expect(p1.getName()).resolves.toBe('alice');
        expect(p2.getName()).resolves.toBe('bob');
        expect(p2.setName('carol')).resolves.toBeUndefined();
        expect(p2.getName()).resolves.toBe('carol');
        expect(p1.getName()).resolves.toBe('alice');
    });

    test('garbage collection', async () => {
        class A extends NetClass {}
        const [s1, s2] = getSockets();
        const server = NetClass.createServer<typeof A>({
            object: A,
        });
        server.connect(s1);
        const client = await NetClass.createClient<typeof A>(s2);
        const ClientA = client.getObject();
        expect(getNumTrackedObjects(server)).toBe(0);
        new ClientA();
        expect(getNumTrackedObjects(server)).toBe(1);
        s1.close();
        expect(getNumTrackedObjects(server)).toBe(1);
        server.garbageCollect();
        expect(getNumTrackedObjects(server)).toBe(0);
    });
});
