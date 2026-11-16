import type { Block, Character, Project } from './core.ts';
import { inheritCharacter } from './characters.ts';
import { SYSTEM_CHARACTER_ID } from './systemCharacter.ts';

export type SpeakerAction =
  | null
  | { type: 'character'; character: Character }
  | { type: 'unlink' }
  | { type: 'custom'; speaker: string };

export type BulkEditState = {
  repId: string;
  selectedIds: Set<string>;
  textPrefix: string;
  textSuffix: string;
  replaceFind: string;
  replaceTo: string;
  speakerAction: SpeakerAction;
  color?: string;
  iconUrl?: string;
  channel?: string;
  timestamp?: string;
  diceMode: 'unchanged' | 'remove' | 'set';
  diceResult: string;
  styleOps?: Record<string, 'add' | 'remove'>;
};

export type BulkStyleTriState = 'checked' | 'unchecked' | 'mixed';

/**
 * 선택된 메시지들의 기존 styleIds와 현재 일괄 편집 연산(styleOps)을 바탕으로
 * 특정 스타일 카드의 체크박스 표시 상태('checked' | 'unchecked' | 'mixed')를 반환합니다.
 */
export function getBulkStyleCheckboxState(
  cardId: string,
  targetBlocks: Block[],
  styleOps?: Record<string, 'add' | 'remove'>,
): BulkStyleTriState {
  const op = styleOps?.[cardId];
  if (op === 'add') return 'checked';
  if (op === 'remove') return 'unchecked';
  if (targetBlocks.length === 0) return 'unchecked';
  let hasCount = 0;
  for (const b of targetBlocks) {
    if (b.styleIds?.includes(cardId)) hasCount += 1;
  }
  if (hasCount === 0) return 'unchecked';
  if (hasCount === targetBlocks.length) return 'checked';
  return 'mixed';
}

/**
 * 일괄 편집에서 스타일 카드 체크박스를 클릭했을 때 다음 styleOps 상태를 계산합니다.
 * - 모두 미포함: 해제 <-> 일괄 추가('add')
 * - 모두 포함: 유지 <-> 일괄 해제('remove')
 * - 일부 포함(mixed): 유지(mixed) -> 일괄 추가('add') -> 일괄 해제('remove') -> 유지(mixed)
 */
export function toggleBulkStyleOp(
  cardId: string,
  targetBlocks: Block[],
  styleOps?: Record<string, 'add' | 'remove'>,
): Record<string, 'add' | 'remove'> | undefined {
  const next = { ...(styleOps ?? {}) };
  const curOp = next[cardId];
  let hasCount = 0;
  for (const b of targetBlocks) {
    if (b.styleIds?.includes(cardId)) hasCount += 1;
  }
  const isMixed = hasCount > 0 && hasCount < targetBlocks.length;
  const allHave = targetBlocks.length > 0 && hasCount === targetBlocks.length;

  if (isMixed) {
    if (!curOp) next[cardId] = 'add';
    else if (curOp === 'add') next[cardId] = 'remove';
    else delete next[cardId];
  } else if (allHave) {
    if (curOp === 'remove') delete next[cardId];
    else next[cardId] = 'remove';
  } else {
    if (curOp === 'add') delete next[cardId];
    else next[cardId] = 'add';
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function createBulkEditState(
  repId: string,
  selectedIds: Set<string>,
  repBlock: Block,
): BulkEditState {
  return {
    repId,
    selectedIds: new Set(selectedIds),
    textPrefix: '',
    textSuffix: '',
    replaceFind: '',
    replaceTo: '',
    speakerAction: null,
    diceMode: 'unchanged',
    diceResult: repBlock.diceResult,
  };
}

/**
 * Picks the representative message for bulk editing:
 * the cursor message if it is selected and visible; otherwise the topmost selected message.
 */
export function pickRepresentativeId(
  blocks: Block[],
  visible: Block[],
  selected: Set<string>,
  cursorId: string | null,
): string | null {
  if (!selected.size) return null;
  if (cursorId && selected.has(cursorId) && visible.some((b) => b.id === cursorId))
    return cursorId;
  const firstVisible = visible.find((b) => selected.has(b.id));
  if (firstVisible) return firstVisible.id;
  if (cursorId && selected.has(cursorId) && blocks.some((b) => b.id === cursorId))
    return cursorId;
  return blocks.find((b) => selected.has(b.id))?.id ?? null;
}

/**
 * Returns the shared non-system Character if all bulk-selected messages resolve to the same character,
 * allowing face changes; otherwise returns undefined.
 */
export function getBulkFaceCharacter(
  blocks: Block[],
  bulk: BulkEditState,
  characters: Character[],
): Character | undefined {
  if (bulk.speakerAction) {
    if (bulk.speakerAction.type !== 'character') return undefined;
    const c = bulk.speakerAction.character;
    return c.id === SYSTEM_CHARACTER_ID ? undefined : c;
  }
  const targets = blocks.filter((b) => bulk.selectedIds.has(b.id));
  if (!targets.length) return undefined;
  const firstId = targets[0].characterId;
  if (!firstId || firstId === SYSTEM_CHARACTER_ID) return undefined;
  if (targets.every((b) => b.characterId === firstId && b.sourceType !== 'system')) {
    return characters.find((c) => c.id === firstId);
  }
  return undefined;
}

/**
 * Applies replace within the original text block and wraps it with prefix/suffix.
 */
export function applyBulkReplacedText(text: string, find: string, to: string): string {
  return find ? text.split(find).join(to) : text;
}

export function applyBulkTextTransform(text: string, bulk: BulkEditState): string {
  const inner = applyBulkReplacedText(text, bulk.replaceFind, bulk.replaceTo);
  return bulk.textPrefix + inner + bulk.textSuffix;
}

export function applyBulkPatch(block: Block, bulk: BulkEditState): Block {
  let next: Block = block;

  if (bulk.speakerAction) {
    if (bulk.speakerAction.type === 'character') {
      next = inheritCharacter(next, bulk.speakerAction.character);
    } else if (bulk.speakerAction.type === 'unlink') {
      next = {
        ...next,
        characterId: null,
        sourceType: 'normal',
        ...(next.sourceType === 'system' ? { speaker: next.speaker ?? '시스템' } : {}),
      };
    } else {
      next = {
        ...next,
        characterId: null,
        sourceType: 'normal',
        speaker: bulk.speakerAction.speaker,
      };
    }
  }

  if (bulk.color !== undefined && next.sourceType !== 'system') {
    next = { ...next, color: bulk.color };
  }
  if (bulk.iconUrl !== undefined && next.sourceType !== 'system') {
    next = { ...next, iconUrl: bulk.iconUrl };
  }
  if (bulk.channel !== undefined) {
    next = { ...next, channel: bulk.channel };
  }
  if (bulk.timestamp !== undefined) {
    next = { ...next, timestamp: bulk.timestamp };
  }

  if (bulk.diceMode === 'remove') {
    next = { ...next, diceResult: '' };
  } else if (bulk.diceMode === 'set') {
    next = { ...next, diceResult: bulk.diceResult };
  }

  if (bulk.textPrefix || bulk.textSuffix || bulk.replaceFind) {
    next = { ...next, text: applyBulkTextTransform(next.text, bulk) };
  }

  if (bulk.styleOps && Object.keys(bulk.styleOps).length > 0) {
    const currentSet = new Set(next.styleIds ?? []);
    let changed = false;
    for (const [styleId, op] of Object.entries(bulk.styleOps)) {
      if (op === 'add' && !currentSet.has(styleId)) {
        currentSet.add(styleId);
        changed = true;
      } else if (op === 'remove' && currentSet.has(styleId)) {
        currentSet.delete(styleId);
        changed = true;
      }
    }
    if (changed) {
      const nextIds = [...currentSet];
      if (nextIds.length > 0) {
        next = { ...next, styleIds: nextIds };
      } else {
        const copy = { ...next };
        delete copy.styleIds;
        next = copy;
      }
    }
  }

  return next;
}

export function applyBulkEditToProject(project: Project, bulk: BulkEditState): Project {
  return {
    ...project,
    blocks: project.blocks.map((b) =>
      bulk.selectedIds.has(b.id) ? applyBulkPatch(b, bulk) : b,
    ),
  };
}
