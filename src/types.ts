export declare type ExtensionHook<T, R = any> = (options: R) => ExtensionHookResult<T>
export declare type ExtensionHookResult<T> = [T, boolean, any]
