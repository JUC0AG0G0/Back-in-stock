import { formatPrice, toLocale } from '@back-in-stock/i18n';
import { ImageOff } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { Price, StockStatus } from '@/lib/plugin-tests-api';
import { cn } from '@/lib/utils';

// Pieces shared by the dialog preview and the watch cards.

const PERCENT: Intl.NumberFormatOptions = { style: 'percent' };

const statusStyle: Record<StockStatus, string> = {
  IN_STOCK: 'bg-green-600/10 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  OUT_OF_STOCK: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
  PREORDER: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  UNKNOWN: 'bg-muted text-muted-foreground',
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function StockBadge({ status }: { status: StockStatus }) {
  const { t } = useTranslation();
  const label = status === 'UNKNOWN' ? t('watches.preview.unknown') : t(`status.${status}`);
  return <Badge className={statusStyle[status]}>{capitalize(label)}</Badge>;
}

interface PriceTagProps {
  price: Price | undefined;
  regularPrice?: Price | undefined;
  size?: 'default' | 'lg';
}

/** Current price, with the regular price struck through and the discount when on sale. */
export function PriceTag({ price, regularPrice, size = 'default' }: PriceTagProps) {
  const { t, i18n } = useTranslation();
  const locale = toLocale(i18n.resolvedLanguage);
  if (!price) return null;
  const onSale =
    regularPrice !== undefined &&
    regularPrice.currency === price.currency &&
    regularPrice.amountCents > price.amountCents;

  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span
        className={cn('font-semibold', size === 'lg' && 'text-lg', onSale && 'text-destructive')}
      >
        {formatPrice(price.amountCents, price.currency, locale)}
      </span>
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
    </span>
  );
}

interface ProductImageProps {
  src: string | undefined;
  alt: string;
  className?: string;
  /** Shown instead of the photo when there is none (default: a "no image" icon). */
  fallback?: ReactNode;
}

export function ProductImage({ src, alt, className, fallback }: ProductImageProps) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div
        className={cn(
          'flex size-20 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-6',
          className,
        )}
      >
        {fallback ?? <ImageOff aria-hidden />}
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
      className={cn('size-20 shrink-0 rounded-md bg-white object-contain', className)}
    />
  );
}
