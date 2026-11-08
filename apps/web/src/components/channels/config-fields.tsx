import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { ChannelConfig, NotifierInfo } from '@/lib/api';
import { usePluginText } from '@/lib/plugin-text';

interface ConfigFieldsProps {
  notifier: NotifierInfo;
  /** Fields to show, in order. Defaults to every field of the schema. */
  fields?: string[];
  value: ChannelConfig;
  onChange: (value: ChannelConfig) => void;
  /** Secrets already stored: an empty field keeps them. */
  secretsSet?: string[];
}

/** Form generated from the notifier's configSchema (SPEC §7 "Canaux"). */
export function ConfigFields({
  notifier,
  fields,
  value,
  onChange,
  secretsSet = [],
}: ConfigFieldsProps) {
  const properties = notifier.configSchema.properties ?? {};
  const names = (fields ?? Object.keys(properties)).filter((name) => name in properties);
  return (
    <div className="flex flex-col gap-4">
      {names.map((name) => (
        <ConfigField
          key={name}
          notifier={notifier}
          name={name}
          value={value[name]}
          stored={secretsSet.includes(name)}
          onChange={(fieldValue) => onChange({ ...value, [name]: fieldValue })}
        />
      ))}
    </div>
  );
}

interface ConfigFieldProps {
  notifier: NotifierInfo;
  name: string;
  value: unknown;
  stored: boolean;
  onChange: (value: unknown) => void;
}

function ConfigField({ notifier, name, value, stored, onChange }: ConfigFieldProps) {
  const { t } = useTranslation();
  const pt = usePluginText(notifier);
  const id = useId();
  const schema = notifier.configSchema.properties?.[name] ?? {};
  const label = pt(`fields.${name}.label`);
  const help = pt(`fields.${name}.help`, true);
  const helpId = `${id}-help`;

  if (schema.type === 'boolean') {
    const checked = typeof value === 'boolean' ? value : schema.default === true;
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor={id}>{label}</Label>
          {help && (
            <p id={helpId} className="text-xs text-muted-foreground">
              {help}
            </p>
          )}
        </div>
        <Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={helpId} />
      </div>
    );
  }

  const secret = notifier.secretFields.includes(name);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={secret ? 'password' : 'text'}
        autoComplete="off"
        spellCheck={false}
        value={typeof value === 'string' ? value : ''}
        placeholder={secret && stored ? t('channels.secretUnchanged') : undefined}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={help ? helpId : undefined}
      />
      {help && (
        <p id={helpId} className="text-xs text-muted-foreground">
          {help}
        </p>
      )}
    </div>
  );
}
