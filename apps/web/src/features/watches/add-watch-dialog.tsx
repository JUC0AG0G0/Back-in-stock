import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, LayoutList, Loader2, Package } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { createWatch, matchSources, type SourceMatch, type WatchType, type WatchView } from './api';
import { guessWatchType } from './url';

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
  const [name, setName] = useState('');
  const plugins = match.candidates.filter((candidate) => candidate.supports.includes(type));

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
          <AlertDescription className="flex flex-col gap-2">
            <span>{t('watches.add.noPlugin', { hostname: match.hostname })}</span>
            <a
              href={docsUrl(i18n.language, 'plugins/overview')}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline"
            >
              {t('watches.add.pluginDocs')}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t('watches.add.close')}
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
          ...(name.trim() === '' ? {} : { name: name.trim() }),
        });
      }}
    >
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
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor={nameId}>{t('watches.add.nameLabel')}</Label>
        <Input
          id={nameId}
          value={name}
          maxLength={200}
          placeholder={match.hostname}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

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
