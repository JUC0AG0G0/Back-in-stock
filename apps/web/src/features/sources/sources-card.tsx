import { useMutation, useQuery } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PluginTestResultCard } from '@/components/plugin-test-result';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  fetchPlugins,
  testPlugin,
  type PluginList,
  type PluginTestResult,
  type WatchType,
} from '@/lib/plugin-tests-api';

type SourceInfo = PluginList['sources'][number];
type ResultsBySource = Record<string, PluginTestResult[]>;

// Non-text values kept out of JSX, where the i18n lint rule would take them for UI text.
const URL_PLACEHOLDER = 'https://';
const rowButton = { variant: 'outline', size: 'sm' } as const;

/**
 * Settings card listing the installed source plugins (the sites the app can watch), with a test
 * per site: it reads an example page, or a URL typed here, and nothing is saved.
 */
export function SourcesCard() {
  const { t } = useTranslation();
  const plugins = useQuery({ queryKey: ['plugins'], queryFn: fetchPlugins, retry: false });
  const sources = plugins.data?.sources ?? [];
  const [results, setResults] = useState<ResultsBySource>({});

  const testAll = useMutation({
    mutationFn: async () => {
      const all = await Promise.all(
        sources.map(async (s) => [s.id, await testPlugin('source', s.id)] as const),
      );
      return Object.fromEntries(all);
    },
    onSuccess: setResults,
  });

  const allResults = Object.values(results).flat();
  const count = (status: PluginTestResult['status']) =>
    allResults.filter((r) => r.status === status).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.sources.title')}</CardTitle>
        <CardDescription>{t('settings.sources.description')}</CardDescription>
        {sources.length > 0 && (
          <CardAction>
            <Button {...rowButton} onClick={() => testAll.mutate()} disabled={testAll.isPending}>
              {testAll.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
              {testAll.isPending ? t('pluginTests.testing') : t('settings.sources.testAll')}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
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
        {plugins.isError && (
          <p className="text-sm text-destructive">{t('settings.sources.loadError')}</p>
        )}
        {plugins.isSuccess && sources.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('settings.sources.none')}</p>
        )}
        {sources.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {sources.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                results={results[source.id]}
                onResults={(r) => setResults((prev) => ({ ...prev, [source.id]: r }))}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface SourceRowProps {
  source: SourceInfo;
  results: PluginTestResult[] | undefined;
  onResults(results: PluginTestResult[]): void;
}

function SourceRow({ source, results, onResults }: SourceRowProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [type, setType] = useState<WatchType | undefined>(source.supports[0]);
  const fieldClass =
    'rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground';

  const test = useMutation({
    mutationFn: () =>
      testPlugin('source', source.id, {
        ...(type === undefined ? {} : { type }),
        ...(url.trim() === '' ? {} : { url: url.trim() }),
      }),
    onSuccess: onResults,
  });

  return (
    <li className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="font-medium">{source.name}</span>{' '}
          <span className="text-xs text-muted-foreground">
            {t('pluginTests.pluginMeta', { id: source.id, version: source.version })}
          </span>
        </div>
        <Button {...rowButton} onClick={() => test.mutate()} disabled={test.isPending}>
          {test.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          {test.isPending ? t('pluginTests.testing') : t('pluginTests.test')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs text-muted-foreground">
          {t('pluginTests.urlLabel')}
          <input
            type="url"
            inputMode="url"
            placeholder={URL_PLACEHOLDER}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={fieldClass}
          />
        </label>
        {source.supports.length > 1 && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('pluginTests.typeLabel')}
            <select
              value={type}
              onChange={(e) => setType(e.target.value as WatchType)}
              className={fieldClass}
            >
              {source.supports.map((s) => (
                <option key={s} value={s}>
                  {t(`pluginTests.type.${s}`)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {test.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('pluginTests.runError', { message: test.error.message })}
        </p>
      )}
      {results?.map((result, index) => (
        <PluginTestResultCard key={index} result={result} />
      ))}
    </li>
  );
}
