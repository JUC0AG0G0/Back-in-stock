import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Button } from '@/components/ui/button';
import { UpdateBanner } from '@/features/update/update-banner';

interface Health {
  status: 'ok';
  version: string;
}

async function fetchHealth(): Promise<Health> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Health;
}

// Placeholder screen for M0: proves the SPA builds, is translated and can reach the API.
export function App() {
  const { t } = useTranslation();
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false });

  return (
    <>
      <UpdateBanner />
      {/* Below the update banner, not on top of it. */}
      <div className="relative">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>
      </div>
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 p-6 text-center">
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
      </main>
    </>
  );
}
