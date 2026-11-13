import type { Block } from './core.ts';
import { asSystemMessage } from './systemCharacter.ts';
export function wrapSelection(text: string, start: number, end: number, key: string) {
  const pairs: Record<string, string> = {
    '"': '"',
    "'": "'",
    '(': ')',
    '[': ']',
    '{': '}',
  };
  if (start === end || !pairs[key]) return null;
  return {
    text:
      text.slice(0, start) + key + text.slice(start, end) + pairs[key] + text.slice(end),
    start: start + 1,
    end: end + 1,
  };
}
export function applyBulkEdit(
  blocks: Block[],
  ids: Set<string>,
  source: Block,
  next: Block,
  forced: (keyof Block)[] = [],
): Block[] {
  const keys = [
    'characterId',
    'speaker',
    'color',
    'iconUrl',
    'sourceType',
    'channel',
    'timestamp',
    'diceResult',
  ] as const;
  const patch: Partial<Block> = {};
  for (const key of keys)
    if (forced.includes(key) || source[key] !== next[key])
      (patch as Record<string, unknown>)[key] = next[key];
  return blocks.map((b) => {
    if (!ids.has(b.id)) return b;
    let result = { ...b, ...patch, ...(b.id === source.id ? { text: next.text } : {}) };
    if (result.sourceType === 'system') result = asSystemMessage(result);
    return result;
  });
}
