import type { NotificationMessage } from '@back-in-stock/plugin-sdk';

/** Telegram limits: 4096 characters for a message, 1024 for a photo caption. */
export const MESSAGE_LIMIT = 4096;
export const CAPTION_LIMIT = 1024;

export function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttribute(text: string): string {
  return escapeHtml(text).replaceAll('"', '&quot;');
}

/**
 * Renders the message as Telegram HTML (simpler to escape safely than MarkdownV2):
 * bold title, text, then the link. The text is shortened first so the link always fits.
 */
export function formatMessage(message: NotificationMessage, limit = MESSAGE_LIMIT): string {
  const title = `<b>${escapeHtml(message.title)}</b>`;
  const link = message.url
    ? `<a href="${escapeAttribute(message.url)}">${escapeHtml(message.url)}</a>`
    : '';
  const fixed = [title, link].filter(Boolean).join('\n\n').length + 2;
  let text = message.text;
  const room = limit - fixed;
  if (escapeHtml(text).length > room) {
    // Cut the raw text, not the escaped one, to never split an HTML entity.
    text = text.slice(0, Math.max(room, 0));
    while (text.length > 0 && escapeHtml(text).length + 1 > room) text = text.slice(0, -1);
    text = `${text.trimEnd()}…`;
  }
  return [title, escapeHtml(text), link].filter(Boolean).join('\n\n');
}
