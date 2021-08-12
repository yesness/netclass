type SimpleValue = {
    type: 'simple';
    value: string | number | boolean | null | undefined;
};

type ObjectReferenceValue = {
    type: 'reference';
    objectID: number;
};

export type StructureValue = SimpleValue | ObjectReferenceValue;
export type ObjectMap = Record<string, StructureValue>;

export type FunctionStructure = {
    type: 'function';
    map: ObjectMap;
};

export type ObjectStructure = {
    type: 'object';
    map: ObjectMap;
    funcs: string[];
    array: StructureValue[] | null;
};

export type ComplexStructure = FunctionStructure | ObjectStructure;

export type ObjectStructureMap = Record<number, ComplexStructure>;

export type ValueAndObjects = {
    value: StructureValue;
    newObjects: ObjectStructureMap;
};
