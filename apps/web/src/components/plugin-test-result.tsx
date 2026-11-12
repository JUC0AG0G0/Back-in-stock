import { formatPrice, toLocale } from '@back-in-stock/i18n';
import { CircleCheck, CircleMinus, CircleX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PluginTestResult } from '@/lib/plugin-tests-api';

const statusIcon = {
  passed: <CircleCheck className="size-4 text-green-600 dark:text-green-500" aria-hidden />,
  failed: <CircleX className="size-4 text-destructive" aria-hidden />,
  skipped: <CircleMinus className="size-4 text-muted-foreground" aria-hidden />,
};

/** Outcome of one plugin test: status, target, duration, and what the source read. */
export function PluginTestResultCard({ result }: { result: PluginTestResult }) {
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
