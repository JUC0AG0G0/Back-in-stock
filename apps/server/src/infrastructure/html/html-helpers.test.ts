import { describe, expect, it } from 'vitest';
import { htmlHelpers } from './html-helpers.js';

describe('extractJsonLd', () => {
  it('parses every JSON-LD block and skips invalid ones', () => {
    const html = `
      <script type="application/ld+json">{"@type":"Product","name":"Wheel"}</script>
      <script type='application/ld+json'>{ invalid</script>
      <script>{"not":"json-ld"}</script>
      <SCRIPT TYPE="application/ld+json" data-x="1">[{"@type":"Offer"}]</SCRIPT>`;

    expect(htmlHelpers.extractJsonLd(html)).toEqual([
      { '@type': 'Product', name: 'Wheel' },
      [{ '@type': 'Offer' }],
    ]);
  });
});
