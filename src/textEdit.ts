import type { KeyboardEvent } from 'react';

const WRAP_PAIRS: Record<string, readonly [string, string]> = {
  '"': ['"', '"'],
  "'": ["'", "'"],
  '(': ['(', ')'],
  '[': ['[', ']'],
  '{': ['{', '}'],
  '`': ['`', '`'],
  '「': ['「', '」'],
  '『': ['『', '』'],
  '【': ['【', '】'],
  '《': ['《', '》'],
  '〈': ['〈', '〉'],
};

export function getWrapPair(key: string): readonly [string, string] | undefined {
  return WRAP_PAIRS[key];
}

/**
 * Wraps the selected range [start, end) with matching quote/bracket pairs.
 * Returns null if there is no selection or the key is not a supported wrapper.
 */
export function wrapSelectedText(
  text: string,
  start: number,
  end: number,
  key: string,
): { text: string; selectionStart: number; selectionEnd: number } | null {
  if (start === end) return null;
  const pair = WRAP_PAIRS[key];
  if (!pair) return null;
  const [from, to] = start < end ? [start, end] : [end, start];
  const [open, close] = pair;
  const next = text.slice(0, from) + open + text.slice(from, to) + close + text.slice(to);
  return {
    text: next,
    selectionStart: from + open.length,
    selectionEnd: to + open.length,
  };
}

/**
 * Keyboard handler for <textarea> elements to wrap non-empty selections on quote/bracket input.
 */
export function handleWrapKeyDown(
  e: KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  onChange: (next: string) => void,
): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing) return false;
  const el = e.currentTarget;
  const result = wrapSelectedText(
    value,
    el.selectionStart ?? 0,
    el.selectionEnd ?? 0,
    e.key,
  );
  if (!result) return false;
  e.preventDefault();
  onChange(result.text);
  requestAnimationFrame(() => {
    el.setSelectionRange(result.selectionStart, result.selectionEnd);
  });
  return true;
}
