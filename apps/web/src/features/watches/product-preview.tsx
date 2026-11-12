import { formatPrice, toLocale } from '@back-in-stock/i18n';
import { ImageOff, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { StockStatus } from '@/lib/plugin-tests-api';
import { cn } from '@/lib/utils';
import { previewedProduct, useProductPreview } from './use-product-preview';

const PERCENT: Intl.NumberFormatOptions = { style: 'percent' };

const statusStyle: Record<StockStatus, string> = {
  IN_STOCK: 'bg-green-600/10 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  OUT_OF_STOCK: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
  PREORDER: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  UNKNOWN: 'bg-muted text-muted-foreground',
};

interface ProductPreviewProps {
  url: string;
  sourceId: string;
}

/**
 * What the plugin reads on the page right now: photo, name, price (discount included) and
 * stock. Lets the user check it is the right product before setting up the watch.
 * A failure is shown but does not block: the page may be read fine at the next check.
 */
export function ProductPreview({ url, sourceId }: ProductPreviewProps) {
  const { t, i18n } = useTranslation();
  const locale = toLocale(i18n.resolvedLanguage);
  const preview = useProductPreview(url, sourceId);

  if (preview.isPending) {
    return (
      <div className="flex items-center gap-3 rounded-lg border p-3 text-muted-foreground">
        <div className="size-20 shrink-0 animate-pulse rounded-md bg-muted" />
        <span className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('watches.preview.loading')}
        </span>
      </div>
    );
  }

  const result = preview.data;
  const product = previewedProduct(result);
  if (!product) {
    const error = preview.error?.message ?? result?.error?.message ?? '';
    return (
      <div
        role="status"
        className="flex flex-col gap-2 rounded-lg border border-dashed p-3 text-sm sm:flex-row sm:items-center"
      >
        <p className="flex-1 text-muted-foreground">
          {t('watches.preview.failed')}
          {error && <span className="mt-1 block font-mono text-xs break-words">{error}</span>}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void preview.refetch()}
          disabled={preview.isFetching}
        >
          <RefreshCw className={cn(preview.isFetching && 'animate-spin')} aria-hidden />
          {t('watches.preview.retry')}
        </Button>
      </div>
    );
  }

  const { price, regularPrice } = product;
  const onSale = price && regularPrice && regularPrice.amountCents > price.amountCents;
  const status = capitalize(
    product.status === 'UNKNOWN' ? t('watches.preview.unknown') : t(`status.${product.status}`),
  );

  return (
    <section
      aria-label={t('watches.preview.label')}
      className="flex items-start gap-3 rounded-lg border p-3"
    >
      <ProductImage src={product.imageUrl} alt={product.title ?? ''} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="leading-snug font-medium break-words">
          {product.title ?? t('watches.preview.noTitle')}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {price && (
            <span className={cn('text-lg font-semibold', onSale && 'text-destructive')}>
              {formatPrice(price.amountCents, price.currency, locale)}
            </span>
          )}
          {onSale && (
            <>
              <s className="text-sm text-muted-foreground">
                <span className="sr-only">{t('watches.preview.regularPrice')} </span>
                {formatPrice(regularPrice.amountCents, regularPrice.currency, locale)}
              </s>
              <Badge variant="destructive">
                {new Intl.NumberFormat(locale, PERCENT).format(
                  price.amountCents / regularPrice.amountCents - 1,
                )}
              </Badge>
            </>
          )}
        </div>
        <Badge className={statusStyle[product.status]}>{status}</Badge>
      </div>
    </section>
  );
}

function ProductImage({ src, alt }: { src: string | undefined; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className="flex size-20 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <ImageOff className="size-6" aria-hidden />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="size-20 shrink-0 rounded-md bg-white object-contain"
    />
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
