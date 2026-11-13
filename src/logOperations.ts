import type { Block } from './core.ts';
export const PAGE_SIZE = 1000;
export function mergeConsecutive(blocks: Block[], selectedIds?: Set<string>): Block[] {
  const result: Block[] = [];
  for (const block of blocks) {
    const previous = result.at(-1);
    const inSelection =
      !selectedIds ||
      (!!previous && selectedIds.has(previous.id) && selectedIds.has(block.id));
    const same =
      previous &&
      inSelection &&
      (previous.sourceType || 'normal') === (block.sourceType || 'normal') &&
      previous.speaker === block.speaker &&
      (previous.channel ?? '') === (block.channel ?? '');
    if (same) {
      result[result.length - 1] = {
        ...previous,
        text: previous.text + '\n' + block.text,
        diceResult: [previous.diceResult, block.diceResult].filter(Boolean).join('\n'),
      };
    } else result.push({ ...block });
  }
  return result;
}
