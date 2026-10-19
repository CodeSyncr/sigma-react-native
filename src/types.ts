/** The file format a Sigma sheet is kept in; every save rewrites it in this format. */
export type SigmaFormat = 'xlsx' | 'csv';

/** What a signed link lets the person holding it do. */
export type SigmaLinkMode = 'edit' | 'view';

/** The sheet that is open, as Sigma described it. */
export interface SigmaDocument {
  id: number;
  title: string;
  filename: string;
  format: SigmaFormat;
  mode: SigmaLinkMode;
  /** Opened with a test-mode API key (capped, and deleted after a week). */
  test: boolean;
}

export type SigmaSaveState = 'saved' | 'unsaved' | 'saving' | 'failed';

/** A sheet exported from the editor. */
export interface SigmaFile {
  /** The file's bytes, base64-encoded. */
  base64: string;
  filename: string;
  format: SigmaFormat;
  mimeType: string;
}

export type SigmaErrorCode =
  /** The API key is missing, wrong or revoked (401). */
  | 'unauthorized'
  /** This month's allowance of sheet opens is used up, or a test key's cap (402). */
  | 'quota_exceeded'
  /** The document does not exist (404). */
  | 'not_found'
  /** The link has expired, or the editing session it started has ended (410). */
  | 'link_expired'
  /** The link is not valid or was revoked (403). */
  | 'link_invalid'
  /** Your `link` function threw, or returned something that is not a URL. */
  | 'link_failed'
  /** Sigma's spreadsheet engine refused or failed. */
  | 'engine'
  /** The sheet is not open yet. */
  | 'not_ready'
  /** The editor refused (a view-only link asked to save, …). */
  | 'editor'
  /** Any other answer from the server. */
  | 'server'
  /** The request did not reach the server. */
  | 'network'
  /** The native module is not in this build (Expo Go, or the app was not rebuilt). */
  | 'native_module_unavailable';

/** Everything that can go wrong, with the message Nimbus Cloud or Sigma gave. */
export class SigmaError extends Error {
  readonly code: SigmaErrorCode;
  /** The HTTP status, for `server` errors. */
  readonly status?: number;

  constructor(code: SigmaErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'SigmaError';
    this.code = code;
    this.status = status;
  }
}
