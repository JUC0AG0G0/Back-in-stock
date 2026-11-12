import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Loader2 } from 'lucide-react';
import { useId, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, type ChannelView } from '@/lib/api';
import { cn } from '@/lib/utils';
import { updateWatch, type WatchView } from './api';
import { intervalParts } from './time';

/** Frequencies offered in the edit panel, in seconds. The server refuses under a minute. */
const FREQUENCY_PRESETS = [60, 300, 900, 1800, 3600, 6 * 3600, 24 * 3600] as const;

const DEFAULT_FREQUENCY = 'default';

interface EditWatchDialogProps {
  /** The watch being edited, undefined while the panel is closed. */
  watch: WatchView | undefined;
  onClose: () => void;
}

/** Edit panel of a watch: pause or resume it, its check frequency and the channels to notify. */
export function EditWatchDialog({ watch, onClose }: EditWatchDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={watch !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('watches.edit.title')}</DialogTitle>
          <DialogDescription className="truncate" title={watch?.name}>
            {watch?.name}
          </DialogDescription>
        </DialogHeader>
        {/* Keyed by watch so reopening starts from the saved values. */}
        {watch && <EditWatchForm key={watch.id} watch={watch} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EditWatchForm({ watch, onDone }: { watch: WatchView; onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const formId = useId();
  const [active, setActive] = useState(watch.active);
  const [intervalSeconds, setIntervalSeconds] = useState(watch.intervalSeconds);
  const [channelIds, setChannelIds] = useState(watch.channelIds);
  const channels = useQuery({ queryKey: ['channels'], queryFn: api.channels });

  const save = useMutation({
    mutationFn: () => updateWatch(watch.id, { active, intervalSeconds, channelIds }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['watches'] });
      onDone();
    },
  });

  // A frequency set by hand (through the API) stays selectable.
  const presets: number[] = [...FREQUENCY_PRESETS];
  if (watch.intervalSeconds !== null && !presets.includes(watch.intervalSeconds)) {
    presets.push(watch.intervalSeconds);
    presets.sort((a, b) => a - b);
  }
  const every = (seconds: number) => {
    const { unit, count } = intervalParts(seconds);
    return t(`watches.every.${unit}`, { count });
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${formId}-active`}>{t('watches.edit.activeLabel')}</Label>
          <p className="text-sm text-muted-foreground">{t('watches.edit.activeHint')}</p>
        </div>
        <Switch id={`${formId}-active`} checked={active} onCheckedChange={setActive} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-frequency`}>{t('watches.edit.frequencyLabel')}</Label>
        <select
          id={`${formId}-frequency`}
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
          value={intervalSeconds === null ? DEFAULT_FREQUENCY : String(intervalSeconds)}
          onChange={(event) =>
            setIntervalSeconds(
              event.target.value === DEFAULT_FREQUENCY ? null : Number(event.target.value),
            )
          }
        >
          <option value={DEFAULT_FREQUENCY}>{t('watches.edit.frequencyDefault')}</option>
          {presets.map((seconds) => (
            <option key={seconds} value={seconds}>
              {every(seconds)}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">{t('watches.edit.frequencyHint')}</p>
      </div>

      {channels.data && (
        <ChannelChecklist
          // A channel whose plugin is gone stays listed while picked, so it can be removed.
          channels={channels.data.filter(
            (channel) => channel.available || watch.channelIds.includes(channel.id),
          )}
          selected={channelIds}
          onChange={setChannelIds}
        />
      )}

      {save.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {t('watches.edit.saveError', { error: save.error.message })}
          </AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('watches.edit.cancel')}
        </Button>
        <Button type="submit" disabled={save.isPending || channels.isPending}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {t('watches.edit.save')}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface ChannelChecklistProps {
  channels: ChannelView[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

/** Where the alerts of this watch go: any of the saved channels, or none. */
function ChannelChecklist({ channels, selected, onChange }: ChannelChecklistProps) {
  const { t } = useTranslation();
  const formId = useId();

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-medium">{t('watches.edit.channelsLegend')}</legend>
      {channels.length === 0 ? (
        <Alert>
          <BellRing aria-hidden />
          <AlertDescription className="flex flex-col gap-1">
            <span>{t('watches.edit.noChannel')}</span>
            <a href="#/channels" className="underline">
              {t('watches.edit.addChannel')}
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
                  {!channel.available ? (
                    <Badge variant="destructive">{t('watches.edit.channelUnavailable')}</Badge>
                  ) : (
                    !channel.enabled && (
                      <Badge variant="secondary">{t('watches.edit.channelDisabled')}</Badge>
                    )
                  )}
                </span>
              </label>
            );
          })}
          {selected.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('watches.edit.noChannelPicked')}</p>
          )}
        </>
      )}
    </fieldset>
  );
}
