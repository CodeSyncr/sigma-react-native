import { SigmaDocument, SigmaError, SigmaErrorCode, SigmaFormat, SigmaSaveState } from './types';

/** The native module's methods, as both platforms implement them. */
export interface NativeSigmaModule {
  provideLink(requestId: string, url: string): void;
  failLink(requestId: string, message: string): void;
  save(sheetId: string): Promise<null>;
  exportSheet(sheetId: string, format: string | null): Promise<{ base64: string; filename: string; format: string; mimeType: string }>;
  undo(sheetId: string): Promise<null>;
  redo(sheetId: string): Promise<null>;
  reload(sheetId: string): Promise<null>;
  rename(sheetId: string, title: string): Promise<null>;
}

/** The link function a sheet is given: your server mints the link with its key. */
export type LinkProvider = () => string | Promise<string>;

let counter = 0;

/** A process-unique id that ties a native sheet view to its JS handle. */
export function nextSheetId(): string {
  counter += 1;
  return `sigma-${Date.now().toString(36)}-${counter}`;
}

const CODES: ReadonlySet<string> = new Set<SigmaErrorCode>([
  'unauthorized', 'quota_exceeded', 'not_found', 'link_expired', 'link_invalid', 'link_failed',
  'engine', 'not_ready', 'editor', 'server', 'network', 'native_module_unavailable',
]);

interface RawError {
  code?: unknown;
  message?: unknown;
  status?: unknown;
  userInfo?: { status?: unknown } | null;
}

/** Turns what native code reported (an event body or a rejected promise) into a SigmaError. */
export function toSigmaError(raw: unknown): SigmaError {
  if (raw instanceof SigmaError) return raw;
  const r = (raw ?? {}) as RawError;
  const code = typeof r.code === 'string' && CODES.has(r.code) ? (r.code as SigmaErrorCode) : 'server';
  const message = typeof r.message === 'string' && r.message ? r.message : 'Sigma could not complete the request.';
  const statusValue = r.status ?? r.userInfo?.status;
  const status = typeof statusValue === 'number' ? statusValue : undefined;
  return new SigmaError(code, message, status);
}

/**
 * Answers the native editor's request for a link: calls your function and
 * hands the URL back, or tells the editor it failed (it then shows the error,
 * and asks again when someone taps Try again).
 */
export async function answerLinkRequest(requestId: string, link: LinkProvider | undefined, native: NativeSigmaModule): Promise<void> {
  try {
    if (!link) throw new Error('No link function was given to <SigmaSheet>.');
    const url = await link();
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('The link function must return the signed link URL your server minted.');
    }
    native.provideLink(requestId, url);
  } catch (e) {
    native.failLink(requestId, e instanceof Error && e.message ? e.message : 'The link could not be fetched.');
  }
}

export type PhaseEvent =
  | { phase: 'loading' }
  | { phase: 'ready'; document: SigmaDocument }
  | { phase: 'failed'; error: SigmaError };

/** Reads the native `phase` event. */
export function readPhase(body: Record<string, unknown>): PhaseEvent {
  if (body.phase === 'ready' && body.document && typeof body.document === 'object') {
    const d = body.document as Record<string, unknown>;
    return {
      phase: 'ready',
      document: {
        id: Number(d.id),
        title: String(d.title ?? ''),
        filename: String(d.filename ?? ''),
        format: d.format === 'xlsx' ? 'xlsx' : 'csv',
        mode: d.mode === 'edit' ? 'edit' : 'view',
        test: d.test === true,
      },
    };
  }
  if (body.phase === 'failed') return { phase: 'failed', error: toSigmaError(body.error) };
  return { phase: 'loading' };
}

/** Reads the native `saveState` event. */
export function readSaveState(body: Record<string, unknown>): { state: SigmaSaveState; error?: SigmaError } {
  const state = body.state;
  if (state === 'failed') return { state, error: toSigmaError(body.error) };
  if (state === 'saved' || state === 'unsaved' || state === 'saving') return { state };
  return { state: 'unsaved' };
}

/** Calls a native method, turning its rejection into a SigmaError. */
export async function callNative<T>(fn: (() => Promise<T>) | undefined): Promise<T> {
  if (!fn) throw new SigmaError('native_module_unavailable', NATIVE_MISSING);
  try {
    return await fn();
  } catch (e) {
    throw toSigmaError(e);
  }
}

export function normalizeFormat(format: string): SigmaFormat {
  return format === 'xlsx' ? 'xlsx' : 'csv';
}

export const NATIVE_MISSING =
  "Sigma's native editor is not in this build. Rebuild the app after installing @codesyncr/sigma-react-native (it does not run in Expo Go).";
