import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, type ChannelConfig, type NotifierInfo } from '@/lib/api';
import { defaultConfig } from '@/lib/default-config';
import { ConfigFields } from './config-fields';
import { SaveChannelForm } from './save-channel-form';

/** For a notifier without `setupGuide`: the form generated from its configSchema. */
export function PlainSetupForm({
  notifier,
  onDone,
  onCancel,
}: {
  notifier: NotifierInfo;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [config, setConfig] = useState<ChannelConfig>(() => defaultConfig(notifier));
  const test = useMutation({
    mutationFn: () =>
      api.testSettings(notifier.id, { config, locale: i18n.resolvedLanguage ?? 'en' }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('channels.addTitle', { name: notifier.name })}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ConfigFields notifier={notifier} value={config} onChange={setConfig} />
        <Button
          variant="outline"
          className="self-start"
          onClick={() => test.mutate()}
          disabled={test.isPending}
        >
          {test.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {t('channels.sendTest')}
        </Button>
        {test.data?.ok === true && (
          <p className="text-sm text-green-700 dark:text-green-400">{t('channels.testSent')}</p>
        )}
        {test.data?.ok === false && (
          <Alert variant="destructive">
            <AlertDescription>
              {t('channels.testFailed', { error: test.data.error })}
            </AlertDescription>
          </Alert>
        )}
        <SaveChannelForm
          notifier={notifier}
          config={config}
          defaultName={notifier.name}
          onSaved={onDone}
        />
        <Button variant="ghost" className="self-start" onClick={onCancel}>
          {t('channels.cancel')}
        </Button>
      </CardContent>
    </Card>
  );
}
