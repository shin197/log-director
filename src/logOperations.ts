import type { Block } from './core.ts';
import type { MergeSeparatorMode } from './presentation.ts';

export const PAGE_SIZE = 1000;

export function resolveMergeSeparator(mode?: MergeSeparatorMode): string {
  if (mode === 'doubleNewline') return '\n\n';
  if (mode === 'space') return ' ';
  return '\n';
}

export function mergeConsecutive(
  blocks: Block[],
  selectedIds?: Set<string>,
  separator = '\n',
  mergeDifferentFaces = false,
): Block[] {
  const result: Block[] = [];
  for (const block of blocks) {
    const previous = result.at(-1);
    const inSelection =
      !selectedIds ||
      (!!previous && selectedIds.has(previous.id) && selectedIds.has(block.id));
    const sameFace =
      mergeDifferentFaces || (previous?.iconUrl ?? '') === (block.iconUrl ?? '');
    const same =
      previous &&
      inSelection &&
      !previous.diceResult.trim() &&
      (previous.sourceType || 'normal') === (block.sourceType || 'normal') &&
      previous.speaker === block.speaker &&
      (previous.channel ?? '') === (block.channel ?? '') &&
      sameFace;
    if (same) {
      result[result.length - 1] = {
        ...previous,
        text: previous.text + separator + block.text,
        diceResult: [previous.diceResult, block.diceResult].filter(Boolean).join('\n'),
      };
    } else result.push({ ...block });
  }
  return result;
}
