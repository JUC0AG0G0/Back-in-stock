import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';

interface Health {
  status: 'ok';
  version: string;
}

async function fetchHealth(): Promise<Health> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Health;
}

// Placeholder screen for M0: proves the SPA builds and can reach the API.
export function App() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false });

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Back in stock !</h1>
      <p className="text-muted-foreground">
        {health.isPending && 'Connexion au serveur…'}
        {health.isSuccess && `Serveur OK · v${health.data.version}`}
        {health.isError && 'Serveur injoignable'}
      </p>
      <Button onClick={() => void health.refetch()} disabled={health.isFetching}>
        Vérifier à nouveau
      </Button>
    </main>
  );
}
