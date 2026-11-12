---
sidebar_position: 4
title: Test a plugin
---

# Test a plugin

The app can test its plugins live, from the UI or the API. Nothing is saved: no watch is created and no state changes.

| Plugin kind | What the test does                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source      | Fetches and reads a page exactly like a real check (`checkProduct` or `checkListing`), then shows the result: status, title, price, or the items found. |
| Notifier    | Sends a test notification to **every channel** configured with this notifier.                                                                           |

## From the UI

- **Sources**: the **Supported sites** card of the **Settings** page lists the loaded source plugins. **Test** on a row tests only that site: you can type a URL and pick the watch type, and that page is read instead of the example pages. **Test all sites** runs every test at once and shows a summary (passed, failed, skipped).
- **Notifiers**: on the **Channels** page, each channel has a **Send a test** button. **Customize the test message** lets you send text only, a link, a picture… to check how that channel renders it.

A test is **skipped** when there is nothing to test: a source without example pages (and no URL typed). Each test is cut off after 30 seconds.

## Give a source example pages

For a source to be tested without a typed URL (the **Test** button or "Test all sites"), declare one or more example pages with `testTargets`:

```ts
export default defineSourcePlugin({
  id: 'example',
  // …
  supports: ['product', 'listing'],
  testTargets: [
    { url: 'https://example.com/refurbished', type: 'listing', label: 'Refurbished' },
    { url: 'https://example.com/p/gt-wheel', type: 'product', config: { variant: 'EU' } },
  ],
});
```

- `url`: a stable `http(s)` page (a category, a product that stays online for a long time).
- `type`: `product` or `listing`. It must be in `supports`, otherwise the plugin is rejected at load time.
- `config` (optional): the plugin options for this page, validated by `configSchema`.
- `label` (optional): the name shown in the UI. Defaults to the URL.

These tests hit the **real site**. They complement fixture tests, they do not replace them: a site can change or block you, fixtures stay stable.

## Test a notifier

Nothing to add: the test reuses what a channel's "Send a test" button already does. If your notifier defines `test(ctx)`, it is called. Otherwise the core calls `send(ctx, message)` with a translated test message (`event: 'Test'`). The channel config is validated by `configSchema` first.

### Customize the test message

On a notifier row, pick the message to send to check how your channel renders it:

| Preset              | What is sent                                                    |
| ------------------- | --------------------------------------------------------------- |
| Standard test       | The plugin test (`test()` if any, else the translated message). |
| Text only           | A title and a text.                                             |
| Text + link         | A title, a text and a link.                                     |
| Text + link + image | A title, a text, a link and an image.                           |
| Link only, no image | A title and a link, without text or image.                      |

Every field (title, text, link, image URL) can be edited, and an empty field is left out (an empty title uses the default title). A custom message always goes through `send()`, so through the notifier's real rendering. If the notifier has several channels, you can test only one.

## From the API

```http
POST /api/plugins/test                  # every plugin, optional body { "kind": "source" | "notifier" }
POST /api/plugins/sources/:id/test      # optional body { "url", "type", "config" }
POST /api/plugins/notifiers/:id/test    # optional body { "channelId", "locale", "message": { "title", "text", "url", "imageUrl" } }
```

Each route answers `{ results: [...] }`, with one result per page or per channel:

```json
{
  "kind": "source",
  "pluginId": "example",
  "status": "passed",
  "target": { "label": "Refurbished", "url": "https://example.com/refurbished", "type": "listing" },
  "durationMs": 812,
  "output": { "type": "listing", "itemCount": 42, "complete": true, "items": ["… first 20 items"] }
}
```

`status` is `passed`, `failed` (with `error.message`, and `error.kind` for a `SourceError`) or `skipped` (with `skipReason`: `no-test-target` or `no-channel`). An invalid URL or an unsupported type gives a 400 error, an unknown plugin a 404.
