import { useQuery } from '@tanstack/react-query';
import { cn } from 'cn';
import {
  ArrowUpCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  docsUrl,
  fetchJob,
  fetchRunningVersion,
  fetchUpdateStatus,
  installUpdate,
  InstallRefused,
  type UpdateJob,
  type UpdateStatus,
} from './api';
import { dismissedVersion, dismissVersion, pendingUpdate, setPendingUpdate } from './storage';

// The Markdown renderer is only needed when the changelog opens: keep it out of the main bundle.
const ReleaseNotes = lazy(() =>
  import('./release-notes').then((m) => ({ default: m.ReleaseNotes })),
);

const POLL_MS = 2_000;
/** Pulling a large image on a slow connection can take a while. */
const GIVE_UP_MS = 10 * 60 * 1000;

const DIALOG = { changelog: 'changelog', confirm: 'confirm', manual: 'manual' } as const;
type Dialogs = (typeof DIALOG)[keyof typeof DIALOG] | null;

const MANUAL_COMMAND = 'docker compose pull && docker compose up -d';

/**
 * "New version available" banner, shown at the top of every page (SPEC §7quater),
 * with the changelog, the one-click install and its progress, and the result after the reload.
 */
export function UpdateBanner() {
  const { t, i18n } = useTranslation();
  const status = useQuery({
    queryKey: ['update'],
    queryFn: fetchUpdateStatus,
    refetchInterval: 30 * 60 * 1000,
    retry: false,
  });
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [dismissed, setDismissed] = useState(dismissedVersion);
  const [installing, setInstalling] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const data = status.data;
  if (!data) return null;

  if (installing) return <UpdateProgress version={installing} />;

  const result = <UpdateResult status={data} />;
  const latest = data.latestVersion;
  if (!data.updateAvailable || !latest || dismissed === latest) return result;

  const docs = docsUrl(i18n.resolvedLanguage ?? 'en', 'updates');

  const startInstall = async () => {
    try {
      await installUpdate(latest);
      setPendingUpdate(latest);
      setDialog(null);
      setInstalling(latest);
    } catch (err) {
      setRefusal(err instanceof InstallRefused && err.code !== 'no-updater' ? err.message : null);
      setDialog(DIALOG.manual);
    }
  };

  return (
    <>
      {result}
      <div
        role="status"
        className={cn(
          'flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-sm',
          data.breaking
            ? 'border-orange-300 bg-orange-50 text-orange-950 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-50'
            : 'bg-muted/60',
        )}
      >
        <span className="inline-flex items-center gap-2 font-medium">
          {data.breaking ? (
            <TriangleAlert className="size-4" aria-hidden />
          ) : (
            <ArrowUpCircle className="size-4" aria-hidden />
          )}
          {t('update.available', { latest, current: data.currentVersion })}
        </span>
        {data.breaking && (
          <span>
            {t('update.breakingWarning')}{' '}
            <a href={`${docs}#migration`} target="_blank" rel="noreferrer" className="underline">
              {t('update.migrationGuide')}
            </a>
          </span>
        )}
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setDialog(DIALOG.changelog)}>
            {t('update.whatsNew')}
          </Button>
          <Button
            size="sm"
            onClick={() => setDialog(data.oneClick ? DIALOG.confirm : DIALOG.manual)}
          >
            {t('update.install')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              dismissVersion(latest);
              setDismissed(latest);
            }}
          >
            {t('update.later')}
          </Button>
        </span>
      </div>

      <Dialog
        open={dialog === DIALOG.changelog}
        onOpenChange={(open) => setDialog(open ? DIALOG.changelog : null)}
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[85vh] grid-cols-[minmax(0,1fr)] overflow-x-hidden overflow-y-auto sm:max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle>
              {t('update.changelogTitle', { current: data.currentVersion })}
            </DialogTitle>
            <DialogDescription>{t('update.changelogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="divide-y">
            {data.releases.map((release) => (
              <section key={release.version} className="py-4 first:pt-0">
                <h3 className="flex flex-wrap items-center gap-2 font-semibold">
                  {release.version}
                  {release.prerelease && (
                    <span className="rounded bg-muted px-1.5 text-xs font-normal">
                      {t('update.prerelease')}
                    </span>
                  )}
                  {release.breaking && (
                    <span className="rounded bg-orange-100 px-1.5 text-xs font-normal text-orange-900 dark:bg-orange-900 dark:text-orange-50">
                      {t('update.breaking')}
                    </span>
                  )}
                  <a
                    href={release.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-muted-foreground underline"
                  >
                    {t('update.openOnGitHub')}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                </h3>
                <Suspense fallback={<Loader2 className="mt-2 size-4 animate-spin" aria-hidden />}>
                  <ReleaseNotes markdown={release.notes} />
                </Suspense>
              </section>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t('update.close')}
            </Button>
            <Button onClick={() => setDialog(data.oneClick ? DIALOG.confirm : DIALOG.manual)}>
              {t('update.install')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === DIALOG.confirm}
        onOpenChange={(open) => setDialog(open ? DIALOG.confirm : null)}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('update.confirmTitle', { version: latest })}</DialogTitle>
            <DialogDescription>{t('update.confirmText')}</DialogDescription>
          </DialogHeader>
          {data.breaking && (
            <p className="rounded-md bg-orange-50 p-3 text-sm text-orange-950 dark:bg-orange-950 dark:text-orange-50">
              {t('update.breakingWarning')}{' '}
              <a href={`${docs}#migration`} target="_blank" rel="noreferrer" className="underline">
                {t('update.migrationGuide')}
              </a>
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t('update.cancel')}
            </Button>
            <Button onClick={() => void startInstall()}>{t('update.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === DIALOG.manual}
        onOpenChange={(open) => {
          setDialog(open ? DIALOG.manual : null);
          if (!open) setRefusal(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('update.manualTitle', { version: latest })}</DialogTitle>
            <DialogDescription>{t('update.manualText')}</DialogDescription>
          </DialogHeader>
          <CopyableCommand command={MANUAL_COMMAND} />
          <p className="text-sm text-muted-foreground">
            {t('update.manualPinned', { version: latest })}
          </p>
          {refusal && (
            <p className="text-sm text-muted-foreground">
              {t('update.manualReason', { message: refusal })}
            </p>
          )}
          <DialogFooter>
            <Button variant="link" asChild>
              <a href={docs} target="_blank" rel="noreferrer">
                {t('update.docsLink')}
                <ExternalLink aria-hidden />
              </a>
            </Button>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t('update.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CopyableCommand({ command }: { command: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted p-3">
      <code className="flex-1 overflow-x-auto font-mono text-xs whitespace-nowrap">{command}</code>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          void navigator.clipboard?.writeText(command).then(() => setCopied(true));
        }}
      >
        <Copy aria-hidden />
        {copied ? t('update.copied') : t('update.copy')}
      </Button>
    </div>
  );
}

/**
 * Follows the update while the app goes down and comes back. The updater reports each step;
 * once /api/health answers with the new version, the page reloads on it.
 */
function UpdateProgress({ version }: { version: string }) {
  const { t } = useTranslation();
  const [job, setJob] = useState<UpdateJob | null>(null);
  const [appDown, setAppDown] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const started = Date.now();
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (Date.now() - started > GIVE_UP_MS) return setTimedOut(true);
      try {
        const [current, running] = await Promise.all([fetchJob(), fetchRunningVersion()]);
        setAppDown(false);
        setJob(current);
        if (running === version) return window.location.reload();
        // Finished without switching version: failure or rollback, shown by UpdateResult.
        if (current && current.state !== 'running' && current.targetVersion === version) {
          return window.location.reload();
        }
      } catch {
        setAppDown(true); // the app is being replaced
      }
      setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
    };
  }, [version]);

  const step = appDown ? 'restarting' : (job?.step ?? 'starting');
  const label =
    step === 'done' ? t('update.steps.restarting') : t(`update.steps.${step}`, { version });

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 border-b bg-muted/60 px-4 py-2 text-sm"
    >
      {timedOut ? (
        <>
          <TriangleAlert className="size-4" aria-hidden />
          {t('update.timeout')}
        </>
      ) : (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          <span className="font-medium">{t('update.progressTitle', { version })}</span>
          <span>{label}</span>
          <span className="ml-auto text-muted-foreground">{t('update.progressHint')}</span>
        </>
      )}
    </div>
  );
}

/** Once, after the reload: the outcome of the update started from this browser. */
function UpdateResult({ status }: { status: UpdateStatus }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(pendingUpdate);
  if (!pending) return null;

  const close = () => {
    setPendingUpdate(null);
    setPending(null);
  };
  const job = status.job?.targetVersion === pending ? status.job : null;

  let tone: 'ok' | 'error';
  let text: string;
  if (status.currentVersion === pending) {
    tone = 'ok';
    text = t('update.succeeded', { version: pending });
  } else if (job?.state === 'rolled-back') {
    tone = 'error';
    text = t('update.rolledBack', { version: pending, message: job.message ?? '' });
  } else if (job?.state === 'failed') {
    tone = 'error';
    text = t('update.failed', { version: pending, message: job.message ?? '' });
  } else {
    return null; // still running, or unknown: nothing reliable to say
  }

  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-3 border-b px-4 py-2 text-sm',
        tone === 'ok'
          ? 'border-green-300 bg-green-50 text-green-950 dark:border-green-800 dark:bg-green-950 dark:text-green-50'
          : 'border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950 dark:text-red-50',
      )}
    >
      {tone === 'ok' ? (
        <CheckCircle2 className="size-4 shrink-0" aria-hidden />
      ) : (
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
      )}
      <span>{text}</span>
      <Button
        size="icon-sm"
        variant="ghost"
        className="ml-auto"
        onClick={close}
        aria-label={t('update.dismiss')}
      >
        <X aria-hidden />
      </Button>
    </div>
  );
}
