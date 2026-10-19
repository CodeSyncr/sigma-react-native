// The pieces of react-native this package touches, for tests in Node.
export const NativeModules: { [name: string]: any } = {};
export const UIManager = { hasViewManagerConfig: () => false };
export const View = 'View';
export const Text = 'Text';
export function requireNativeComponent(name: string) { return name; }
export const Platform = { OS: 'ios', select: (s: any) => s.ios ?? s.default };
