import { describe, it, expect } from 'vitest';
import { QTYPE_META, QTYPE_GROUPS, createQuestion } from '../../constants/questionTypes';

describe('visual question types', () => {
  it('registers the four visual types in a Visual group', () => {
    expect(QTYPE_GROUPS).toContain('Visual');
    for (const type of ['emoji_rating', 'image_choice', 'image_upload', 'annotation']) {
      expect(QTYPE_META[type as keyof typeof QTYPE_META]).toBeDefined();
      expect(QTYPE_META[type as keyof typeof QTYPE_META].group).toBe('Visual');
    }
  });

  it('createQuestion produces sensible defaults for emoji_rating', () => {
    const q = createQuestion('emoji_rating') as { type: string; emojiSet?: string[] };
    expect(q.type).toBe('emoji_rating');
    expect(Array.isArray(q.emojiSet)).toBe(true);
    expect(q.emojiSet!.length).toBe(5);
  });

  it('createQuestion image_upload defaults to privacy-safe (blur faces + consent)', () => {
    const q = createQuestion('image_upload') as { blurFaces?: boolean; requireConsent?: boolean };
    expect(q.blurFaces).toBe(true);
    expect(q.requireConsent).toBe(true);
  });
});
