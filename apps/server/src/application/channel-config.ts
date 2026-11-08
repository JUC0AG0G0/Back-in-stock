import { z, type NotifierPlugin } from '@back-in-stock/plugin-sdk';

/** JSON Schema of a notifier's settings, as typed by the user (defaults make fields optional). */
export function configJsonSchema(plugin: NotifierPlugin): Record<string, unknown> {
  return z.toJSONSchema(plugin.configSchema, { io: 'input', unrepresentable: 'any' }) as Record<
    string,
    unknown
  >;
}

/** Fields marked `.meta({ writeOnly: true })` (tokens, passwords): never sent back by the API. */
export function secretFields(plugin: NotifierPlugin): string[] {
  const properties = configJsonSchema(plugin).properties;
  if (typeof properties !== 'object' || properties === null) return [];
  return Object.entries(properties as Record<string, { writeOnly?: boolean }>)
    .filter(([, field]) => field.writeOnly === true)
    .map(([name]) => name);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Config safe to show: secrets removed, with the list of secrets that are set. */
export function maskConfig(
  config: unknown,
  secrets: readonly string[],
): { config: Record<string, unknown>; secretsSet: string[] } {
  const visible = { ...asRecord(config) };
  const secretsSet: string[] = [];
  for (const name of secrets) {
    if (visible[name] !== undefined && visible[name] !== '') secretsSet.push(name);
    delete visible[name];
  }
  return { config: visible, secretsSet };
}

/**
 * Applies the user's edits on top of the stored config. A secret left empty keeps its
 * stored value, since the UI never received it.
 */
export function mergeConfig(
  stored: unknown,
  incoming: unknown,
  secrets: readonly string[],
): Record<string, unknown> {
  const merged = { ...asRecord(stored), ...asRecord(incoming) };
  const previous = asRecord(stored);
  for (const name of secrets) {
    const value = asRecord(incoming)[name];
    if (value === undefined || value === '') {
      if (previous[name] === undefined) delete merged[name];
      else merged[name] = previous[name];
    }
  }
  return merged;
}

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) =>
    issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
  );
}
