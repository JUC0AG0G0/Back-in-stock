import { Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PriceTag, ProductImage, StockBadge } from './product-parts';
import { previewedProduct, useProductPreview } from './use-product-preview';

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
  const { t } = useTranslation();
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
        <PriceTag price={product.price} regularPrice={product.regularPrice} size="lg" />
        <StockBadge status={product.status} />
      </div>
    </section>
  );
}
