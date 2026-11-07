import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('enables the API docs outside production only', () => {
    expect(loadConfig({}).apiDocs).toBe(true);
    expect(loadConfig({ NODE_ENV: 'development' }).apiDocs).toBe(true);
    expect(loadConfig({ NODE_ENV: 'production' }).apiDocs).toBe(false);
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow('Invalid PORT');
  });
});
