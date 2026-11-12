import { describe, expect, it } from 'vitest';
import { newChannelIssueUrl, newSiteIssueUrl } from './issues';

describe('newSiteIssueUrl', () => {
  it('opens the new-site form without fields when no link is given', () => {
    expect(newSiteIssueUrl()).toBe(
      'https://github.com/JUC0AG0G0/Back-in-stock/issues/new?template=new-site.yml',
    );
  });

  it('fills in the title, the shop and the example URL from the pasted link', () => {
    const url = new URL(newSiteIssueUrl('https://www.fanatec.com/eu/fr/p/abc?x=1&y=2'));
    expect(url.searchParams.get('template')).toBe('new-site.yml');
    expect(url.searchParams.get('title')).toBe('[Site] fanatec.com');
    expect(url.searchParams.get('shop')).toBe('fanatec.com');
    expect(url.searchParams.get('urls')).toBe('https://www.fanatec.com/eu/fr/p/abc?x=1&y=2');
  });

  it('ignores a link that is not a URL', () => {
    expect(newSiteIssueUrl('not a url')).toBe(newSiteIssueUrl());
  });
});

describe('newChannelIssueUrl', () => {
  it('opens the new-notifier form', () => {
    expect(newChannelIssueUrl()).toBe(
      'https://github.com/JUC0AG0G0/Back-in-stock/issues/new?template=new-notifier.yml',
    );
  });
});
