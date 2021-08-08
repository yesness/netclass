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

export type MessageCreateInstance = {
    type: 'create_instance';
    instanceID: number;
    functionRef: FunctionRef;
    args: any[];
};

export type PartialMessage =
    | MessageGetStructure
    | MessageCallFunc
    | MessageCreateInstance;

export type Message = PartialMessage & MsgID;

export type ObjectStructureMap = Record<number, ComplexStructure>;

export type PacketStructure = {
    type: 'get_structure_result' | 'call_func_result';
    value: StructureValue;
    newObjects: ObjectStructureMap;
};

export type PacketCreateInstanceResult = {
    type: 'create_instance_result';
    newObjects: ObjectStructureMap;
};

export type PacketError = {
    type: 'error';
    error: string;
};

export type PartialPacket =
    | PacketStructure
    | PacketCreateInstanceResult
    | PacketError;

export type Packet = PartialPacket & MsgID;
