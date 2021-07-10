type MsgID = {
    msgID: string;
};

type FunctionStructure = {
    type: 'function';
};

type ClassStructure = {
    type: 'class';
    classStructure: Record<string, Structure>;
    instanceStructure: Record<string, Structure>;
};

type ObjectStructure = {
    type: 'object';
    structure: Record<string, Structure>;
};

export type Structure = FunctionStructure | ClassStructure | ObjectStructure;

export type CallPath = Array<
    | string
    | {
          instanceID: string;
      }
>;

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
    instanceID: string;
    path: CallPath;
    args: any[];
};

export type PartialMessage =
    | MessageGetStructure
    | MessageCallFunc
    | MessageCreateInstance;

export type Message = PartialMessage & MsgID;

export type PacketResult = {
    type: 'result';
    result: any;
};

export type PacketStructure = {
    type: 'structure';
    structure: Structure;
};

export type PacketSuccess = {
    type: 'success';
};

export type PacketError = {
    type: 'error';
    error: string;
};

export type PartialPacket =
    | PacketResult
    | PacketStructure
    | PacketSuccess
    | PacketError;

export type Packet = PartialPacket & MsgID;
