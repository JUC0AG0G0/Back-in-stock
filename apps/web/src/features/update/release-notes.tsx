import type { Components } from 'react-markdown';
import Markdown from 'react-markdown';

// No typography plugin: give the few elements release-please writes a readable style.
// Raw HTML in the notes is not rendered (react-markdown's default), only Markdown.
const components: Components = {
  h1: ({ children }) => <h4 className="mt-4 font-semibold">{children}</h4>,
  h2: ({ children }) => <h4 className="mt-4 font-semibold">{children}</h4>,
  h3: ({ children }) => <h5 className="mt-3 text-sm font-semibold">{children}</h5>,
  p: ({ children }) => <p className="mt-2 text-sm">{children}</p>,
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{children}</ol>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-xs [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
};

export function ReleaseNotes({ markdown }: { markdown: string }) {
  return <Markdown components={components}>{markdown}</Markdown>;
}
