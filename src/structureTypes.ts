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

export type ObjectUpdate = {
    map: ObjectMap;
    deleted: string[];
};
export type ObjectUpdateMap = Record<number, ObjectUpdate>;
export type UpdateBundle = {
    updates: ObjectUpdateMap;
    newObjects: ObjectStructureMap;
};

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

export type ValueBundle = {
    value: StructureValue;
    newObjects: ObjectStructureMap;
};
