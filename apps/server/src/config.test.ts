import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('enables the API docs outside production only', () => {
    expect(loadConfig({}).apiDocs).toBe(true);
    expect(loadConfig({ NODE_ENV: 'development' }).apiDocs).toBe(true);
    expect(loadConfig({ NODE_ENV: 'production' }).apiDocs).toBe(false);
  });

  it('lets BIS_API_DOCS override the default', () => {
    expect(loadConfig({ NODE_ENV: 'production', BIS_API_DOCS: 'true' }).apiDocs).toBe(true);
    expect(loadConfig({ BIS_API_DOCS: 'off' }).apiDocs).toBe(false);
    expect(loadConfig({ NODE_ENV: 'production', BIS_API_DOCS: 'what' }).apiDocs).toBe(false);
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow('Invalid PORT');
  });

  it('reads the update settings', () => {
    expect(loadConfig({}).updates).toEqual({
      check: true,
      channel: 'stable',
      intervalHours: 6,
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
    expect(loadConfig({ BIS_UPDATE_INTERVAL: '24' }).updates.intervalHours).toBe(24);
    expect(() => loadConfig({ BIS_UPDATE_INTERVAL: '0' })).toThrow('BIS_UPDATE_INTERVAL');
    expect(() => loadConfig({ BIS_UPDATE_INTERVAL: '1.5' })).toThrow('BIS_UPDATE_INTERVAL');
  });
});
