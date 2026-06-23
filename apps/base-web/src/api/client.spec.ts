import { describe, it, expect } from 'vitest';
import { api } from './client';

describe('api client', () => {
  it('should_use_api_baseurl_with_credentials', () => {
    expect(api.defaults.baseURL).toBe('/api');
    expect(api.defaults.withCredentials).toBe(true);
  });
});
