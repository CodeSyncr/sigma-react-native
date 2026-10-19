import * as React from 'react';
import { NativeModules, NativeSyntheticEvent, requireNativeComponent, StyleProp, Text, UIManager, View, ViewStyle } from 'react-native';
import {
  answerLinkRequest, callNative, LinkProvider, NATIVE_MISSING, NativeSigmaModule, nextSheetId, normalizeFormat, readPhase, readSaveState,
} from './bridge';
import { SigmaDocument, SigmaError, SigmaFile, SigmaFormat, SigmaSaveState } from './types';

export interface SigmaSheetProps {
  /**
   * Asked for a signed link when the sheet opens, and again whenever one
   * expires. Call your server, which mints it with its `sgm_` key; never put
   * the key in the app.
   */
  link: LinkProvider;
  style?: StyleProp<ViewStyle>;
  /** The sheet opened. */
  onReady?: (document: SigmaDocument) => void;
  /** The sheet could not open (or reopen). The editor shows the error with a Try again button. */
  onError?: (error: SigmaError) => void;
  onSaveStateChange?: (state: SigmaSaveState, error?: SigmaError) => void;
  /** The sheet was renamed. */
  onTitleChange?: (title: string) => void;
  /** A save landed. */
  onSaved?: (at: Date) => void;
  testID?: string;
}

export interface SigmaSheetHandle {
  /** Saves now, without waiting for the pause after typing. */
  save(): Promise<void>;
  /** The sheet as a file, in the format it is kept in or another. */
  export(format?: SigmaFormat): Promise<SigmaFile>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  /** Opens the sheet again from a fresh link. */
  reload(): Promise<void>;
  rename(title: string): Promise<void>;
}

type Body = Record<string, unknown>;

interface NativeProps {
  sheetId: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  onSigmaLinkRequest: (e: NativeSyntheticEvent<Body>) => void;
  onSigmaPhase: (e: NativeSyntheticEvent<Body>) => void;
  onSigmaSaveState: (e: NativeSyntheticEvent<Body>) => void;
  onSigmaTitle: (e: NativeSyntheticEvent<Body>) => void;
  onSigmaSaved: (e: NativeSyntheticEvent<Body>) => void;
}

const VIEW_NAME = 'RNSigmaSheet';
const native: NativeSigmaModule | undefined = NativeModules.RNSigma;

function hasNativeView(): boolean {
  if (!native) return false;
  if (UIManager.hasViewManagerConfig) return UIManager.hasViewManagerConfig(VIEW_NAME);
  return UIManager.getViewManagerConfig ? UIManager.getViewManagerConfig(VIEW_NAME) != null : true;
}

let NativeSheet: React.ComponentType<NativeProps> | null = null;
function nativeSheet(): React.ComponentType<NativeProps> | null {
  if (!NativeSheet && hasNativeView()) NativeSheet = requireNativeComponent<NativeProps>(VIEW_NAME);
  return NativeSheet;
}

/**
 * A Sigma sheet, native on iOS and Android: formula bar, format bar, grid,
 * charts, Vani AI and sheet tabs, saving as people edit.
 *
 * ```tsx
 * <SigmaSheet style={{ flex: 1 }} link={() => api.sheetLink(42)} />
 * ```
 */
export const SigmaSheet = React.forwardRef<SigmaSheetHandle, SigmaSheetProps>(function SigmaSheet(props, ref) {
  const sheetId = React.useRef(nextSheetId()).current;
  // The latest props, so native events always reach the current callbacks.
  const latest = React.useRef(props);
  latest.current = props;

  React.useImperativeHandle(ref, () => ({
    save: async () => { await callNative(native && (() => native.save(sheetId))); },
    export: async (format?: SigmaFormat) => {
      const f = await callNative(native && (() => native.exportSheet(sheetId, format ?? null)));
      return { base64: f.base64, filename: f.filename, format: normalizeFormat(f.format), mimeType: f.mimeType };
    },
    undo: async () => { await callNative(native && (() => native.undo(sheetId))); },
    redo: async () => { await callNative(native && (() => native.redo(sheetId))); },
    reload: async () => { await callNative(native && (() => native.reload(sheetId))); },
    rename: async (title: string) => { await callNative(native && (() => native.rename(sheetId, title))); },
  }), [sheetId]);

  const Sheet = nativeSheet();
  React.useEffect(() => {
    if (!Sheet) latest.current.onError?.(new SigmaError('native_module_unavailable', NATIVE_MISSING));
  }, [Sheet]);

  if (!Sheet || !native) {
    return (
      <View style={[{ alignItems: 'center', justifyContent: 'center', padding: 24 }, props.style]} testID={props.testID}>
        <Text style={{ color: '#5e636b', textAlign: 'center' }}>{NATIVE_MISSING}</Text>
      </View>
    );
  }

  return (
    <Sheet
      sheetId={sheetId}
      style={props.style}
      testID={props.testID}
      onSigmaLinkRequest={(e) => { void answerLinkRequest(String(e.nativeEvent.requestId), latest.current.link, native); }}
      onSigmaPhase={(e) => {
        const p = readPhase(e.nativeEvent);
        if (p.phase === 'ready') latest.current.onReady?.(p.document);
        else if (p.phase === 'failed') latest.current.onError?.(p.error);
      }}
      onSigmaSaveState={(e) => {
        const s = readSaveState(e.nativeEvent);
        latest.current.onSaveStateChange?.(s.state, s.error);
      }}
      onSigmaTitle={(e) => { latest.current.onTitleChange?.(String(e.nativeEvent.title ?? '')); }}
      onSigmaSaved={(e) => { latest.current.onSaved?.(new Date(Number(e.nativeEvent.at))); }}
    />
  );
});
