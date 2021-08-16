# netclass

Proxy classes, objects, and functions over a network connection.

## Installation

```bash
$ npm install @yesness/netclass
```

## Usage

```js
import NetClass from '@yesness/netclass';

// ===== SERVER SIDE =====
class Foo {
    static bar: string = 'hello';

    async getBar() {
        return bar;
    }

    async setBar(bar: string) {
        Foo.bar = bar;
    }
}

const server = NetClass.createServer({ object: Foo });
// On socket connection
server.connect(socket);

// ===== CLIENT SIDE =====
const client = NetClass.createClient(socket);
const ClientFoo = client.getObject();
console.log(await ClientFoo.getBar()); // 'hello'
await ClientFoo.setBar('goodbye');
console.log(await ClientFoo.getBar()); // 'goodbye'
```

## More Examples

See [the unit tests](https://github.com/yesness/netclass/blob/master/src/__tests__/netclass.test.ts) for more examples.
