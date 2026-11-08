import { z } from 'zod';
import type { NotifierPlugin } from './notifier.js';
import type { SourcePlugin } from './source.js';
import { SDK_API_VERSION } from './version.js';

const fn = z.custom<(...args: never[]) => unknown>((value) => typeof value === 'function', {
  message: 'must be a function',
});
const zodSchema = z.custom<z.ZodType>((value) => value instanceof z.ZodType, {
  message: 'must be a Zod schema',
});

const base = {
  apiVersion: z.literal(SDK_API_VERSION, {
    error: (issue) =>
      `built for plugin API v${String(issue.input)}, this app supports v${SDK_API_VERSION}`,
  }),
  id: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be kebab-case (lowercase letters, digits, dashes)'),
  name: z.string().trim().min(1, 'must not be empty'),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/, 'must be a semver version like 1.0.0'),
};

const sourceSchema = z
  .object({
    ...base,
    kind: z.literal('source'),
    supports: z.array(z.enum(['product', 'listing'])).min(1, 'must list at least one watch type'),
    match: fn,
    configSchema: zodSchema.optional(),
    fetchMode: z.enum(['http', 'browser', 'auto']).optional(),
    checkProduct: fn.optional(),
    checkListing: fn.optional(),
  })
  .superRefine((plugin, ctx) => {
    if (plugin.supports.includes('product') && !plugin.checkProduct) {
      ctx.addIssue({
        code: 'custom',
        path: ['checkProduct'],
        message: 'required when supports includes "product"',
      });
    }
    if (plugin.supports.includes('listing') && !plugin.checkListing) {
      ctx.addIssue({
        code: 'custom',
        path: ['checkListing'],
        message: 'required when supports includes "listing"',
      });
    }
  });

const notifierSchema = z.object({
  ...base,
  kind: z.literal('notifier'),
  configSchema: zodSchema,
  send: fn,
  test: fn.optional(),
  validate: fn.optional(),
  discover: fn.optional(),
  setupGuide: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
        links: z
          .array(z.object({ label: z.string(), url: z.string(), qrCode: z.boolean().optional() }))
          .optional(),
        copyText: z.string().optional(),
        fields: z.array(z.string()).optional(),
        action: z.enum(['validate', 'discover', 'test']).optional(),
      }),
    )
    .optional(),
  translations: z.record(z.string(), z.record(z.string(), z.string())).optional(),
});

const pluginSchema = z.discriminatedUnion('kind', [sourceSchema, notifierSchema], {
  error: 'kind must be "source" or "notifier" (use defineSourcePlugin or defineNotifierPlugin)',
});

export type AnyPlugin = SourcePlugin<unknown> | NotifierPlugin<unknown>;

export type PluginValidation = { ok: true; plugin: AnyPlugin } | { ok: false; errors: string[] };

/**
 * Checks that an unknown value (e.g. the default export of a plugin package) is a valid plugin.
 * Never throws: an invalid plugin is reported and skipped, it must not crash the app.
 */
export function validatePlugin(value: unknown): PluginValidation {
  const result = pluginSchema.safeParse(value);
  if (result.success) {
    return { ok: true, plugin: value as AnyPlugin };
  }
  const errors = result.error.issues.map((issue) =>
    issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
  );
  return { ok: false, errors };
}
