import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Link2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AddWatchDialog } from './add-watch-dialog';
import { fetchWatches, type WatchView } from './api';
import { extractUrl } from './url';

const URL_KEYBOARD = 'url';
const PLAIN_TEXT = 'text/plain';

/** Home screen: paste a link to start watching it, and the watches already set up. */
export function HomePage() {
  const { t } = useTranslation();
  const inputId = useId();
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [pending, setPending] = useState<string>();
  const [created, setCreated] = useState<WatchView>();

  const open = (value: string) => {
    const url = extractUrl(value);
    setInvalid(url === undefined);
    if (url === undefined) return;
    setText(url);
    setCreated(undefined);
    setPending(url);
  };

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col items-center gap-4 pt-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight">{t('app.name')}</h1>
        <p className="text-muted-foreground">{t('app.tagline')}</p>
        <form
          className="flex w-full max-w-xl flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            open(text);
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            {t('watches.paste.label')}
          </label>
          <div className="relative flex-1">
            <Link2
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id={inputId}
              type="text"
              inputMode={URL_KEYBOARD}
              autoComplete="off"
              autoFocus
              className="h-10 pl-9"
              value={text}
              placeholder={t('watches.paste.placeholder')}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? `${inputId}-error` : undefined}
              onChange={(event) => {
                setText(event.target.value);
                setInvalid(false);
              }}
              // Pasting a link is enough: no need to press Enter.
              onPaste={(event) => {
                const pasted = event.clipboardData.getData(PLAIN_TEXT);
                if (extractUrl(pasted) === undefined) return;
                event.preventDefault();
                open(pasted);
              }}
            />
          </div>
          <Button type="submit" className="h-10">
            {t('watches.paste.submit')}
          </Button>
        </form>
        {invalid && (
          <p id={`${inputId}-error`} className="text-sm text-destructive">
            {t('watches.paste.invalid')}
          </p>
        )}
        {created && (
          <Alert className="max-w-xl text-left">
            <CheckCircle2 aria-hidden />
            <AlertDescription>{t('watches.add.created', { name: created.name })}</AlertDescription>
          </Alert>
        )}
      </section>

      <WatchList />

      <AddWatchDialog
        url={pending}
        onClose={() => setPending(undefined)}
        onCreated={(watch) => {
          setPending(undefined);
          setCreated(watch);
          setText('');
        }}
      />
    </div>
  );
}

function WatchList() {
  const { t } = useTranslation();
  const watches = useQuery({ queryKey: ['watches'], queryFn: fetchWatches });
  if (!watches.data || watches.data.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('watches.list.title')}</h2>
      <ul className="divide-y rounded-lg border">
        {watches.data.map((watch) => (
          <li key={watch.id} className="flex items-center gap-3 p-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{watch.name}</span>
              <a
                href={watch.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-1 text-sm text-muted-foreground hover:underline"
              >
                <span className="truncate">{watch.url}</span>
                <ExternalLink className="size-3 shrink-0" aria-hidden />
              </a>
            </div>
            <Badge variant="secondary">{t(`watches.type.${watch.type}.short`)}</Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
