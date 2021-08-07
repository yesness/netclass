import { Structure } from './structurer';

type MsgID = {
    msgID: string;
};

export type CallPath = {
    path: string[];
    objectID: number;
};

export type MessageGetStructure = {
    type: 'get_structure';
};

export type MessageCallFunc = {
    type: 'call_func';
    path: CallPath;
    args: any[];
};

export type MessageCreateInstance = {
    type: 'create_instance';
    instanceID: number;
    path: CallPath;
    args: any[];
};

export type PartialMessage =
    | MessageGetStructure
    | MessageCallFunc
    | MessageCreateInstance;

export type Message = PartialMessage & MsgID;

export type PacketStructure = {
    type: 'get_structure_result' | 'call_func_result';
    structure: Structure;
};

export type PacketSuccess = {
    type: 'success';
};

export type PacketError = {
    type: 'error';
    error: string;
};

export type PartialPacket = PacketStructure | PacketSuccess | PacketError;

export type Packet = PartialPacket & MsgID;
