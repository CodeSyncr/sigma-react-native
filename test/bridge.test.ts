import { answerLinkRequest, callNative, NativeSigmaModule, nextSheetId, readPhase, readSaveState, toSigmaError } from '../src/bridge';
import { SigmaError } from '../src/types';

function nativeMock() {
  const calls: Array<[string, ...unknown[]]> = [];
  const m = {
    provideLink: (id: string, url: string) => { calls.push(['provideLink', id, url]); },
    failLink: (id: string, message: string) => { calls.push(['failLink', id, message]); },
  } as unknown as NativeSigmaModule;
  return { m, calls };
}

describe('link requests', () => {
  it('hands the URL back to the editor', async () => {
    const { m, calls } = nativeMock();
    await answerLinkRequest('r1', async () => 'https://nimbusgo.space/v/sigma/42?sig=x', m);
    expect(calls).toEqual([['provideLink', 'r1', 'https://nimbusgo.space/v/sigma/42?sig=x']]);
  });

  it('accepts a function that returns the URL directly', async () => {
    const { m, calls } = nativeMock();
    await answerLinkRequest('r2', () => 'http://localhost:3333/v/sigma/1?sig=y', m);
    expect(calls[0][0]).toBe('provideLink');
  });

  it('reports a function that throws', async () => {
    const { m, calls } = nativeMock();
    await answerLinkRequest('r3', async () => { throw new Error('offline'); }, m);
    expect(calls).toEqual([['failLink', 'r3', 'offline']]);
  });

  it('refuses something that is not a link, such as the API key', async () => {
    const { m, calls } = nativeMock();
    await answerLinkRequest('r4', async () => 'sgm_live_abc', m);
    expect(calls[0][0]).toBe('failLink');
    expect(String(calls[0][2])).toMatch(/signed link/);
  });

  it('reports a missing function', async () => {
    const { m, calls } = nativeMock();
    await answerLinkRequest('r5', undefined, m);
    expect(calls[0][0]).toBe('failLink');
  });
});

describe('events', () => {
  it('reads a ready sheet', () => {
    const p = readPhase({ phase: 'ready', document: { id: 42, title: 'Budget', filename: 'budget.xlsx', format: 'xlsx', mode: 'edit', test: true } });
    expect(p).toEqual({ phase: 'ready', document: { id: 42, title: 'Budget', filename: 'budget.xlsx', format: 'xlsx', mode: 'edit', test: true } });
  });

  it('reads a failure with its code', () => {
    const p = readPhase({ phase: 'failed', error: { code: 'quota_exceeded', message: 'Allowance used' } });
    expect(p.phase).toBe('failed');
    if (p.phase === 'failed') {
      expect(p.error).toBeInstanceOf(SigmaError);
      expect(p.error.code).toBe('quota_exceeded');
    }
  });

  it('treats anything else as loading', () => {
    expect(readPhase({ phase: 'loading' })).toEqual({ phase: 'loading' });
    expect(readPhase({})).toEqual({ phase: 'loading' });
  });

  it('reads save states', () => {
    expect(readSaveState({ state: 'saving' })).toEqual({ state: 'saving' });
    const failed = readSaveState({ state: 'failed', error: { code: 'network', message: 'down' } });
    expect(failed.state).toBe('failed');
    expect(failed.error?.code).toBe('network');
  });
});

describe('errors', () => {
  it('keeps known codes and the status', () => {
    const e = toSigmaError({ code: 'server', message: 'Bad gateway', userInfo: { status: 502 } });
    expect(e.code).toBe('server');
    expect(e.status).toBe(502);
  });

  it('maps unknown codes to server', () => {
    expect(toSigmaError({ code: 'EUNKNOWN', message: 'x' }).code).toBe('server');
    expect(toSigmaError(undefined).message).toBeTruthy();
  });

  it('rejects with SigmaError when the native module is missing', async () => {
    await expect(callNative(undefined)).rejects.toMatchObject({ code: 'native_module_unavailable' });
  });

  it('wraps native rejections', async () => {
    await expect(callNative(() => Promise.reject({ code: 'not_ready', message: 'Still opening' }))).rejects.toMatchObject({ code: 'not_ready' });
  });

  it('makes distinct sheet ids', () => {
    expect(nextSheetId()).not.toBe(nextSheetId());
  });
});
