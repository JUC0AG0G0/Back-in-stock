import { describe, expect, it, vi } from 'vitest';
import { RuntimeSettings, type RuntimeSettingsValues } from './runtime-settings.js';

const defaults: RuntimeSettingsValues = {
  updateCheck: true,
  updateIntervalHours: 6,
  updateChannel: 'stable',
  apiDocs: false,
};

function memoryRepository(initial: Record<string, unknown> = {}) {
  const rows = new Map(Object.entries(initial));
  return {
    rows,
    getValue: async (key: string) => rows.get(key),
    setValue: async (key: string, value: unknown) => {
      if (value === null) rows.delete(key);
      else rows.set(key, value);
    },
  };
}

describe('RuntimeSettings', () => {
  it('uses the environment defaults until a value is saved', async () => {
    const settings = new RuntimeSettings(memoryRepository(), defaults);
    await settings.load();
    expect(settings.values()).toEqual(defaults);
    expect(settings.view().updateIntervalHours).toEqual({
      value: 6,
      default: 6,
      overridden: false,
    });
  });

  it('lets a saved value replace the default, and ignores invalid saved values', async () => {
    const settings = new RuntimeSettings(
      memoryRepository({ 'updates.interval_hours': 24, 'api_docs.enabled': 'yes' }),
      defaults,
    );
    await settings.load();
    expect(settings.get('updateIntervalHours')).toBe(24);
    expect(settings.view().updateIntervalHours.overridden).toBe(true);
    expect(settings.get('apiDocs')).toBe(false);
  });

  it('saves changes, notifies listeners with what changed, and goes back to the default on null', async () => {
    const repo = memoryRepository();
    const settings = new RuntimeSettings(repo, defaults);
    const listener = vi.fn();
    settings.onChange(listener);

    expect(await settings.update({ apiDocs: true, updateIntervalHours: 6 })).toEqual(['apiDocs']);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ apiDocs: true }), ['apiDocs']);
    expect(repo.rows.get('api_docs.enabled')).toBe(true);
    // Saving the default value still pins it: a later change of the variable will not apply.
    expect(settings.view().updateIntervalHours.overridden).toBe(true);

    await settings.update({ apiDocs: null });
    expect(settings.get('apiDocs')).toBe(false);
    expect(repo.rows.has('api_docs.enabled')).toBe(false);
  });

  it('rejects the whole patch when one value is invalid', async () => {
    const repo = memoryRepository();
    const settings = new RuntimeSettings(repo, defaults);
    await expect(settings.update({ apiDocs: true, updateIntervalHours: 0 })).rejects.toThrow(
      'updateIntervalHours',
    );
    expect(repo.rows.size).toBe(0);
    expect(settings.get('apiDocs')).toBe(false);
  });
});
