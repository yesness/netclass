type DPValue = {
    setHandler: (handler: ProxyHandler<any>) => void;
};

export default class DelayProxy {
    static propertyName = '_netclass_proxy';

    static get<TData>(object: object): DPValue {
        if (!DelayProxy.isProxy(object)) {
            throw new Error('Provided object is not a DelayProxy');
        }
        const obj: any = object;
        return obj[DelayProxy.propertyName];
    }

    static isProxy<T extends object>(object: T): boolean {
        return DelayProxy.propertyName in object;
    }

    static create<TObject extends object, TData>(object: TObject): TObject {
        const handler: ProxyHandler<TObject> = {};
        const dpValue: DPValue = {
            setHandler: (update) => {
                const h: any = handler;
                for (const key of Object.keys(h)) {
                    delete h[key];
                }
                for (const [key, value] of Object.entries(update)) {
                    h[key] = value;
                }
            },
        };
        Object.defineProperty(object, DelayProxy.propertyName, {
            value: dpValue,
        });
        return new Proxy(object, handler);
    }
}
