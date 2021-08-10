import { ComplexStructure, StructureValue } from './structurer';

type MsgID = {
    msgID: string;
};

export type FunctionRef =
    | {
          objectID: number;
          funcName: string;
      }
    | {
          funcObjectID: number;
      };

export type MessageGetStructure = {
    type: 'get_structure';
};

export type MessageCallFunc = {
    type: 'call_func';
    functionRef: FunctionRef;
    args: any[];
};

export type PartialMessage = MessageGetStructure | MessageCallFunc;

export type Message = PartialMessage & MsgID;

export type ObjectStructureMap = Record<number, ComplexStructure>;

export type ValueAndObjects = {
    value: StructureValue;
    newObjects: ObjectStructureMap;
};

export type PacketStructure = ValueAndObjects & {
    type: 'get_structure_result' | 'call_func_result';
};

export type PacketError = {
    type: 'error';
    error: string;
};

export type PartialPacket = PacketStructure | PacketError;

export type Packet = PartialPacket & MsgID;
