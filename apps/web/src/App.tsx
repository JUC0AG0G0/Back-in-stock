import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Button } from '@/components/ui/button';
import { UpdateBanner } from '@/features/update/update-banner';
import { cn } from '@/lib/utils';
import { ChannelsPage } from '@/pages/channels-page';

interface Health {
  status: 'ok';
  version: string;
}

async function fetchHealth(): Promise<Health> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Health;
}

type Page = 'home' | 'channels';

/** Hash routing until the app gets TanStack Router with more screens. */
function usePage(): Page {
  const read = (): Page => (window.location.hash === '#/channels' ? 'channels' : 'home');
  const [page, setPage] = useState(read);
  useEffect(() => {
    const onChange = () => setPage(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return page;
}

export function App() {
  const { t } = useTranslation();
  const page = usePage();
  const links: Array<{ page: Page; href: string; label: string }> = [
    { page: 'home', href: '#/', label: t('nav.home') },
    { page: 'channels', href: '#/channels', label: t('nav.channels') },
  ];

  return (
    <div className="min-h-screen">
      <UpdateBanner />
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <nav className="flex items-center gap-4" aria-label={t('nav.label')}>
            <span className="font-bold">{t('app.name')}</span>
            {links.map((link) => (
              <a
                key={link.page}
                href={link.href}
                aria-current={page === link.page ? 'page' : undefined}
                className={cn(
                  'text-sm text-muted-foreground hover:text-foreground',
                  page === link.page && 'font-medium text-foreground',
                )}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        {page === 'channels' ? <ChannelsPage /> : <Home />}
      </main>
    </div>
  );
}

// Placeholder home screen: proves the SPA builds, is translated and can reach the API.
function Home() {
  const { t } = useTranslation();
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false });

  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight">{t('app.name')}</h1>
      <p>{t('app.tagline')}</p>
      <p className="text-muted-foreground">
        {health.isPending && t('app.health.checking')}
        {health.isSuccess && t('app.health.ok', { version: health.data.version })}
        {health.isError && t('app.health.error')}
      </p>
      <Button onClick={() => void health.refetch()} disabled={health.isFetching}>
        {t('app.health.retry')}
      </Button>
    </div>
  );
}
