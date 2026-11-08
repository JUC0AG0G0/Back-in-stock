import { formatPrice, toLocale } from '@back-in-stock/i18n';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleMinus, CircleX, FlaskConical, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NotifierTestMessage } from '@/components/notifier-test-message';
import { Button } from '@/components/ui/button';
import type { NotifierTestOptions } from '@/lib/notifier-test-presets';
import {
  fetchPlugins,
  testAllPlugins,
  testPlugin,
  type PluginKind,
  type PluginTestResult,
  type WatchType,
} from '@/lib/plugin-tests-api';

type ResultsByPlugin = Record<string, PluginTestResult[]>;

// Non-text values kept out of JSX, where the i18n lint rule would take them for UI text.
const SOURCE: PluginKind = 'source';
const NOTIFIER: PluginKind = 'notifier';
const URL_PLACEHOLDER = 'https://';
const rowButton = { variant: 'outline', size: 'sm' } as const;

const keyOf = (kind: PluginKind, id: string) => `${kind}:${id}`;

function groupResults(results: PluginTestResult[]): ResultsByPlugin {
  const grouped: ResultsByPlugin = {};
  for (const result of results) {
    (grouped[keyOf(result.kind, result.pluginId)] ??= []).push(result);
  }
  return grouped;
}

/**
 * Plugins screen, test part: "Test all plugins", plus a "Test" button per plugin.
 * Sources read a page (an example page, or a URL typed here) and nothing is saved.
 * Notifiers send a test notification to each of their channels.
 */
export function PluginTests() {
  const { t } = useTranslation();
  const plugins = useQuery({ queryKey: ['plugins'], queryFn: fetchPlugins, retry: false });
  const [results, setResults] = useState<ResultsByPlugin>({});

  const testAll = useMutation({
    mutationFn: testAllPlugins,
    onSuccess: (all) => setResults(groupResults(all)),
  });

  const allResults = Object.values(results).flat();
  const count = (status: PluginTestResult['status']) =>
    allResults.filter((r) => r.status === status).length;
  const isEmpty =
    plugins.isSuccess && plugins.data.sources.length === 0 && plugins.data.notifiers.length === 0;

  return (
    <section className="w-full space-y-6 rounded-xl border bg-card p-6 text-left text-card-foreground">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <FlaskConical className="size-5" aria-hidden />
            {t('pluginTests.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('pluginTests.intro')}</p>
        </div>
        <Button
          onClick={() => testAll.mutate()}
          disabled={testAll.isPending || !plugins.isSuccess || isEmpty}
        >
          {testAll.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          {testAll.isPending ? t('pluginTests.testing') : t('pluginTests.testAll')}
        </Button>
      </header>

      {testAll.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('pluginTests.runError', { message: testAll.error.message })}
        </p>
      )}
      {allResults.length > 0 && (
        <p className="text-sm font-medium" aria-live="polite">
          {t('pluginTests.summary', {
            passed: count('passed'),
            failed: count('failed'),
            skipped: count('skipped'),
          })}
        </p>
      )}

      {plugins.isError && <p className="text-sm text-destructive">{t('pluginTests.loadError')}</p>}
      {isEmpty && <p className="text-sm text-muted-foreground">{t('pluginTests.none')}</p>}

      {plugins.isSuccess && plugins.data.sources.length > 0 && (
        <PluginGroup title={t('pluginTests.sources')}>
          {plugins.data.sources.map((plugin) => (
            <PluginRow
              key={plugin.id}
              kind={SOURCE}
              plugin={plugin}
              supports={plugin.supports}
              results={results[keyOf(SOURCE, plugin.id)]}
              onResults={(r) => setResults((prev) => ({ ...prev, [keyOf(SOURCE, plugin.id)]: r }))}
            />
          ))}
        </PluginGroup>
      )}

      {plugins.isSuccess && plugins.data.notifiers.length > 0 && (
        <PluginGroup title={t('pluginTests.notifiers')}>
          {plugins.data.notifiers.map((plugin) => (
            <PluginRow
              key={plugin.id}
              kind={NOTIFIER}
              plugin={plugin}
              results={results[keyOf(NOTIFIER, plugin.id)]}
              onResults={(r) =>
                setResults((prev) => ({ ...prev, [keyOf(NOTIFIER, plugin.id)]: r }))
              }
            />
          ))}
        </PluginGroup>
      )}
    </section>
  );
}

function PluginGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <ul className="divide-y rounded-lg border">{children}</ul>
    </div>
  );
}

interface PluginRowProps {
  kind: PluginKind;
  plugin: { id: string; name: string; version: string };
  supports?: WatchType[];
  results: PluginTestResult[] | undefined;
  onResults(results: PluginTestResult[]): void;
}

function PluginRow({ kind, plugin, supports = [], results, onResults }: PluginRowProps) {
  const { t, i18n } = useTranslation();
  const [url, setUrl] = useState('');
  const [type, setType] = useState<WatchType | undefined>(supports[0]);
  const [notifierOptions, setNotifierOptions] = useState<NotifierTestOptions>({
    preset: 'default',
    channelId: '',
    message: { title: '', text: '', url: '', imageUrl: '' },
  });

  const test = useMutation({
    mutationFn: () =>
      kind === 'source'
        ? testPlugin(kind, plugin.id, {
            ...(type === undefined ? {} : { type }),
            ...(url.trim() === '' ? {} : { url: url.trim() }),
          })
        : testPlugin(kind, plugin.id, {
            ...(i18n.resolvedLanguage ? { locale: i18n.resolvedLanguage } : {}),
            ...(notifierOptions.channelId ? { channelId: notifierOptions.channelId } : {}),
            ...(notifierOptions.preset === 'default' ? {} : { message: notifierOptions.message }),
          }),
    onSuccess: onResults,
  });

  return (
    <li className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="font-medium">{plugin.name}</span>{' '}
          <span className="text-xs text-muted-foreground">
            {t('pluginTests.pluginMeta', { id: plugin.id, version: plugin.version })}
          </span>
        </div>
        <Button {...rowButton} onClick={() => test.mutate()} disabled={test.isPending}>
          {test.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          {test.isPending ? t('pluginTests.testing') : t('pluginTests.test')}
        </Button>
      </div>

      {kind === 'source' && (
        <div className="flex flex-wrap gap-2">
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs text-muted-foreground">
            {t('pluginTests.urlLabel')}
            <input
              type="url"
              inputMode="url"
              placeholder={URL_PLACEHOLDER}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
            />
          </label>
          {supports.length > 1 && (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t('pluginTests.typeLabel')}
              <select
                value={type}
                onChange={(e) => setType(e.target.value as WatchType)}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
              >
                {supports.map((s) => (
                  <option key={s} value={s}>
                    {t(`pluginTests.type.${s}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {kind === 'notifier' && (
        <NotifierTestMessage
          notifierId={plugin.id}
          value={notifierOptions}
          onChange={setNotifierOptions}
        />
      )}

      {test.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('pluginTests.runError', { message: test.error.message })}
        </p>
      )}
      {results?.map((result, index) => (
        <ResultCard key={index} result={result} />
      ))}
    </li>
  );
}

const statusIcon = {
  passed: <CircleCheck className="size-4 text-green-600 dark:text-green-500" aria-hidden />,
  failed: <CircleX className="size-4 text-destructive" aria-hidden />,
  skipped: <CircleMinus className="size-4 text-muted-foreground" aria-hidden />,
};

function ResultCard({ result }: { result: PluginTestResult }) {
  const { t, i18n } = useTranslation();
  const locale = toLocale(i18n.resolvedLanguage);
  const output = result.output;

  return (
    <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {statusIcon[result.status]}
        <span className="font-medium">{t(`pluginTests.status.${result.status}`)}</span>
        {result.target && (
          <span className="truncate text-muted-foreground">
            {result.target.url ? (
              <a href={result.target.url} target="_blank" rel="noreferrer" className="underline">
                {result.target.label}
              </a>
            ) : (
              result.target.label
            )}
          </span>
        )}
        {result.status !== 'skipped' && (
          <span className="ml-auto text-xs text-muted-foreground">
            {t('pluginTests.duration', { ms: Math.round(result.durationMs) })}
          </span>
        )}
      </div>

      {result.skipReason && (
        <p className="text-muted-foreground">{t(`pluginTests.skip.${result.skipReason}`)}</p>
      )}
      {result.error && (
        <p className="font-mono text-xs break-words text-destructive">
          {result.error.kind ? `[${result.error.kind}] ` : ''}
          {result.error.message}
        </p>
      )}
      {result.kind === 'notifier' && result.status === 'passed' && (
        <p>{t('pluginTests.result.notifier')}</p>
      )}

      {output?.type === 'product' && (
        <div className="space-y-0.5">
          <p>
            {t('pluginTests.result.product', {
              status:
                output.product.status === 'UNKNOWN'
                  ? t('pluginTests.result.unknown')
                  : t(`status.${output.product.status}`),
            })}
          </p>
          {output.product.title && <p className="font-medium">{output.product.title}</p>}
          {output.product.price && (
            <p>
              {formatPrice(output.product.price.amountCents, output.product.price.currency, locale)}
            </p>
          )}
          {output.product.signal && (
            <p className="text-xs text-muted-foreground">
              {t('pluginTests.result.signal', { signal: output.product.signal })}
            </p>
          )}
        </div>
      )}

      {output?.type === 'listing' && (
        <div className="space-y-1">
          <p>
            {t('pluginTests.result.listing', { count: output.itemCount })}
            {!output.complete && (
              <span className="text-muted-foreground"> · {t('pluginTests.result.incomplete')}</span>
            )}
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {output.items.map((item) => (
              <li key={item.id}>
                <a href={item.url} target="_blank" rel="noreferrer" className="underline">
                  {item.title}
                </a>
                {item.price && (
                  <span className="text-muted-foreground">
                    {' '}
                    · {formatPrice(item.price.amountCents, item.price.currency, locale)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
