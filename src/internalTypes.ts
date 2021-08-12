import { ObjectMap, ValueAndObjects } from './structureTypes';

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

export type MessageInit = {
    type: 'init';
};

export type CallFuncArg =
    | {
          type: 'raw';
          arg: any;
      }
    | {
          type: 'reference';
          objectID: number;
      };

export type MessageCallFunc = {
    type: 'call_func';
    functionRef: FunctionRef;
    args: CallFuncArg[];
};

export type PartialMessage = MessageInit | MessageCallFunc;

export type Message = PartialMessage & MsgID;

export type PacketInit = {
    type: 'init';
    structure: ValueAndObjects;
    idProperty: string;
};

export type PacketCallFuncResult = {
    type: 'call_func_result';
    result: ValueAndObjects;
};

export type PacketUpdates = {
    type: 'update';
    objects: Record<
        number,
        {
            updates: ObjectMap;
        }
    >;
};

export type PacketError = {
    type: 'error';
    error: string;
};

export type PartialPacket = PacketInit | PacketCallFuncResult | PacketError;

export type Packet = PartialPacket & MsgID;
