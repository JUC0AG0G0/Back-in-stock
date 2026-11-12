/** Links that open a pre-filled GitHub issue form (.github/ISSUE_TEMPLATE). */

export const REPO_URL = 'https://github.com/JUC0AG0G0/Back-in-stock';

function issueFormUrl(template: string, fields: Record<string, string | undefined>): string {
  const params = new URLSearchParams({ template });
  for (const [id, value] of Object.entries(fields)) {
    if (value !== undefined && value !== '') params.set(id, value);
  }
  return `${REPO_URL}/issues/new?${params.toString()}`;
}

/**
 * Issue asking for a source plugin for a new site. Given the link the user pasted, the
 * shop's hostname and the example URL are filled in (field ids of new-site.yml).
 */
export function newSiteIssueUrl(link?: string): string {
  let hostname: string | undefined;
  if (link !== undefined) {
    try {
      hostname = new URL(link).hostname.replace(/^www\./, '');
    } catch {
      link = undefined;
    }
  }
  return issueFormUrl('new-site.yml', {
    title: hostname && `[Site] ${hostname}`,
    shop: hostname,
    urls: link,
  });
}

/** Issue asking for a notifier plugin for a new notification channel (new-notifier.yml). */
export function newChannelIssueUrl(): string {
  return issueFormUrl('new-notifier.yml', {});
}
