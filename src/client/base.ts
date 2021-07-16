import {
    CallPath,
    Message,
    MessageCreateInstance,
    Packet,
    PartialMessage,
    Structure,
} from '../internalTypes';
import { INCSocket } from '../types';
import { handleSocket, randomString, SocketSend } from '../util';

export default class BaseClient {
    private messageResolves: Record<string, Function>;
    private sendRaw: SocketSend<Message>;

    constructor(socket: INCSocket, private debugLogging: boolean) {
        this.messageResolves = {};
        this.sendRaw = handleSocket(socket, {
            onJSON: (packet: Packet) => this.onPacket(packet),
        });
    }

    private getMessageID(): string {
        while (true) {
            const msgID = randomString(20);
            if (!(msgID in this.messageResolves)) {
                return msgID;
            }
        }
    }

    private async send(msg: PartialMessage): Promise<Packet> {
        const packet: Packet = await new Promise((resolve) => {
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

    async getStructure(): Promise<Structure> {
        const packet = await this.send({ type: 'get_structure' });
        if (packet.type !== 'structure') {
            throw new Error('Invalid response packet');
        }
        return packet.structure;
    }

    async callFunc(path: CallPath, args: any[]): Promise<any> {
        const packet = await this.send({
            type: 'call_func',
            path,
            args,
        });
        if (packet.type !== 'result') {
            throw new Error('Invalid response packet');
        }
        return packet.result;
    }

    async createInstance(
        args: Pick<MessageCreateInstance, 'instanceID' | 'path' | 'args'>
    ): Promise<void> {
        const packet = await this.send({
            type: 'create_instance',
            ...args,
        });
        if (packet.type !== 'success') {
            throw new Error('Invalid response packet');
        }
    }
}
