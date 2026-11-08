import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChannelCard } from '@/components/channels/channel-card';
import { PlainSetupForm } from '@/components/channels/plain-setup-form';
import { SetupWizard } from '@/components/channels/setup-wizard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, type NotifierInfo } from '@/lib/api';
import { usePluginText } from '@/lib/plugin-text';

/** First step of adding a channel: choosing its notifier. */
const PICK = 'pick';

/** "Canaux" screen (SPEC §7): channels list, and adding one with the plugin's guided setup. */
export function ChannelsPage() {
  const { t } = useTranslation();
  const notifiers = useQuery({ queryKey: ['notifiers'], queryFn: api.notifiers });
  const channels = useQuery({ queryKey: ['channels'], queryFn: api.channels });
  const [adding, setAdding] = useState<typeof PICK | NotifierInfo>();

  const byId = new Map(notifiers.data?.map((n) => [n.id, n]));
  const close = () => setAdding(undefined);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('channels.title')}</h1>
          <p className="text-muted-foreground">{t('channels.intro')}</p>
        </div>
        {adding === undefined && (
          <Button onClick={() => setAdding(PICK)} disabled={!notifiers.data?.length}>
            <Plus aria-hidden />
            {t('channels.add')}
          </Button>
        )}
      </div>

      {(notifiers.isError || channels.isError) && (
        <Alert variant="destructive">
          <AlertDescription>{t('channels.loadError')}</AlertDescription>
        </Alert>
      )}

      {adding === PICK && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">{t('channels.pickNotifier')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {notifiers.data?.map((notifier) => (
              <NotifierChoice
                key={notifier.id}
                notifier={notifier}
                onPick={() => setAdding(notifier)}
              />
            ))}
          </div>
          <Button variant="ghost" className="self-start" onClick={close}>
            {t('channels.cancel')}
          </Button>
        </section>
      )}

      {typeof adding === 'object' &&
        (adding.setupGuide.length > 0 ? (
          <SetupWizard notifier={adding} onDone={close} onCancel={() => setAdding(PICK)} />
        ) : (
          <PlainSetupForm notifier={adding} onDone={close} onCancel={() => setAdding(PICK)} />
        ))}

      {channels.data?.length === 0 && adding === undefined && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {t('channels.empty')}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {channels.data?.map((channel) => (
          <ChannelCard key={channel.id} channel={channel} notifier={byId.get(channel.notifierId)} />
        ))}
      </div>
    </div>
  );
}

function NotifierChoice({ notifier, onPick }: { notifier: NotifierInfo; onPick: () => void }) {
  const pt = usePluginText(notifier);
  const description = pt('description', true);
  return (
    <button type="button" onClick={onPick} className="text-left">
      <Card className="h-full transition-colors hover:bg-accent">
        <CardHeader>
          <CardTitle>{notifier.name}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      </Card>
    </button>
  );
}
