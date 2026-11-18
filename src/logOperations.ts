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
  mergeIgnoreOtherChannels = false,
): Block[] {
  const result: Block[] = [];
  const lastIndexByChannel = new Map<string, number>();

  for (const block of blocks) {
    const channelKey = block.channel ?? '';
    const targetIdx = mergeIgnoreOtherChannels
      ? (lastIndexByChannel.get(channelKey) ?? -1)
      : result.length - 1;
    const previous = targetIdx >= 0 ? result[targetIdx] : undefined;

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
      (previous.channel ?? '') === channelKey &&
      sameFace;
    if (same && targetIdx >= 0) {
      result[targetIdx] = {
        ...previous,
        text: previous.text + separator + block.text,
        diceResult: [previous.diceResult, block.diceResult].filter(Boolean).join('\n'),
      };
    } else {
      lastIndexByChannel.set(channelKey, result.length);
      result.push({ ...block });
    }
  }
  return result;
}
