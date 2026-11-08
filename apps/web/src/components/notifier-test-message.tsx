import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import {
  MESSAGE_PRESETS,
  presetMessage,
  type NotifierTestOptions,
} from '@/lib/notifier-test-presets';
import { cn } from '@/lib/utils';

const FIELDS = ['title', 'text', 'url', 'imageUrl'] as const;
const URL_FIELDS: ReadonlySet<string> = new Set(['url', 'imageUrl']);
const URL_INPUT = 'url';
const TEXT_INPUT = 'text';

/**
 * What a notifier test sends: the standard test message, or a custom one (text, link, picture,
 * link without picture…) to check how the channel renders it, to every channel or only one.
 */
export function NotifierTestMessage({
  notifierId,
  value,
  onChange,
}: {
  notifierId: string;
  value: NotifierTestOptions;
  onChange(value: NotifierTestOptions): void;
}) {
  const { t } = useTranslation();
  const channels = useQuery({ queryKey: ['channels'], queryFn: api.channels, retry: false });
  const own = (channels.data ?? []).filter((c) => c.notifierId === notifierId);
  const sample = {
    title: t('pluginTests.message.sampleTitle'),
    text: t('pluginTests.message.sampleText'),
  };
  const fieldClass =
    'rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground disabled:opacity-50';

  return (
    <div className="space-y-3">
      <fieldset className="space-y-1">
        <legend className="text-xs text-muted-foreground">{t('pluginTests.message.preset')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {MESSAGE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={value.preset === preset}
              onClick={() => onChange({ ...value, preset, message: presetMessage(preset, sample) })}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs',
                value.preset === preset
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:bg-muted',
              )}
            >
              {t(`pluginTests.message.presets.${preset}`)}
            </button>
          ))}
        </div>
      </fieldset>

      {value.preset !== 'default' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <label
              key={field}
              className={cn(
                'flex flex-col gap-1 text-xs text-muted-foreground',
                field === 'text' && 'sm:col-span-2',
              )}
            >
              {t(`pluginTests.message.fields.${field}`)}
              {field === 'text' ? (
                <textarea
                  rows={2}
                  value={value.message.text}
                  onChange={(e) =>
                    onChange({ ...value, message: { ...value.message, text: e.target.value } })
                  }
                  className={fieldClass}
                />
              ) : (
                <input
                  type={URL_FIELDS.has(field) ? URL_INPUT : TEXT_INPUT}
                  value={value.message[field]}
                  onChange={(e) =>
                    onChange({ ...value, message: { ...value.message, [field]: e.target.value } })
                  }
                  className={fieldClass}
                />
              )}
            </label>
          ))}
          <p className="text-xs text-muted-foreground sm:col-span-2">
            {t('pluginTests.message.imageHint')}
          </p>
        </div>
      )}

      {own.length > 1 && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t('pluginTests.message.channel')}
          <select
            value={value.channelId}
            onChange={(e) => onChange({ ...value, channelId: e.target.value })}
            className={fieldClass}
          >
            <option value="">{t('pluginTests.message.allChannels')}</option>
            {own.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
