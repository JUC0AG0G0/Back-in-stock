import type { TestMessageContent } from '@/lib/plugin-tests-api';

/** Example link and picture for the presets. Both are public so any channel can fetch them. */
export const SAMPLE_LINK = 'https://github.com/JUC0AG0G0/Back-in-stock';
export const SAMPLE_IMAGE = 'https://placehold.co/600x400/png?text=Back+in+stock+!';

export type MessagePreset = 'default' | 'text' | 'textLink' | 'textLinkImage' | 'linkOnly';

export const MESSAGE_PRESETS: readonly MessagePreset[] = [
  'default',
  'text',
  'textLink',
  'textLinkImage',
  'linkOnly',
];

export interface NotifierTestOptions {
  preset: MessagePreset;
  message: Required<TestMessageContent>;
}

export function presetMessage(
  preset: MessagePreset,
  sample: { title: string; text: string },
): Required<TestMessageContent> {
  const empty = { title: '', text: '', url: '', imageUrl: '' };
  switch (preset) {
    case 'default':
      return empty;
    case 'text':
      return { ...empty, ...sample };
    case 'textLink':
      return { ...empty, ...sample, url: SAMPLE_LINK };
    case 'textLinkImage':
      return { ...sample, url: SAMPLE_LINK, imageUrl: SAMPLE_IMAGE };
    case 'linkOnly':
      return { ...empty, title: sample.title, url: SAMPLE_LINK };
  }
}
