// JSON schemas of the plugin test routes (see schemas.ts for why responses have schemas).

const price = {
  type: 'object',
  required: ['amountCents', 'currency'],
  properties: { amountCents: { type: 'integer' }, currency: { type: 'string' } },
} as const;

const listingItem = {
  type: 'object',
  required: ['id', 'title', 'url'],
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    url: { type: 'string' },
    price,
    imageUrl: { type: 'string' },
    attributes: { type: 'object', additionalProperties: { type: ['string', 'number', 'boolean'] } },
  },
} as const;

const result = {
  type: 'object',
  required: ['kind', 'pluginId', 'status', 'durationMs'],
  properties: {
    kind: { type: 'string', enum: ['source', 'notifier'] },
    pluginId: { type: 'string', examples: ['fanatec'] },
    status: { type: 'string', enum: ['passed', 'failed', 'skipped'] },
    target: {
      type: 'object',
      required: ['label'],
      description: 'A page for a source, a saved channel for a notifier.',
      properties: {
        label: { type: 'string' },
        url: { type: 'string' },
        type: { type: 'string', enum: ['product', 'listing'] },
        channelId: { type: 'string' },
      },
    },
    durationMs: { type: 'number' },
    skipReason: { type: 'string', enum: ['no-test-target', 'no-channel'] },
    output: {
      type: 'object',
      description: 'What a source read. Product: the snapshot. Listing: count and first items.',
      required: ['type'],
      properties: {
        type: { type: 'string', enum: ['product', 'listing'] },
        product: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['IN_STOCK', 'OUT_OF_STOCK', 'PREORDER', 'UNKNOWN'] },
            title: { type: 'string' },
            price,
            regularPrice: { ...price, description: 'Price before discount, when on sale.' },
            imageUrl: { type: 'string' },
            variant: { type: 'string' },
            signal: { type: 'string' },
          },
        },
        itemCount: { type: 'integer' },
        complete: { type: 'boolean' },
        items: { type: 'array', items: listingItem },
      },
    },
    error: {
      type: 'object',
      required: ['message'],
      properties: {
        message: { type: 'string' },
        kind: { type: 'string', examples: ['blocked'] },
      },
    },
  },
} as const;

const results = {
  200: {
    type: 'object',
    required: ['results'],
    properties: { results: { type: 'array', items: result } },
  },
} as const;

const errorResponse = {
  type: 'object',
  required: ['error'],
  properties: { error: { type: 'string' } },
} as const;

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' } },
} as const;

export const testAllPluginsSchema = {
  tags: ['plugins'],
  summary: 'Test every plugin',
  description:
    'Sources read their example pages (testTargets), notifiers send a test notification to each of their channels. Nothing is saved.',
  body: {
    type: ['object', 'null'],
    properties: { kind: { type: 'string', enum: ['source', 'notifier'] } },
    additionalProperties: false,
  },
  response: results,
} as const;

export const testSourcePluginSchema = {
  tags: ['plugins'],
  summary: 'Test one source plugin',
  description:
    'Fetches and parses a page like a check, without saving. Without url, the plugin example pages are used.',
  params: idParams,
  body: {
    type: ['object', 'null'],
    properties: {
      url: { type: 'string', examples: ['https://shop.example/products/wheel'] },
      type: { type: 'string', enum: ['product', 'listing'] },
      config: {},
    },
    additionalProperties: false,
  },
  response: { ...results, 400: errorResponse, 404: errorResponse },
} as const;

export const testNotifierPluginSchema = {
  tags: ['plugins'],
  summary: 'Test one notifier plugin',
  description:
    'Sends a test notification to every saved channel of this notifier, or to one channel. With message, a custom message is sent through send(): use it to check how a link, an image, or a link without image is rendered.',
  params: idParams,
  body: {
    type: ['object', 'null'],
    properties: {
      channelId: { type: 'string' },
      locale: { type: 'string', examples: ['fr'] },
      message: {
        type: 'object',
        properties: {
          title: { type: 'string', maxLength: 500 },
          text: { type: 'string', maxLength: 4000 },
          url: { type: 'string', examples: ['https://shop.example/products/wheel'] },
          imageUrl: { type: 'string', examples: ['https://shop.example/wheel.jpg'] },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  response: { ...results, 400: errorResponse, 404: errorResponse },
} as const;
