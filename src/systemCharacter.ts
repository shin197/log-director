import type { Block, Character, Project } from './core.ts';
export const SYSTEM_CHARACTER_ID = 'builtin:system';
export function systemCharacter(): Character {
  return {
    id: SYSTEM_CHARACTER_ID,
    name: '시스템',
    iconUrl: '',
    color: '#888888',
    faces: [],
  };
}
export function asSystemMessage(block: Block): Block {
  const { speaker: _speaker, ...rest } = block;
  return {
    ...rest,
    characterId: SYSTEM_CHARACTER_ID,
    sourceType: 'system',
    iconUrl: '',
    color: '',
  };
}
export function ensureSystemCharacter(p: Project): Project {
  return {
    ...p,
    characters: [
      ...(p.characters ?? []).filter((c) => c.id !== SYSTEM_CHARACTER_ID),
      systemCharacter(),
    ],
    blocks: p.blocks.map((b) =>
      b.sourceType === 'system' || b.characterId === SYSTEM_CHARACTER_ID
        ? asSystemMessage(b)
        : b,
    ),
  };
}
