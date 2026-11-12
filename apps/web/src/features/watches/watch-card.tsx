import { toLocale } from '@back-in-stock/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BellOff,
  BellRing,
  Clock,
  ExternalLink,
  LayoutList,
  Package,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Timer,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ChannelView } from '@/lib/api';
import { cn } from '@/lib/utils';
import { deleteWatch, refreshWatch, updateWatch, type WatchView } from './api';
import { EditWatchDialog } from './edit-watch-dialog';
import { PriceTag, ProductImage, StockBadge } from './product-parts';
import { formatTimeAgo, intervalParts } from './time';

const CONFIRM_DELAY_MS = 4000;

interface WatchCardProps {
  watch: WatchView;
  /** Saved channels, to show where the alerts go. */
  channels: ChannelView[] | undefined;
}

/** One watch: what the product looks like now, where alerts go, and quick actions. */
export function WatchCard({ watch, channels }: WatchCardProps) {
  const { t, i18n } = useTranslation();
  const locale = toLocale(i18n.resolvedLanguage);
  const queryClient = useQueryClient();
  const snapshot = watch.lastReading?.snapshot;
  const hostname = new URL(watch.url).hostname.replace(/^www\./, '');
  const isProduct = watch.type === 'product';

  const refresh = useMutation({
    mutationFn: () => refreshWatch(watch.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watches'] }),
  });
  const remove = useMutation({
    mutationFn: () => deleteWatch(watch.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watches'] }),
  });
  const toggle = useMutation({
    mutationFn: () => updateWatch(watch.id, { active: !watch.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watches'] }),
  });
  const [editing, setEditing] = useState(false);

  // Deleting takes two clicks; the confirmation goes away by itself.
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), CONFIRM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  const channelNames = watch.channelIds
    .map((id) => channels?.find((channel) => channel.id === id)?.name)
    .filter((name): name is string => name !== undefined);

  return (
    <li
      className={cn(
        'flex gap-4 rounded-xl border bg-card p-4 transition-colors',
        !watch.active && 'opacity-60',
      )}
    >
      <a href={watch.url} target="_blank" rel="noreferrer" tabIndex={-1} aria-hidden>
        <ProductImage
          src={snapshot?.imageUrl}
          alt=""
          className="size-16 sm:size-20"
          fallback={isProduct ? <Package /> : <LayoutList />}
        />
      </a>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <a
              href={watch.url}
              target="_blank"
              rel="noreferrer"
              className="line-clamp-2 leading-snug font-medium break-words hover:underline"
            >
              {watch.name}
            </a>
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              {hostname}
              <ExternalLink className="size-3 shrink-0" aria-hidden />
            </span>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            {snapshot && <StockBadge status={snapshot.status} />}
            {!watch.active && <Badge variant="secondary">{t('watches.card.paused')}</Badge>}
            {!isProduct && <Badge variant="secondary">{t(`watches.type.listing.short`)}</Badge>}
          </div>
        </div>

        {snapshot && <PriceTag price={snapshot.price} regularPrice={snapshot.regularPrice} />}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {isProduct && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden />
              {watch.lastReading
                ? t('watches.card.checked', {
                    when: formatTimeAgo(new Date(watch.lastReading.checkedAt), new Date(), locale),
                  })
                : t('watches.card.neverChecked')}
            </span>
          )}
          {watch.intervalSeconds !== null && (
            <span className="inline-flex items-center gap-1">
              <Timer className="size-3.5" aria-hidden />
              {t(`watches.every.${intervalParts(watch.intervalSeconds).unit}`, {
                count: intervalParts(watch.intervalSeconds).count,
              })}
            </span>
          )}
          <span
            className="inline-flex min-w-0 items-center gap-1"
            title={channelNames.join(', ') || undefined}
          >
            {watch.channelIds.length > 0 ? (
              <BellRing className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <BellOff className="size-3.5 shrink-0" aria-hidden />
            )}
            <span className="truncate">
              {watch.channelIds.length === 0
                ? t('watches.card.noChannel')
                : channelNames.length === watch.channelIds.length && channelNames.length <= 2
                  ? channelNames.join(', ')
                  : t('watches.card.channels', { count: watch.channelIds.length })}
            </span>
          </span>
        </div>

        {(refresh.isError || remove.isError || toggle.isError) && (
          <p className="text-xs break-words text-destructive">
            {refresh.isError
              ? t('watches.card.refreshError', { error: refresh.error.message })
              : toggle.isError
                ? t('watches.edit.saveError', { error: toggle.error.message })
                : t('watches.card.deleteError', { error: remove.error?.message ?? '' })}
          </p>
        )}

        <div className="-ml-2 flex flex-wrap gap-1">
          {isProduct && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
            >
              <RefreshCw className={cn(refresh.isPending && 'animate-spin')} aria-hidden />
              {t('watches.card.refresh')}
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            {t('watches.card.edit')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => toggle.mutate()}
            disabled={toggle.isPending}
          >
            {watch.active ? <Pause aria-hidden /> : <Play aria-hidden />}
            {watch.active ? t('watches.card.pause') : t('watches.card.resume')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(confirming && 'text-destructive hover:text-destructive')}
            onClick={() => (confirming ? remove.mutate() : setConfirming(true))}
            disabled={remove.isPending}
          >
            <Trash2 aria-hidden />
            {confirming ? t('watches.card.confirmDelete') : t('watches.card.delete')}
          </Button>
        </div>
      </div>

      <EditWatchDialog watch={editing ? watch : undefined} onClose={() => setEditing(false)} />
    </li>
  );
}
