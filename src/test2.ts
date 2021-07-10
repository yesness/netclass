import NetClass from '.';
import { INCSocket } from './types';
import { wrapClass } from './wrapper';

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

interface IFoo {
    getName(): Promise<string>;
    setName(name: string): Promise<void>;
}

interface IFooConstruct {
    new (): IFoo;
    foot(): Promise<string>;
}

type ObjectType = {
    Foo: IFooConstruct;
};

class Foo implements IFoo {
    private name: string;
    constructor() {
        this.name = 'default name';
    }
    async getName(): Promise<string> {
        return this.name;
    }
    async setName(name: string): Promise<void> {
        this.name = name;
    }

    static async foot() {
        return 'FOOT';
    }
}

async function main() {
    const [s1, s2] = getSockets();
    const server = NetClass.createServer<ObjectType>({
        object: {
            Foo: wrapClass(Foo),
        },
    });
    server.connect(s1);
    const client = await NetClass.createClient<ObjectType>(s2);
    const { Foo: ClientFoo } = client.getObject();
    const foo = new ClientFoo();
    console.log('name', await foo.getName());
    await foo.setName('robert');
    console.log('name', await foo.getName());
    console.log('foot', await ClientFoo.foot());
}

async function main2() {
    const MyFoo = wrapClass(Foo);
    const foo = new MyFoo();
    console.log(await foo.getName());
    console.log(MyFoo);
}

main().catch(console.error);
