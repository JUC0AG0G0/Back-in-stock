import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  BookOpen,
  ExternalLink,
  LayoutList,
  Loader2,
  MessageSquarePlus,
  Package,
} from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { docsUrl } from '@/features/update/api';
import { api, type ChannelView } from '@/lib/api';
import { newSiteIssueUrl } from '@/lib/issues';
import { cn } from '@/lib/utils';
import { createWatch, matchSources, type SourceMatch, type WatchType, type WatchView } from './api';
import { ProductPreview } from './product-preview';
import { guessWatchType } from './url';
import { previewedProduct, useProductPreview } from './use-product-preview';

const WATCH_TYPES: WatchType[] = ['product', 'listing'];

interface AddWatchDialogProps {
  /** The pasted link. The dialog is open while it is set. */
  url: string | undefined;
  onClose: () => void;
  onCreated: (watch: WatchView) => void;
}

/**
 * Opens on a pasted link: what to watch on this page (a product's stock, or new items
 * on a listing such as a refurbished page) and which source plugin reads it.
 * The best plugin for the URL is pre-selected.
 */
export function AddWatchDialog({ url, onClose, onCreated }: AddWatchDialogProps) {
  const { t } = useTranslation();
  // Keeps showing the last link while the dialog fades out after closing.
  const [shown, setShown] = useState(url);
  if (url !== undefined && url !== shown) setShown(url);
  const match = useQuery({
    queryKey: ['sources', 'match', shown],
    queryFn: () => matchSources(shown ?? ''),
    enabled: shown !== undefined,
    retry: false,
  });

  return (
    <Dialog open={url !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('watches.add.title')}</DialogTitle>
          <DialogDescription className="truncate" title={shown}>
            {shown}
          </DialogDescription>
        </DialogHeader>
        {match.isPending && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('watches.add.analysing')}
          </p>
        )}
        {match.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {t('watches.add.matchError', { error: match.error.message })}
            </AlertDescription>
          </Alert>
        )}
        {match.data && (
          // Keyed by URL so a new paste starts from fresh suggestions.
          <AddWatchForm
            key={match.data.url}
            match={match.data}
            onCancel={onClose}
            onCreated={onCreated}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface AddWatchFormProps {
  match: SourceMatch;
  onCancel: () => void;
  onCreated: (watch: WatchView) => void;
}

function AddWatchForm({ match, onCancel, onCreated }: AddWatchFormProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const formId = useId();
  const nameId = `${formId}-name`;
  const [type, setType] = useState<WatchType>(() => guessWatchType(match));
  const [sourceId, setSourceId] = useState(match.suggested[type]);
  // Undefined until the user types: the name read on the product page is pre-filled.
  const [typedName, setTypedName] = useState<string>();
  const plugins = match.candidates.filter((candidate) => candidate.supports.includes(type));
  const channels = useQuery({ queryKey: ['channels'], queryFn: api.channels });
  const preview = useProductPreview(match.url, type === 'product' ? sourceId : undefined);
  // The product name read on the page is a better default name than the site's hostname.
  const product = type === 'product' ? previewedProduct(preview.data) : undefined;
  const name = typedName ?? product?.title ?? '';
  // Undefined until the user changes it: the enabled default channels are pre-checked.
  const [picked, setPicked] = useState<string[]>();
  const usable = (channels.data ?? []).filter((channel) => channel.available);
  const channelIds =
    picked ?? usable.filter((channel) => channel.enabled && channel.isDefault).map((c) => c.id);

  const create = useMutation({
    mutationFn: createWatch,
    onSuccess: (watch) => {
      void queryClient.invalidateQueries({ queryKey: ['watches'] });
      onCreated(watch);
    },
  });

  if (match.candidates.length === 0) {
    return (
      <>
        <Alert>
          <AlertDescription className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span>{t('watches.add.noPlugin', { hostname: match.hostname })}</span>
              <span className="text-muted-foreground">{t('watches.add.requestHint')}</span>
            </div>
            <div className="flex flex-col gap-1 border-t pt-3 text-muted-foreground">
              <span>{t('watches.add.devHint')}</span>
              <a
                href={docsUrl(i18n.language, 'plugins/overview')}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline"
              >
                <BookOpen className="size-3" aria-hidden />
                {t('watches.add.pluginDocs')}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </div>
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t('watches.add.close')}
          </Button>
          <Button asChild>
            <a href={newSiteIssueUrl(match.url)} target="_blank" rel="noreferrer">
              <MessageSquarePlus aria-hidden />
              {t('watches.add.requestSite')}
            </a>
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!sourceId) return;
        create.mutate({
          url: match.url,
          type,
          sourceId,
          name: name.trim() || match.hostname,
          ...(product ? { snapshot: product } : {}),
          ...(channels.data ? { channelIds } : {}),
        });
      }}
    >
      {type === 'product' && sourceId && <ProductPreview url={match.url} sourceId={sourceId} />}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium">{t('watches.add.whatLegend')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {WATCH_TYPES.map((option) => {
            const available = match.suggested[option] !== undefined;
            return (
              <Choice
                key={option}
                name={`${formId}-type`}
                checked={type === option}
                disabled={!available}
                onSelect={() => {
                  // Changing what to watch selects the best plugin for it.
                  setType(option);
                  setSourceId(match.suggested[option]);
                }}
                icon={option === 'product' ? <Package aria-hidden /> : <LayoutList aria-hidden />}
                title={t(`watches.type.${option}.title`)}
                description={
                  available
                    ? t(`watches.type.${option}.description`)
                    : t('watches.add.typeUnavailable')
                }
              />
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium">{t('watches.add.pluginLegend')}</legend>
        {plugins.map((plugin) => (
          <Choice
            key={plugin.id}
            name={`${formId}-plugin`}
            checked={sourceId === plugin.id}
            onSelect={() => setSourceId(plugin.id)}
            title={plugin.name}
            badge={
              plugin.id === match.suggested[type] ? (
                <Badge>{t('watches.add.suggested')}</Badge>
              ) : undefined
            }
            description={
              plugin.score >= 1 ? t('watches.add.siteSpecific') : t('watches.add.generic')
            }
          />
        ))}
        {!match.candidates.some((candidate) => candidate.score >= 1) && (
          <p className="text-sm text-muted-foreground">
            {t('watches.add.genericOnly')}{' '}
            <a
              href={newSiteIssueUrl(match.url)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline"
            >
              {t('watches.add.requestSite')}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor={nameId}>{t('watches.add.nameLabel')}</Label>
        <Input
          id={nameId}
          value={name}
          maxLength={200}
          placeholder={match.hostname}
          onChange={(event) => setTypedName(event.target.value)}
        />
      </div>

      <ChannelPicker
        channels={usable}
        loading={channels.isPending}
        selected={channelIds}
        onChange={setPicked}
      />

      {create.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {t('watches.add.createError', { error: create.error.message })}
          </AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('watches.add.cancel')}
        </Button>
        <Button type="submit" disabled={!sourceId || create.isPending}>
          {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {t('watches.add.submit')}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface ChannelPickerProps {
  channels: ChannelView[];
  loading: boolean;
  selected: string[];
  onChange: (ids: string[]) => void;
}

/** Where the alerts of this watch go: one or more of the saved channels. */
function ChannelPicker({ channels, loading, selected, onChange }: ChannelPickerProps) {
  const { t } = useTranslation();
  const formId = useId();
  if (loading) return null;

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-medium">{t('watches.add.channelsLegend')}</legend>
      {channels.length === 0 ? (
        <Alert>
          <BellRing aria-hidden />
          <AlertDescription className="flex flex-col gap-1">
            <span>{t('watches.add.noChannel')}</span>
            <a href="#/channels" className="underline">
              {t('watches.add.addChannel')}
            </a>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {channels.map((channel) => {
            const id = `${formId}-${channel.id}`;
            const checked = selected.includes(channel.id);
            return (
              <label
                key={channel.id}
                htmlFor={id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                  checked && 'border-primary bg-muted/50',
                )}
              >
                <input
                  id={id}
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked
                        ? selected.filter((other) => other !== channel.id)
                        : [...selected, channel.id],
                    )
                  }
                />
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{channel.name}</span>
                  <span className="text-sm text-muted-foreground capitalize">
                    {channel.notifierId}
                  </span>
                  {!channel.enabled && (
                    <Badge variant="secondary">{t('watches.add.channelDisabled')}</Badge>
                  )}
                </span>
              </label>
            );
          })}
          {selected.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('watches.add.noChannelPicked')}</p>
          )}
        </>
      )}
    </fieldset>
  );
}

interface ChoiceProps {
  name: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

/** A radio button drawn as a selectable card. */
function Choice({
  name,
  checked,
  disabled,
  onSelect,
  title,
  description,
  icon,
  badge,
}: ChoiceProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
        checked && 'border-primary bg-muted/50',
        disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
      )}
    >
      <input
        type="radio"
        name={name}
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      {icon && <span className="mt-0.5 text-muted-foreground [&_svg]:size-5">{icon}</span>}
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {title}
          {badge}
        </span>
        <span className="text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}
