import type { SettingsRepository } from './ports.js';
import type { UpdateChannel } from './update-checker.js';

/** Settings that can change at runtime from the Settings screen, without a restart. */
export interface RuntimeSettingsValues {
  /** Looks for new versions on GitHub. */
  updateCheck: boolean;
  /** Hours between two checks. */
  updateIntervalHours: number;
  updateChannel: UpdateChannel;
  /** Swagger UI at /api/docs. */
  apiDocs: boolean;
}

export type RuntimeSettingKey = keyof RuntimeSettingsValues;

/** A change from the UI. `null` forgets the saved value: the default applies again. */
export type RuntimeSettingsPatch = {
  [K in RuntimeSettingKey]?: RuntimeSettingsValues[K] | null;
};

export interface SettingView<T> {
  /** Value in use. */
  value: T;
  /** Value from the environment variable, or the built-in default. */
  default: T;
  /** True when a value saved from the UI replaces the default. */
  overridden: boolean;
}

export type RuntimeSettingsView = {
  [K in RuntimeSettingKey]: SettingView<RuntimeSettingsValues[K]>;
};

export const UPDATE_INTERVAL_LIMITS = { min: 1, max: 168 } as const;

/** Row keys in the `settings` table. */
const STORAGE_KEYS: Record<RuntimeSettingKey, string> = {
  updateCheck: 'updates.check',
  updateIntervalHours: 'updates.interval_hours',
  updateChannel: 'updates.channel',
  apiDocs: 'api_docs.enabled',
};

const isValid: { [K in RuntimeSettingKey]: (value: unknown) => boolean } = {
  updateCheck: (v) => typeof v === 'boolean',
  updateIntervalHours: (v) =>
    Number.isInteger(v) &&
    (v as number) >= UPDATE_INTERVAL_LIMITS.min &&
    (v as number) <= UPDATE_INTERVAL_LIMITS.max,
  updateChannel: (v) => v === 'stable' || v === 'prerelease',
  apiDocs: (v) => typeof v === 'boolean',
};

const KEYS = Object.keys(STORAGE_KEYS) as RuntimeSettingKey[];

export class InvalidSettingError extends Error {
  constructor(readonly key: string) {
    super(`Invalid value for ${key}`);
  }
}

type Listener = (values: RuntimeSettingsValues, changed: RuntimeSettingKey[]) => void;

/**
 * Environment variables give the defaults, a value saved from the UI replaces them.
 * The UI can also go back to the default ("reset"), which deletes the saved value.
 * This way a docker-compose.yml keeps working as before, and the UI always has the last word.
 */
export class RuntimeSettings {
  private overrides: Partial<RuntimeSettingsValues> = {};
  private readonly listeners: Listener[] = [];

  constructor(
    private readonly repository: Pick<SettingsRepository, 'getValue' | 'setValue'>,
    private readonly defaults: RuntimeSettingsValues,
  ) {}

  /** Reads the saved values. A value that is no longer valid is ignored. */
  async load(): Promise<void> {
    const overrides: Record<string, unknown> = {};
    for (const key of KEYS) {
      const value = await this.repository.getValue(STORAGE_KEYS[key]);
      if (value !== undefined && isValid[key](value)) overrides[key] = value;
    }
    this.overrides = overrides as Partial<RuntimeSettingsValues>;
  }

  get<K extends RuntimeSettingKey>(key: K): RuntimeSettingsValues[K] {
    return (this.overrides[key] ?? this.defaults[key]) as RuntimeSettingsValues[K];
  }

  values(): RuntimeSettingsValues {
    return {
      updateCheck: this.get('updateCheck'),
      updateIntervalHours: this.get('updateIntervalHours'),
      updateChannel: this.get('updateChannel'),
      apiDocs: this.get('apiDocs'),
    };
  }

  view(): RuntimeSettingsView {
    return Object.fromEntries(
      KEYS.map((key) => [
        key,
        { value: this.get(key), default: this.defaults[key], overridden: key in this.overrides },
      ]),
    ) as RuntimeSettingsView;
  }

  /** Validates the whole patch first: nothing is saved if one value is wrong. */
  async update(patch: RuntimeSettingsPatch): Promise<RuntimeSettingKey[]> {
    const entries = KEYS.filter((key) => patch[key] !== undefined).map(
      (key) => [key, patch[key]] as const,
    );
    for (const [key, value] of entries) {
      if (value !== null && !isValid[key](value)) throw new InvalidSettingError(key);
    }
    const before = this.values();
    for (const [key, value] of entries) {
      await this.repository.setValue(STORAGE_KEYS[key], value);
      if (value === null) delete this.overrides[key];
      else (this.overrides as Record<string, unknown>)[key] = value;
    }
    const after = this.values();
    const changed = KEYS.filter((key) => before[key] !== after[key]);
    if (changed.length > 0) for (const listener of this.listeners) listener(after, changed);
    return changed;
  }

  onChange(listener: Listener): void {
    this.listeners.push(listener);
  }
}
