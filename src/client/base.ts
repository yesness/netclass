import { Message, Packet, PartialMessage } from '../internalTypes';
import { Structure } from '../structurer';
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

    async send(msg: PartialMessage): Promise<Packet> {
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
        if (packet.type !== 'get_structure_result') {
            throw new Error('Invalid response packet');
        }
        return packet.structure;
    }
}
