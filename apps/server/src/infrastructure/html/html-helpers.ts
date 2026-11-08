import type { HtmlHelpers } from '@back-in-stock/plugin-sdk';

const JSON_LD_SCRIPT =
  /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;

/** HTML helpers handed to source plugins (SPEC §4). Dependency-free for now. */
export const htmlHelpers: HtmlHelpers = {
  extractJsonLd(html) {
    const blocks: unknown[] = [];
    for (const match of html.matchAll(JSON_LD_SCRIPT)) {
      const content = match[1]?.trim();
      if (!content) continue;
      try {
        blocks.push(JSON.parse(content));
      } catch {
        // Invalid blocks are skipped, as the SDK contract says.
      }
    }
    return blocks;
  },
};
