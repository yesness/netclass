import YNEvents from '@yesness/events';
import { IYNSocket } from '@yesness/socket';

class NCSocket extends YNEvents implements IYNSocket {
    constructor(
        private callbacks: {
            send: (data: Buffer | string) => void;
            close: () => void;
        }
    ) {
        super();
    }

    send(data: Buffer | string) {
        this.callbacks.send(data);
    }

    close() {
        this.callbacks.close();
    }
}

export default function splitSocket(socket: IYNSocket): {
    server: IYNSocket;
    client: IYNSocket;
} {
    const server = new NCSocket({
        send(data) {
            socket.send(`S${data.toString()}`);
        },
        close() {
            socket.close();
        },
    });
    const client = new NCSocket({
        send(data) {
            socket.send(`C${data.toString()}`);
        },
        close() {
            socket.close();
        },
    });
    socket.on('close', () => {
        server.emit('close');
        client.emit('close');
    });
    socket.on('data', (data) => {
        const str = data.toString();
        const sock = str.charAt(0) === 'S' ? client : server;
        sock.emit('data', Buffer.from(str.slice(1)));
    });
    return { server, client };
}
