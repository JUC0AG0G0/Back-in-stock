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

  it('reads the update settings', () => {
    expect(loadConfig({}).updates).toEqual({
      check: true,
      channel: 'stable',
      buildChannel: 'dev',
      updaterUrl: null,
      repository: 'JUC0AG0G0/Back-in-stock',
    });
    expect(
      loadConfig({
        BIS_UPDATE_CHECK: 'false',
        BIS_UPDATE_CHANNEL: 'prerelease',
        BIS_BUILD_CHANNEL: 'release',
        BIS_UPDATER_URL: 'http://updater:8090',
      }).updates,
    ).toMatchObject({
      check: false,
      channel: 'prerelease',
      buildChannel: 'release',
      updaterUrl: 'http://updater:8090',
    });
    expect(() => loadConfig({ BIS_UPDATE_CHANNEL: 'beta' })).toThrow('BIS_UPDATE_CHANNEL');
  });
});
