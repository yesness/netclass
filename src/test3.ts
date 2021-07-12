import { getStructure } from './util';
const FUNC = () => {};

console.log(
    JSON.stringify(
        getStructure({
            obj1: {
                func1: FUNC,
                sub: {
                    func2: FUNC,
                },
            },
            func3: FUNC,
            obj2: {
                func4: FUNC,
                sub2: {
                    sub3: {
                        func5: FUNC,
                    },
                },
            },
        }),
        null,
        2
    )
);
