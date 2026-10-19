// The handful of React Native APIs this package touches, declared locally so
// type-checking does not need the react-native package installed. Consumers
// compile against react-native's own types; these signatures are a subset.
declare module 'react-native' {
  import type * as React from 'react';

  export const NativeModules: { [name: string]: any };

  export const UIManager: {
    getViewManagerConfig?(name: string): unknown;
    hasViewManagerConfig?(name: string): boolean;
  };

  export type StyleProp<T> = T | ReadonlyArray<StyleProp<T>> | null | undefined | false;
  export interface ViewStyle {
    [key: string]: unknown;
  }
  export interface ViewProps {
    style?: StyleProp<ViewStyle>;
    testID?: string;
    children?: React.ReactNode;
  }
  export interface NativeSyntheticEvent<T> {
    nativeEvent: T;
  }

  export const View: React.ComponentType<ViewProps>;
  export const Text: React.ComponentType<{ style?: StyleProp<ViewStyle>; children?: React.ReactNode }>;

  export function requireNativeComponent<P>(name: string): React.ComponentType<P>;

  export const Platform: {
    OS: 'ios' | 'android' | 'macos' | 'windows' | 'web';
    select<T>(spec: { ios?: T; android?: T; default?: T }): T | undefined;
  };
}
