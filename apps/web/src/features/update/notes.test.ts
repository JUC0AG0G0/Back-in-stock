import { describe, expect, it } from 'vitest';
import { withoutInstallSections } from './notes';

const RELEASE = `## [0.4.0](https://github.com/o/r/compare/v0.3.0...v0.4.0) (2026-11-08)


### ✨ Nouveautés

* **settings:** page Paramètres

## 🚀 Installation

macOS / Linux :

\`\`\`bash
curl -fsSL https://github.com/o/r/releases/latest/download/install.sh | sh
\`\`\`

## 🐳 Image Docker

\`\`\`bash
docker pull ghcr.io/o/r:0.4.0
\`\`\`

amd64 et arm64.
`;

describe('withoutInstallSections', () => {
  it('drops the install and Docker sections the release workflow appends', () => {
    const notes = withoutInstallSections(RELEASE);
    expect(notes).toContain('page Paramètres');
    expect(notes).not.toMatch(/Installation|install\.sh|docker pull|amd64/);
  });

  it('keeps a section that follows an install section', () => {
    const notes = withoutInstallSections(`${RELEASE}\n## Notes\n\nÀ lire.`);
    expect(notes).toContain('## Notes\n\nÀ lire.');
    expect(notes).not.toContain('docker pull');
  });

  it('ignores headings inside code blocks', () => {
    const md = '### Fix\n\n```md\n## Installation\n```\n\nfin';
    expect(withoutInstallSections(md)).toBe(md);
  });

  it('leaves notes without install sections untouched', () => {
    expect(withoutInstallSections('### 🐛 Corrections\n\n* x')).toBe('### 🐛 Corrections\n\n* x');
  });
});
