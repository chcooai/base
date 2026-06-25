import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, setApiToken, getApiToken, onRequest, makeOnResponseError } from './client';

describe('api client', () => {
  beforeEach(() => { setApiToken(null); });

  it('should_use_api_baseurl_with_credentials', () => {
    expect(api.defaults.baseURL).toBe('/api');
    expect(api.defaults.withCredentials).toBe(true);
  });

  it('should_attach_bearer_header_when_token_present', () => {
    setApiToken('tok');
    const cfg = onRequest({ headers: {}, url: '/auth/me' } as any);
    expect(cfg.headers.Authorization).toBe('Bearer tok');
    expect(getApiToken()).toBe('tok');
  });

  it('should_not_attach_header_when_no_token', () => {
    const cfg = onRequest({ headers: {}, url: '/auth/me' } as any);
    expect(cfg.headers.Authorization).toBeUndefined();
  });

  it('should_refresh_and_retry_once_when_response_401', async () => {
    const refresh = vi.fn().mockResolvedValue('newtok');
    const retry = vi.fn().mockResolvedValue('ok');
    const redirect = vi.fn();
    const handler = makeOnResponseError({ refresh, redirect, retry });
    const err = { response: { status: 401 }, config: { url: '/auth/me', headers: {} } } as any;
    const res = await handler(err);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry.mock.calls[0][0].headers.Authorization).toBe('Bearer newtok');
    expect(retry.mock.calls[0][0]._retried).toBe(true);
    expect(res).toBe('ok');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('should_redirect_login_when_refresh_also_fails', async () => {
    const refresh = vi.fn().mockResolvedValue(null);
    const retry = vi.fn();
    const redirect = vi.fn();
    const handler = makeOnResponseError({ refresh, redirect, retry });
    const err = { response: { status: 401 }, config: { url: '/auth/me', headers: {} } } as any;
    await expect(handler(err)).rejects.toBe(err);
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });

  it('should_not_loop_when_refresh_endpoint_itself_401', async () => {
    const refresh = vi.fn();
    const retry = vi.fn();
    const redirect = vi.fn();
    const handler = makeOnResponseError({ refresh, redirect, retry });
    const err = { response: { status: 401 }, config: { url: '/auth/refresh', headers: {} } } as any;
    await expect(handler(err)).rejects.toBe(err);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('should_exempt_login_and_register_from_retry_when_response_401', async () => {
    for (const url of ['/auth/login', '/auth/register']) {
      const refresh = vi.fn();
      const retry = vi.fn();
      const redirect = vi.fn();
      const handler = makeOnResponseError({ refresh, redirect, retry });
      const err = { response: { status: 401 }, config: { url, headers: {} } } as any;
      await expect(handler(err)).rejects.toBe(err);
      expect(refresh).not.toHaveBeenCalled();
    }
  });

  it('should_still_refresh_when_url_merely_contains_auth_refresh_substring', async () => {
    const refresh = vi.fn().mockResolvedValue('newtok');
    const retry = vi.fn().mockResolvedValue('ok');
    const redirect = vi.fn();
    const handler = makeOnResponseError({ refresh, redirect, retry });
    const err = { response: { status: 401 }, config: { url: '/auth/refresh-token', headers: {} } } as any;
    const res = await handler(err);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry.mock.calls[0][0].headers.Authorization).toBe('Bearer newtok');
    expect(res).toBe('ok');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('should_not_retry_twice_when_already_retried', async () => {
    const refresh = vi.fn();
    const retry = vi.fn();
    const redirect = vi.fn();
    const handler = makeOnResponseError({ refresh, redirect, retry });
    const err = { response: { status: 401 }, config: { url: '/auth/me', headers: {}, _retried: true } } as any;
    await expect(handler(err)).rejects.toBe(err);
    expect(refresh).not.toHaveBeenCalled();
  });
});
