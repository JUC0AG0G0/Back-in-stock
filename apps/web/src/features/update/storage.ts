/**
 * Small per-browser memory of the banner. Storage can be unavailable (private mode,
 * blocked site data): the banner then simply forgets.
 */
const DISMISSED = 'bis.update.dismissed';
const PENDING = 'bis.update.pending';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignored: see above
  }
}

/** "Later": hidden until a newer version than this one comes out. */
export const dismissedVersion = () => read(DISMISSED);
export const dismissVersion = (version: string) => write(DISMISSED, version);

/** Update started from this browser: after the reload, the result is shown once. */
export const pendingUpdate = () => read(PENDING);
export const setPendingUpdate = (version: string | null) => write(PENDING, version);
