import { describe, expect, it } from 'vitest';
import { sentence } from './text.ts';

describe('sentence', () => {
  it.each([
    ["unknown command 'docter'", "Unknown command 'docter'."],
    ['Already a sentence.', 'Already a sentence.'],
    ['is it a question?', 'Is it a question?'],
    ['  padded  ', 'Padded.'],
  ])('formats %j as %j', (fragment, expected) => {
    expect(sentence(fragment)).toBe(expected);
  });
});
