/** Formats a fragment as a sentence: a capital first letter and closing punctuation. */
export const sentence = (fragment: string): string => {
  const text = fragment.trim();
  const capitalised = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
};
