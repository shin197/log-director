import type { Block, Character, QuickCharacterSlot } from './core.ts';
import { SYSTEM_CHARACTER_ID } from './systemCharacter.ts';

/**
 * Extracts digit 1..9 from a keyboard event (supports both e.key and e.code Digit1..9).
 */
export function getQuickSlotNumber(e: { key: string; code?: string }): number | null {
  if (e.key >= '1' && e.key <= '9') {
    return Number(e.key);
  }
  const m = e.code?.match(/^Digit([1-9])$/);
  return m ? Number(m[1]) : null;
}

export function setQuickCharacterSlot(
  slots: Record<string, QuickCharacterSlot> | undefined,
  slotNumber: number,
  slot: QuickCharacterSlot,
): Record<string, QuickCharacterSlot> {
  return {
    ...(slots ?? {}),
    [String(slotNumber)]: slot,
  };
}

export function removeQuickCharacterSlot(
  slots: Record<string, QuickCharacterSlot> | undefined,
  slotNumber: number | string,
): Record<string, QuickCharacterSlot> | undefined {
  if (!slots) return undefined;
  const key = String(slotNumber);
  if (!(key in slots)) return slots;
  const next = { ...slots };
  delete next[key];
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Resolves a stored quick slot against current project characters,
 * returning speaker/characterId/iconUrl/color (without channel).
 */
export function resolveQuickSlotForComposer(
  slot: QuickCharacterSlot,
  characters: Character[],
): QuickCharacterSlot {
  if (slot.characterId) {
    const linked = characters.find((c) => c.id === slot.characterId);
    if (linked) {
      const isSys = linked.id === SYSTEM_CHARACTER_ID;
      return {
        speaker: linked.name,
        characterId: linked.id,
        iconUrl: isSys
          ? ''
          : slot.iconUrl || linked.iconUrl || linked.faces[0]?.iconUrl || '',
        color: isSys ? undefined : linked.color || undefined,
      };
    }
    return {
      ...slot,
      characterId: null,
    };
  }
  return slot;
}

/**
 * Builds a QuickCharacterSlot snapshot from an existing timeline message block.
 */
export function createSlotFromBlock(
  block: Block,
  characters: Character[],
): QuickCharacterSlot {
  const isSys =
    block.sourceType === 'system' || block.characterId === SYSTEM_CHARACTER_ID;
  if (isSys) {
    const sysChar = characters.find((c) => c.id === SYSTEM_CHARACTER_ID);
    return {
      speaker: sysChar?.name ?? 'SYSTEM',
      characterId: SYSTEM_CHARACTER_ID,
      iconUrl: '',
    };
  }
  const linked = block.characterId
    ? characters.find((c) => c.id === block.characterId)
    : undefined;
  if (linked) {
    return {
      speaker: linked.name,
      characterId: linked.id,
      iconUrl: block.iconUrl || linked.iconUrl || linked.faces[0]?.iconUrl || '',
      color: linked.color || undefined,
    };
  }
  return {
    speaker: (block.speaker || '').trim() || '이름 없음',
    characterId: null,
    iconUrl: block.iconUrl || '',
    color: block.color || undefined,
  };
}
