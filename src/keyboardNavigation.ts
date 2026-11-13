import type { Block } from './core.ts';
export type NavigationKey =
  'ArrowUp' | 'ArrowDown' | 'Home' | 'End' | 'PageUp' | 'PageDown';
export function navigateMessages(
  order: string[],
  cursor: string | null,
  selected: Set<string>,
  key: NavigationKey,
  extend: boolean,
) {
  if (!order.length) return null;
  const previous = order.indexOf(cursor ?? '');
  const delta =
    key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : key === 'PageUp' ? -10 : 10;
  const index =
    key === 'Home'
      ? 0
      : key === 'End'
        ? order.length - 1
        : Math.max(0, Math.min(order.length - 1, previous < 0 ? 0 : previous + delta));
  const id = order[index];
  return {
    id,
    index,
    direction: key === 'Home' || key === 'ArrowUp' || key === 'PageUp' ? -1 : 1,
    selected: extend ? new Set([...selected, id]) : new Set([id]),
  };
}
export function swapMessage(blocks: Block[], id: string, delta: number): Block[] {
  const i = blocks.findIndex((b) => b.id === id),
    j = i + delta;
  if (i < 0 || j < 0 || j >= blocks.length) return blocks;
  const result = [...blocks];
  [result[i], result[j]] = [result[j], result[i]];
  return result;
}
