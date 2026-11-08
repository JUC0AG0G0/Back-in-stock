import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, ApiError, type ChannelConfig, type NotifierInfo } from '@/lib/api';

interface SaveChannelFormProps {
  notifier: NotifierInfo;
  config: ChannelConfig;
  defaultName: string;
  onSaved: () => void;
}

/** Last step: the channel's name (e.g. "Mon Telegram perso") and whether it is a default one. */
export function SaveChannelForm({ notifier, config, defaultName, onSaved }: SaveChannelFormProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const nameId = useId();
  const defaultId = useId();
  const [name, setName] = useState(defaultName);
  const [isDefault, setIsDefault] = useState(false);
  const save = useMutation({
    mutationFn: () => api.createChannel({ notifierId: notifier.id, name, config, isDefault }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['channels'] });
      onSaved();
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
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
        <p className="text-xs text-muted-foreground">{t('channels.nameHelp')}</p>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor={defaultId}>{t('channels.isDefault')}</Label>
          <p className="text-xs text-muted-foreground">{t('channels.isDefaultHelp')}</p>
        </div>
        <Switch id={defaultId} checked={isDefault} onCheckedChange={setIsDefault} />
      </div>
      {save.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {save.error instanceof ApiError && save.error.issues.length > 0
              ? save.error.issues.join(' · ')
              : save.error.message}
          </AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="self-start" disabled={save.isPending || name.trim() === ''}>
        {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
        {t('channels.save')}
      </Button>
    </form>
  );
}
