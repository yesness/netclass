import { IYNSocket } from '@yesness/socket';
import DelayProxy from './delayProxy';

export type SocketSend<T> = (json: T) => void;

export function randomString(length: number): string {
    const alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let str = '';
    for (let i = 0; i < length; i++) {
        str += alpha[Math.floor(Math.random() * alpha.length)];
    }
    return str;
}

export function handleSocket<TSend, TReceive>(
    socket: IYNSocket,
    callbacks: {
        onJSON: (json: TReceive) => void;
        onClose?: () => void;
    }
): SocketSend<TSend> {
    let closed = false;
    let buffer = '';
    socket.on('data', (data) => {
        if (closed) return;
        try {
            buffer += data.toString('utf-8');
            const spl = buffer.split('\n');
            buffer = spl.splice(spl.length - 1, 1)[0];
            for (let line of spl) {
                let json: TReceive;
                try {
                    json = JSON.parse(line);
                } catch (e) {
                    throw new Error(
                        `JSON error when parsing line "${line}": ${e.message}`
                    );
                }
                callbacks.onJSON(json);
            }
        } catch (e) {
            closed = true;
            console.error('Socket error', e);
            socket.close();
        }
    });
    socket.on('close', () => {
        closed = true;
        callbacks.onClose?.();
    });
    return (json) => {
        socket.send(Buffer.from(`${JSON.stringify(json)}\n`, 'utf-8'));
    };
}

export type GetAllPropsType = 'function' | 'instance' | 'object' | 'array';

class PropUtilClass {
    private objectStop: any;
    private functionStop: any;
    private defaultFunctionProps: string[];
    private defaultInstanceProps: string[];
    private defaultArrayProps: string[];

    constructor() {
        function EmptyFunc() {}
        const B: any = EmptyFunc;
        this.objectStop = Object.getPrototypeOf({});
        this.functionStop = Object.getPrototypeOf(EmptyFunc);
        this.defaultFunctionProps = [];
        this.defaultFunctionProps = this.getAllProps(EmptyFunc, 'function');
        this.defaultInstanceProps = [];
        this.defaultInstanceProps = this.getAllProps(new B(), 'instance');
        this.defaultArrayProps = [];
        this.defaultArrayProps = this.getAllProps([], 'array');
    }

    getAllProps(
        toCheck: any,
        type: GetAllPropsType,
        options?: {
            excludeProps?: string[];
            excludeUnderscore?: boolean;
        }
    ): string[] {
        const excludeProps = options?.excludeProps ?? [];
        const excludeUnderscore = options?.excludeUnderscore ?? true;
        const props: string[] = [];
        let obj = toCheck;
        while (true) {
            if (
                !obj ||
                obj === this.objectStop ||
                (type === 'function' && obj === this.functionStop)
            )
                break;
            props.push(...Object.getOwnPropertyNames(obj));
            obj = Object.getPrototypeOf(obj);
        }
        return props.sort().filter((prop, idx, arr) => {
            if (
                (type === 'function' &&
                    this.defaultFunctionProps.includes(prop)) ||
                (type === 'instance' &&
                    this.defaultInstanceProps.includes(prop)) ||
                (type === 'array' &&
                    (this.defaultArrayProps.includes(prop) ||
                        !isNaN(parseInt(prop)))) ||
                excludeProps.includes(prop) ||
                prop === DelayProxy.propertyName ||
                (excludeUnderscore && prop.startsWith('_'))
            ) {
                return false;
            }
            return prop != arr[idx + 1];
        });
    }
}
export const PropUtil = new PropUtilClass();
