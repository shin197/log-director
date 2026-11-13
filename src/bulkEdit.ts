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
  iconUrl?: string;
  channel?: string;
  timestamp?: string;
  diceMode: 'unchanged' | 'remove' | 'set';
  diceResult: string;
};

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
