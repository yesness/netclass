import {
    Message,
    Packet,
    PacketInit,
    PartialMessage,
    RPacket,
    SPacket,
} from '../internalTypes';
import { INCSocket } from '../types';
import { handleSocket, randomString, SocketSend } from '../util';

type SPacketListener = (packet: SPacket) => void;

export interface IBaseClient {
    on(event: 'spacket', listener: SPacketListener): this;
    send(msg: PartialMessage): Promise<RPacket>;
}

export default class BaseClient implements IBaseClient {
    private messageResolves: Record<string, Function>;
    private sendRaw: SocketSend<Message>;
    private sPacketListener: SPacketListener[] = [];

    constructor(socket: INCSocket, private debugLogging: boolean) {
        this.messageResolves = {};
        this.sendRaw = handleSocket<Message, Packet>(socket, {
            onJSON: (packet: Packet) => this.onPacket(packet),
        });
    }

    on(event: 'spacket', listener: (packet: SPacket) => void) {
        this.sPacketListener.push(listener);
        return this;
    }

    private getMessageID(): string {
        while (true) {
            const msgID = randomString(20);
            if (!(msgID in this.messageResolves)) {
                return msgID;
            }
        }
    }

    async send(msg: PartialMessage): Promise<RPacket> {
        const packet: RPacket = await new Promise((resolve) => {
            const msgID = this.getMessageID();
            this.messageResolves[msgID] = resolve;
            this.sendRaw({
                ...msg,
                msgID,
            });
        });
        if (packet.type === 'error') {
            throw new Error(
                `Error response from ${JSON.stringify(msg)}:\n\t${packet.error}`
            );
        }
        return packet;
    }

    private onPacket(packet: Packet) {
        if ('msgID' in packet) {
            this.onRPacket(packet);
        } else {
            this.onSPacket(packet);
        }
    }

    private onRPacket(packet: RPacket) {
        const resolve = this.messageResolves[packet.msgID];
        if (!resolve) {
            throw new Error(
                `Received packet with invalid msgID: ${JSON.stringify(packet)}`
            );
        }
        if (this.debugLogging) {
            console.debug('[CLIENT] onPacket', JSON.stringify(packet, null, 2));
        }
        delete this.messageResolves[packet.msgID];
        resolve(packet);
    }

    private onSPacket(packet: SPacket) {
        for (const cb of this.sPacketListener) {
            cb(packet);
        }
    }

    async init(): Promise<PacketInit> {
        const packet = await this.send({ type: 'init' });
        if (packet.type !== 'init') {
            throw new Error('Invalid response packet');
        }
        return packet;
    }
}
