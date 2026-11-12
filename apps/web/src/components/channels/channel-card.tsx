import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageSquareText, Pencil, Send, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NotifierTestMessage } from '@/components/notifier-test-message';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, ApiError, type ChannelConfig, type ChannelView, type NotifierInfo } from '@/lib/api';
import type { NotifierTestOptions } from '@/lib/notifier-test-presets';
import { testPlugin } from '@/lib/plugin-tests-api';
import { ConfigFields } from './config-fields';

interface ChannelCardProps {
  channel: ChannelView;
  notifier: NotifierInfo | undefined;
}

function errorText(error: Error): string {
  return error instanceof ApiError && error.issues.length > 0
    ? error.issues.join(' · ')
    : error.message;
}

export function ChannelCard({ channel, notifier }: ChannelCardProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [testOptions, setTestOptions] = useState<NotifierTestOptions>({
    preset: 'default',
    message: { title: '', text: '', url: '', imageUrl: '' },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['channels'] });

  const update = useMutation({
    mutationFn: (body: Parameters<typeof api.updateChannel>[1]) =>
      api.updateChannel(channel.id, body),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteChannel(channel.id),
    onSuccess: refresh,
  });
  // Same test as the plugin test API, limited to this channel, with an optional custom message.
  const test = useMutation({
    mutationFn: async () => {
      const [result] = await testPlugin('notifier', channel.notifierId, {
        channelId: channel.id,
        locale: i18n.resolvedLanguage ?? 'en',
        ...(customizing && testOptions.preset !== 'default'
          ? { message: testOptions.message }
          : {}),
      });
      return result;
    },
  });

  const enabledId = `channel-${channel.id}-enabled`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {channel.name}
          {channel.isDefault && (
            <Badge variant="secondary">
              <Star aria-hidden />
              {t('channels.default')}
            </Badge>
          )}
          {!channel.enabled && <Badge variant="outline">{t('channels.disabled')}</Badge>}
          {!channel.available && <Badge variant="destructive">{t('channels.pluginMissing')}</Badge>}
        </CardTitle>
        <CardDescription>
          {notifier
            ? t('channels.pluginMeta', { name: notifier.name, version: notifier.version })
            : channel.notifierId}
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          <Label htmlFor={enabledId} className="sr-only">
            {t('channels.enabled')}
          </Label>
          <Switch
            id={enabledId}
            checked={channel.enabled}
            disabled={update.isPending}
            onCheckedChange={(enabled) => update.mutate({ enabled })}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => test.mutate()}
            disabled={test.isPending || !channel.available}
          >
            {test.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Send aria-hidden />
            )}
            {t('channels.sendTest')}
          </Button>
          <Button
            variant={customizing ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={customizing}
            onClick={() => setCustomizing(!customizing)}
            disabled={!channel.available}
          >
            <MessageSquareText aria-hidden />
            {t('channels.customizeTest')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(!editing)}
            disabled={!notifier}
          >
            <Pencil aria-hidden />
            {t('channels.edit')}
          </Button>
          {!channel.isDefault && (
            <Button variant="ghost" size="sm" onClick={() => update.mutate({ isDefault: true })}>
              <Star aria-hidden />
              {t('channels.makeDefault')}
            </Button>
          )}
          {channel.isDefault && (
            <Button variant="ghost" size="sm" onClick={() => update.mutate({ isDefault: false })}>
              {t('channels.removeDefault')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => {
              if (window.confirm(t('channels.confirmDelete', { name: channel.name })))
                remove.mutate();
            }}
            disabled={remove.isPending}
          >
            <Trash2 aria-hidden />
            {t('channels.delete')}
          </Button>
        </div>
        {customizing && (
          <div className="rounded-lg border p-3">
            <NotifierTestMessage value={testOptions} onChange={setTestOptions} />
          </div>
        )}
        {test.data?.status === 'passed' && (
          <p className="text-sm text-green-700 dark:text-green-400">{t('channels.testSent')}</p>
        )}
        {(test.data?.status === 'failed' || test.isError) && (
          <Alert variant="destructive">
            <AlertDescription>
              {t('channels.testFailed', {
                error: test.data?.error?.message ?? test.error?.message ?? '',
              })}
            </AlertDescription>
          </Alert>
        )}
        {(update.isError || remove.isError) && (
          <Alert variant="destructive">
            <AlertDescription>
              {errorText((update.error ?? remove.error) as Error)}
            </AlertDescription>
          </Alert>
        )}
        {editing && notifier && (
          <EditChannelForm
            channel={channel}
            notifier={notifier}
            onSaved={() => {
              setEditing(false);
              void refresh();
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function EditChannelForm({
  channel,
  notifier,
  onSaved,
}: {
  channel: ChannelView;
  notifier: NotifierInfo;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(channel.name);
  const [config, setConfig] = useState<ChannelConfig>(channel.config);
  const save = useMutation({
    mutationFn: () => api.updateChannel(channel.id, { name, config }),
    onSuccess: onSaved,
  });
  const nameId = `channel-${channel.id}-name`;
  return (
    <form
      className="flex flex-col gap-4 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={nameId}>{t('channels.name')}</Label>
        <Input
          id={nameId}
          value={name}
          required
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <ConfigFields
        notifier={notifier}
        value={config}
        onChange={setConfig}
        secretsSet={channel.secretsSet}
      />
      {save.isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorText(save.error)}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="self-start" disabled={save.isPending}>
        {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
        {t('channels.save')}
      </Button>
    </form>
  );
}
