import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CheckCircle2, ExternalLink, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  checkForUpdate,
  fetchSettings,
  saveSettings,
  type Settings,
  type SettingsPatch,
  type UpdateChannel,
} from '@/features/settings/api';
import { docsUrl, fetchUpdateStatus, type UpdateStatus } from '@/features/update/api';

const UPDATE_CHANNELS: UpdateChannel[] = ['stable', 'prerelease'];

/** "Paramètres" screen (SPEC §7): updates, API docs and a link to the documentation. */
export function SettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const save = useMutation({
    mutationFn: saveSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data);
      // Turning checks on or off, or changing channel, changes what the banner shows.
      void queryClient.invalidateQueries({ queryKey: ['update'] });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('settings.title')}</h1>
        <p className="text-muted-foreground">{t('settings.intro')}</p>
      </div>

      {settings.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('settings.loadError')}</AlertDescription>
        </Alert>
      )}
      {save.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('settings.saveError')}</AlertDescription>
        </Alert>
      )}

      {settings.data && (
        <>
          <UpdatesCard
            settings={settings.data}
            saving={save.isPending}
            onSave={(patch) => save.mutate(patch)}
          />
          <ApiDocsCard
            settings={settings.data}
            saving={save.isPending}
            onSave={(patch) => save.mutate(patch)}
          />
        </>
      )}
      <DocumentationCard />
    </div>
  );
}

interface CardProps {
  settings: Settings;
  saving: boolean;
  onSave: (patch: SettingsPatch) => void;
}

function UpdatesCard({ settings, saving, onSave }: CardProps) {
  const { t } = useTranslation();
  const { updateCheck, updateIntervalHours, updateChannel } = settings.values;
  const supported = settings.updateCheckSupported;
  const checkId = useId();
  const intervalId = useId();
  const channelId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.updates.title')}</CardTitle>
        <CardDescription>{t('settings.updates.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {!supported && (
          <Alert>
            <AlertDescription>{t('settings.updates.notARelease')}</AlertDescription>
          </Alert>
        )}

        <CheckNow />

        <SettingRow
          id={checkId}
          label={t('settings.updates.auto')}
          hint={t('settings.updates.autoHint')}
          reset={
            updateCheck.overridden && (
              <ResetButton
                disabled={saving}
                label={t(updateCheck.default ? 'settings.on' : 'settings.off')}
                onClick={() => onSave({ updateCheck: null })}
              />
            )
          }
        >
          <Switch
            id={checkId}
            checked={updateCheck.value}
            disabled={saving || !supported}
            onCheckedChange={(value) => onSave({ updateCheck: value })}
          />
        </SettingRow>

        <SettingRow
          id={intervalId}
          label={t('settings.updates.interval')}
          hint={t('settings.updates.intervalHint', settings.updateIntervalHours)}
          reset={
            updateIntervalHours.overridden && (
              <ResetButton
                disabled={saving}
                label={t('settings.updates.hours', { count: updateIntervalHours.default })}
                onClick={() => onSave({ updateIntervalHours: null })}
              />
            )
          }
        >
          {/* Keyed on the saved value: the field starts over after a save or a reset. */}
          <IntervalField
            key={updateIntervalHours.value}
            id={intervalId}
            value={updateIntervalHours.value}
            limits={settings.updateIntervalHours}
            disabled={saving || !supported || !updateCheck.value}
            onSave={(hours) => onSave({ updateIntervalHours: hours })}
          />
        </SettingRow>

        <SettingRow
          id={channelId}
          label={t('settings.updates.channel')}
          hint={t('settings.updates.channelHint')}
          reset={
            updateChannel.overridden && (
              <ResetButton
                disabled={saving}
                label={t(`settings.updates.channels.${updateChannel.default}`)}
                onClick={() => onSave({ updateChannel: null })}
              />
            )
          }
        >
          <select
            id={channelId}
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm disabled:opacity-50"
            value={updateChannel.value}
            disabled={saving || !supported || !updateCheck.value}
            onChange={(e) => onSave({ updateChannel: e.target.value as UpdateChannel })}
          >
            {UPDATE_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {t(`settings.updates.channels.${channel}`)}
              </option>
            ))}
          </select>
        </SettingRow>
      </CardContent>
    </Card>
  );
}

/** Current version, last check, and the "check now" button. */
function CheckNow() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ['update'], queryFn: fetchUpdateStatus, retry: false });
  const check = useMutation({
    mutationFn: checkForUpdate,
    onSuccess: (data) => queryClient.setQueryData<UpdateStatus>(['update'], data),
  });

  const data = status.data;
  if (!data) return null;
  const dateFormat = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">
            {t('settings.updates.current', { version: data.currentVersion })}
          </span>
          <span className="text-muted-foreground">
            {data.checkedAt
              ? t('settings.updates.lastCheck', {
                  date: dateFormat.format(new Date(data.checkedAt)),
                })
              : t('settings.updates.neverChecked')}
          </span>
        </div>
        <Button
          variant="outline"
          disabled={check.isPending || data.disabledReason === 'not-a-release'}
          onClick={() => check.mutate()}
        >
          {check.isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <RefreshCw aria-hidden />
          )}
          {t('settings.updates.checkNow')}
        </Button>
      </div>
      <div aria-live="polite">
        {check.isError && <p className="text-destructive">{t('settings.updates.checkFailed')}</p>}
        {check.isSuccess && data.error && (
          <p className="text-destructive">
            {t('settings.updates.checkError', { message: data.error })}
          </p>
        )}
        {check.isSuccess && !data.error && data.updateAvailable && data.latestVersion && (
          <p>{t('settings.updates.available', { version: data.latestVersion })}</p>
        )}
        {check.isSuccess && !data.error && !data.updateAvailable && data.enabled && (
          <p className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="size-4" aria-hidden />
            {t('settings.updates.upToDate')}
          </p>
        )}
        {data.disabledReason === 'disabled' && (
          <p className="text-muted-foreground">{t('settings.updates.disabled')}</p>
        )}
      </div>
    </div>
  );
}

function IntervalField({
  id,
  value,
  limits,
  disabled,
  onSave,
}: {
  id: string;
  value: number;
  limits: { min: number; max: number };
  disabled: boolean;
  onSave: (hours: number) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(String(value));
  const hours = Number(draft);
  const valid = Number.isInteger(hours) && hours >= limits.min && hours <= limits.max;

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave(hours);
      }}
    >
      <Input
        id={id}
        type="number"
        className="w-20"
        min={limits.min}
        max={limits.max}
        step={1}
        value={draft}
        disabled={disabled}
        aria-invalid={!valid}
        onChange={(e) => setDraft(e.target.value)}
      />
      <span className="text-muted-foreground">{t('settings.updates.hoursUnit')}</span>
      <Button type="submit" size="sm" disabled={disabled || !valid || hours === value}>
        {t('settings.save')}
      </Button>
    </form>
  );
}

function ApiDocsCard({ settings, saving, onSave }: CardProps) {
  const { t } = useTranslation();
  const { apiDocs } = settings.values;
  const id = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.api.title')}</CardTitle>
        <CardDescription>{t('settings.api.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SettingRow
          id={id}
          label={t('settings.api.enable')}
          hint={t(settings.apiDocs.available ? 'settings.api.hint' : 'settings.api.unavailable')}
          reset={
            apiDocs.overridden && (
              <ResetButton
                disabled={saving}
                label={t(apiDocs.default ? 'settings.on' : 'settings.off')}
                onClick={() => onSave({ apiDocs: null })}
              />
            )
          }
        >
          <Switch
            id={id}
            checked={apiDocs.value && settings.apiDocs.available}
            disabled={saving || !settings.apiDocs.available}
            onCheckedChange={(value) => onSave({ apiDocs: value })}
          />
        </SettingRow>
        {apiDocs.value && settings.apiDocs.available && (
          <Button variant="outline" className="self-start" asChild>
            <a href={settings.apiDocs.path} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden />
              {t('settings.api.open')}
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentationCard() {
  const { t, i18n } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.docs.title')}</CardTitle>
        <CardDescription>{t('settings.docs.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" asChild>
          <a href={docsUrl(i18n.resolvedLanguage ?? 'en', '')} target="_blank" rel="noreferrer">
            <BookOpen aria-hidden />
            {t('settings.docs.open')}
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

function SettingRow({
  id,
  label,
  hint,
  reset,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  reset?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="flex max-w-md flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-muted-foreground">{hint}</p>
        {reset}
      </div>
      {children}
    </div>
  );
}

function ResetButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Button
      variant="link"
      size="xs"
      className="self-start px-0"
      disabled={disabled}
      onClick={onClick}
    >
      <RotateCcw aria-hidden />
      {t('settings.reset', { value: label })}
    </Button>
  );
}
