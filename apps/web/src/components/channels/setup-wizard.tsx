import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ChannelConfig, NotifierInfo, SetupStep } from '@/lib/api';
import { api } from '@/lib/api';
import { defaultConfig } from '@/lib/default-config';
import { interpolate, usePluginText } from '@/lib/plugin-text';
import { ConfigFields } from './config-fields';
import { CopyText } from './copy-text';
import { LinkWithQr } from './link-with-qr';
import { SaveChannelForm } from './save-channel-form';

interface SetupWizardProps {
  notifier: NotifierInfo;
  onDone: () => void;
  onCancel: () => void;
}

/** Guided setup driven by the plugin's `setupGuide` (SPEC §7bis), then naming and saving. */
export function SetupWizard({ notifier, onDone, onCancel }: SetupWizardProps) {
  const { t } = useTranslation();
  const steps = notifier.setupGuide;
  const [index, setIndex] = useState(0);
  const [config, setConfig] = useState<ChannelConfig>(() => defaultConfig(notifier));
  /** Values returned by `validate`, used in links, e.g. {{botUsername}}. */
  const [info, setInfo] = useState<Record<string, string>>({});
  /** Steps whose action succeeded with the current settings. */
  const [passed, setPassed] = useState<Record<string, boolean>>({});
  const [chosenLabel, setChosenLabel] = useState<string>();

  const step = steps[index];
  const total = steps.length + 1;

  const updateConfig = (next: ChannelConfig) => {
    setConfig(next);
    // Settings changed: actions of the current and later steps must run again.
    setPassed((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([id]) => steps.findIndex((s) => s.id === id) < index),
      ),
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardDescription>
          {t('channels.wizard.progress', { current: index + 1, total, name: notifier.name })}
        </CardDescription>
        <CardTitle className="text-lg">
          {step ? <StepTitle notifier={notifier} step={step} /> : t('channels.wizard.saveTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {step ? (
          <StepBody
            key={step.id}
            notifier={notifier}
            step={step}
            config={config}
            info={info}
            onConfigChange={updateConfig}
            onPassed={(extra) => {
              if (extra?.info) setInfo((prev) => ({ ...prev, ...extra.info }));
              if (extra?.label) setChosenLabel(extra.label);
              setPassed((prev) => ({ ...prev, [step.id]: true }));
            }}
            passed={passed[step.id] === true}
          />
        ) : (
          <SaveChannelForm
            notifier={notifier}
            config={config}
            defaultName={[notifier.name, chosenLabel ?? info.botName].filter(Boolean).join(' · ')}
            onSaved={onDone}
          />
        )}

        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={index === 0 ? onCancel : () => setIndex(index - 1)}>
            {index === 0 ? t('channels.cancel') : t('channels.wizard.back')}
          </Button>
          {step && (
            <Button
              onClick={() => setIndex(index + 1)}
              disabled={step.action !== undefined && passed[step.id] !== true}
            >
              {t('channels.wizard.next')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StepTitle({ notifier, step }: { notifier: NotifierInfo; step: SetupStep }) {
  const pt = usePluginText(notifier);
  return <>{pt(step.title)}</>;
}

interface StepBodyProps {
  notifier: NotifierInfo;
  step: SetupStep;
  config: ChannelConfig;
  info: Record<string, string>;
  passed: boolean;
  onConfigChange: (config: ChannelConfig) => void;
  onPassed: (extra?: { info?: Record<string, string>; label?: string }) => void;
}

function StepBody({
  notifier,
  step,
  config,
  info,
  passed,
  onConfigChange,
  onPassed,
}: StepBodyProps) {
  const pt = usePluginText(notifier);
  return (
    <div className="flex flex-col gap-4">
      {step.description && <p className="text-muted-foreground">{pt(step.description)}</p>}
      {step.links?.map((link) => {
        const url = interpolate(link.url, info);
        // A link still waiting for a value (e.g. the bot username) is not shown.
        if (url.includes('{{')) return null;
        return (
          <LinkWithQr
            key={link.url}
            label={pt(link.label)}
            url={url}
            {...(link.qrCode ? { qrCode: true } : {})}
          />
        );
      })}
      {step.copyText && <CopyText text={step.copyText} />}
      {step.action === 'discover' && (
        <DiscoverAction
          notifier={notifier}
          config={config}
          onConfigChange={onConfigChange}
          onPassed={onPassed}
        />
      )}
      {step.fields && (
        <ConfigFields
          notifier={notifier}
          fields={step.fields}
          value={config}
          onChange={onConfigChange}
        />
      )}
      {step.action === 'validate' && (
        <ValidateAction
          notifier={notifier}
          config={config}
          passed={passed}
          info={info}
          onPassed={onPassed}
        />
      )}
      {step.action === 'discover' && !passed && step.fields && (
        <ManualEntry fields={step.fields} config={config} onPassed={onPassed} />
      )}
      {step.action === 'discover' && passed && <Success>{null}</Success>}
      {step.action === 'test' && (
        <TestAction notifier={notifier} config={config} passed={passed} onPassed={onPassed} />
      )}
    </div>
  );
}

function Success({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
      <CheckCircle2 className="size-4" aria-hidden />
      {children ?? t('channels.wizard.ok')}
    </p>
  );
}

/** Plugins may answer with a key of their translations instead of a raw message. */
function Failure({ notifier, message }: { notifier: NotifierInfo; message: string }) {
  const pt = usePluginText(notifier);
  return (
    <Alert variant="destructive">
      <AlertDescription>{pt(message)}</AlertDescription>
    </Alert>
  );
}

interface ActionProps {
  notifier: NotifierInfo;
  config: ChannelConfig;
  passed: boolean;
  onPassed: StepBodyProps['onPassed'];
}

function ValidateAction({
  notifier,
  config,
  passed,
  info,
  onPassed,
}: ActionProps & { info: Record<string, string> }) {
  const { t } = useTranslation();
  const validate = useMutation({
    mutationFn: () => api.validate(notifier.id, { config }),
    onSuccess: (result) => {
      if (result.ok) onPassed(result.info ? { info: result.info } : undefined);
    },
  });
  return (
    <div className="flex flex-col gap-3">
      <Button
        className="self-start"
        onClick={() => validate.mutate()}
        disabled={validate.isPending}
      >
        {validate.isPending && <Loader2 className="animate-spin" aria-hidden />}
        {t('channels.wizard.check')}
      </Button>
      {passed && (
        <Success>
          {info.botName
            ? t('channels.wizard.botFound', {
                name: info.botName,
                username: info.botUsername ?? '',
              })
            : null}
        </Success>
      )}
      {validate.data?.ok === false && <Failure notifier={notifier} message={validate.data.error} />}
      {validate.isError && <Failure notifier={notifier} message={validate.error.message} />}
    </div>
  );
}

function DiscoverAction({
  notifier,
  config,
  onConfigChange,
  onPassed,
}: Omit<ActionProps, 'passed'> & { onConfigChange: (config: ChannelConfig) => void }) {
  const { t } = useTranslation();
  const discover = useMutation({ mutationFn: () => api.discover(notifier.id, { config }) });
  const candidates = discover.data?.ok ? discover.data.candidates : undefined;
  return (
    <div className="flex flex-col gap-3">
      <Button
        className="self-start"
        onClick={() => discover.mutate()}
        disabled={discover.isPending}
      >
        {discover.isPending && <Loader2 className="animate-spin" aria-hidden />}
        {t('channels.wizard.detect')}
      </Button>
      {candidates?.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('channels.wizard.nothingDetected')}</p>
      )}
      {candidates && candidates.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t('channels.wizard.pickOne')}</legend>
          {candidates.map((candidate) => (
            <Button
              key={candidate.label}
              variant="outline"
              className="justify-start"
              onClick={() => {
                onConfigChange({ ...config, ...candidate.config });
                onPassed({ label: candidate.label.replace(/\s*\(.*\)$/, '') });
              }}
            >
              {candidate.label}
            </Button>
          ))}
        </fieldset>
      )}
      {discover.data?.ok === false && <Failure notifier={notifier} message={discover.data.error} />}
      {discover.isError && <Failure notifier={notifier} message={discover.error.message} />}
    </div>
  );
}

/** Lets the user continue with values typed by hand when detection is not possible. */
function ManualEntry({
  fields,
  config,
  onPassed,
}: {
  fields: string[];
  config: ChannelConfig;
  onPassed: StepBodyProps['onPassed'];
}) {
  const { t } = useTranslation();
  const filled = fields.every((name) => typeof config[name] === 'string' && config[name] !== '');
  if (!filled) return null;
  return (
    <Button variant="link" className="self-start px-0" onClick={() => onPassed()}>
      {t('channels.wizard.useTyped')}
    </Button>
  );
}

function TestAction({ notifier, config, passed, onPassed }: ActionProps) {
  const { t, i18n } = useTranslation();
  const test = useMutation({
    mutationFn: () =>
      api.testSettings(notifier.id, { config, locale: i18n.resolvedLanguage ?? 'en' }),
  });
  return (
    <div className="flex flex-col gap-3">
      <Button className="self-start" onClick={() => test.mutate()} disabled={test.isPending}>
        {test.isPending && <Loader2 className="animate-spin" aria-hidden />}
        {t('channels.sendTest')}
      </Button>
      {test.data?.ok === true && !passed && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{t('channels.wizard.didYouReceive')}</span>
          <Button size="sm" onClick={() => onPassed()}>
            {t('channels.wizard.received')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => test.mutate()}>
            {t('channels.wizard.sendAgain')}
          </Button>
        </div>
      )}
      {passed && <Success>{t('channels.wizard.testReceived')}</Success>}
      {test.data?.ok === false && <Failure notifier={notifier} message={test.data.error} />}
      {test.isError && <Failure notifier={notifier} message={test.error.message} />}
    </div>
  );
}
