/** Types and calls of the settings API (apps/server/src/http/settings-routes.ts). */
import type { UpdateStatus } from '@/features/update/api';

export type UpdateChannel = 'stable' | 'prerelease';

export interface SettingsValues {
  updateCheck: boolean;
  updateIntervalHours: number;
  updateChannel: UpdateChannel;
  apiDocs: boolean;
}

export interface SettingView<T> {
  value: T;
  /** From the environment variable, or the built-in default. */
  default: T;
  /** A value saved here replaces the default. */
  overridden: boolean;
}

export interface Settings {
  values: { [K in keyof SettingsValues]: SettingView<SettingsValues[K]> };
  updateIntervalHours: { min: number; max: number };
  /** False on edge and dev builds, which never look for updates. */
  updateCheckSupported: boolean;
  apiDocs: { available: boolean; path: string };
}

/** null goes back to the default. */
export type SettingsPatch = { [K in keyof SettingsValues]?: SettingsValues[K] | null };

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const fetchSettings = async (): Promise<Settings> =>
  json<Settings>(await fetch('/api/settings'));

export const saveSettings = async (patch: SettingsPatch): Promise<Settings> =>
  json<Settings>(
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  );

export const checkForUpdate = async (): Promise<UpdateStatus> =>
  json<UpdateStatus>(await fetch('/api/update/check', { method: 'POST' }));
