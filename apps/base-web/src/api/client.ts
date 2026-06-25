import axios, { type AxiosError, type AxiosInstance } from 'axios';

export const api: AxiosInstance = axios.create({ baseURL: '/api', withCredentials: true });

let apiToken: string | null = null;
export function setApiToken(token: string | null): void { apiToken = token; }
export function getApiToken(): string | null { return apiToken; }

// 这些端点自身不参与 401→refresh→retry，避免递归
const AUTH_FREE = ['/auth/refresh', '/auth/login', '/auth/register'];

export function onRequest(config: any): any {
  if (apiToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${apiToken}`;
  }
  return config;
}

export function makeOnResponseError(deps: {
  refresh: () => Promise<string | null>;
  redirect: () => void;
  retry: (config: any) => Promise<unknown>;
}) {
  return async function onResponseError(error: AxiosError): Promise<unknown> {
    const config = error.config as any;
    const status = error.response?.status;
    const url: string = config?.url ?? '';
    if (status !== 401 || !config || config._retried || AUTH_FREE.some((p) => url.includes(p))) {
      return Promise.reject(error);
    }
    config._retried = true;
    const token = await deps.refresh();
    if (!token) {
      deps.redirect();
      return Promise.reject(error);
    }
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
    return deps.retry(config);
  };
}

api.interceptors.request.use(onRequest);

export function installAuthInterceptors(deps: {
  refresh: () => Promise<string | null>;
  redirect: () => void;
}): void {
  api.interceptors.response.use(
    (r) => r,
    makeOnResponseError({ ...deps, retry: (config) => api(config) }),
  );
}
