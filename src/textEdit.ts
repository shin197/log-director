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
 * Inserts an opening and closing pair at cursor and moves cursor inside.
 */
export function autoClosePair(
  text: string,
  cursor: number,
  key: string,
): { text: string; cursor: number } | null {
  const pair = WRAP_PAIRS[key];
  if (!pair) return null;
  // 작은따옴표(')가 영문 단어 중간(apostrophe, don't 등)에 쓰일 때는 자동 닫기 제외
  if (key === "'" && cursor > 0 && /[a-zA-Z0-9가-힣]/.test(text[cursor - 1])) {
    return null;
  }
  const [open, close] = pair;
  const next = text.slice(0, cursor) + open + close + text.slice(cursor);
  return {
    text: next,
    cursor: cursor + open.length,
  };
}

/**
 * Returns true if key is a closing character and cursor is currently sitting right before it.
 */
export function shouldSkipCloseChar(
  text: string,
  cursor: number,
  key: string,
): boolean {
  const isClosingChar = Object.values(WRAP_PAIRS).some(([, close]) => close === key);
  if (!isClosingChar) return false;
  return cursor < text.length && text[cursor] === key;
}

/**
 * Deletes both opening and closing character when backspacing between an empty pair (e.g. () or "").
 */
export function deletePairOnBackspace(
  text: string,
  cursor: number,
): { text: string; cursor: number } | null {
  if (cursor <= 0 || cursor >= text.length) return null;
  const prevChar = text[cursor - 1];
  const nextChar = text[cursor];
  const pair = WRAP_PAIRS[prevChar];
  if (pair && pair[1] === nextChar) {
    const next = text.slice(0, cursor - 1) + text.slice(cursor + 1);
    return {
      text: next,
      cursor: cursor - 1,
    };
  }
  return null;
}

/**
 * Keyboard handler for <textarea> elements to wrap selections and auto-close quotes/brackets.
 */
export function handleWrapKeyDown(
  e: KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  onChange: (next: string) => void,
  enabled = true,
): boolean {
  if (!enabled || e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing)
    return false;

  const el = e.currentTarget;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;

  // 1) 텍스트가 선택되어 있을 때: 선택 영역 감싸기
  if (start !== end) {
    const result = wrapSelectedText(value, start, end, e.key);
    if (!result) return false;
    e.preventDefault();
    onChange(result.text);
    requestAnimationFrame(() => {
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
    return true;
  }

  // 2) 백스페이스로 빈 괄호/따옴표 쌍 삭제
  if (e.key === 'Backspace') {
    const deleted = deletePairOnBackspace(value, start);
    if (deleted) {
      e.preventDefault();
      onChange(deleted.text);
      requestAnimationFrame(() => {
        el.setSelectionRange(deleted.cursor, deleted.cursor);
      });
      return true;
    }
    return false;
  }

  // 3) 닫힘 문자 입력 시 커서 바로 다음이 해당 닫힘 문자면 건너뛰기
  if (shouldSkipCloseChar(value, start, e.key)) {
    e.preventDefault();
    requestAnimationFrame(() => {
      el.setSelectionRange(start + 1, start + 1);
    });
    return true;
  }

  // 4) 열림 문자 입력 시: 자동 닫힘 문자 삽입 후 커서를 안으로 이동
  const closed = autoClosePair(value, start, e.key);
  if (closed) {
    e.preventDefault();
    onChange(closed.text);
    requestAnimationFrame(() => {
      el.setSelectionRange(closed.cursor, closed.cursor);
    });
    return true;
  }

  return false;
}
