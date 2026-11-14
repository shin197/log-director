import {
  SYSTEM_CHARACTER_ID,
  ensureSystemCharacter,
  asSystemMessage,
} from './systemCharacter.ts';
import type { Project, Character, Block } from './core.ts';
export function migrateCharacters(p: Project): Project {
  if (p.characters) {
    const ids = new Set<string>();
    for (const c of p.characters) {
      if (
        !c ||
        typeof c.id !== 'string' ||
        ids.has(c.id) ||
        typeof c.name !== 'string' ||
        typeof c.iconUrl !== 'string' ||
        !/^#[0-9a-f]{6}$/i.test(c.color) ||
        !Array.isArray(c.faces) ||
        !c.faces.every((f) => typeof f.name === 'string' && typeof f.iconUrl === 'string')
      )
        throw Error('캐릭터 데이터가 올바르지 않습니다.');
      ids.add(c.id);
    }
    if (p.blocks.some((b) => b.characterId && !ids.has(b.characterId)))
      throw Error('존재하지 않는 캐릭터 연결입니다.');
    return ensureSystemCharacter(p);
  }
  const characters: Character[] = [];
  const blocks = p.blocks.map((b) => {
    if (b.sourceType === 'system' || !b.speaker) return { ...b, characterId: null };
    let c = characters.find((c) => c.name === b.speaker);
    if (!c) {
      c = {
        id: crypto.randomUUID(),
        name: b.speaker,
        iconUrl: b.iconUrl ?? '',
        color: /^#[0-9a-f]{6}$/i.test(b.color ?? '') ? b.color! : '#888888',
        faces: [],
      };
      characters.push(c);
    }
    if (b.iconUrl && !c.faces.some((f) => f.iconUrl === b.iconUrl))
      c.faces.push({
        name:
          p.expressions?.find((x) => x.speaker === b.speaker && x.iconUrl === b.iconUrl)
            ?.name ?? '',
        iconUrl: b.iconUrl,
      });
    return { ...b, characterId: c.id, color: c.color };
  });
  return ensureSystemCharacter({ ...p, characters, blocks });
}
export function inheritCharacter(b: Block, c: Character): Block {
  if (c.id === SYSTEM_CHARACTER_ID) return asSystemMessage(b);
  return {
    ...b,
    characterId: c.id,
    speaker: c.name,
    color: c.color,
    iconUrl: c.iconUrl || c.faces[0]?.iconUrl || '',
    sourceType: 'normal',
  };
}
export function updateCharacter(p: Project, c: Character): Project {
  if (c.id === SYSTEM_CHARACTER_ID)
    throw Error('시스템 캐릭터의 이름·색상·표정은 변경할 수 없습니다.');
  if (
    !c.name.trim() ||
    (p.characters ?? []).some((x) => x.id !== c.id && x.name === c.name)
  )
    throw Error('비어 있거나 중복된 이름은 사용할 수 없습니다.');
  if (!/^#[0-9a-f]{6}$/i.test(c.color))
    throw Error('색상은 #RRGGBB 형식으로 입력해주세요.');
  return {
    ...p,
    characters: (p.characters ?? []).map((x) => (x.id === c.id ? c : x)),
    blocks: p.blocks.map((b) =>
      b.characterId === c.id ? { ...b, speaker: c.name, color: c.color } : b,
    ),
  };
}
export function fuzzyName(name: string, query: string) {
  let i = 0;
  for (const c of name.toLowerCase()) if (c === query.toLowerCase()[i]) i++;
  return i === query.length;
}
export function moveCharacter(
  characters: Character[],
  fromIndex: number,
  targetIndex: number,
  after: boolean,
): Character[] {
  if (
    fromIndex === targetIndex ||
    fromIndex < 0 ||
    targetIndex < 0 ||
    fromIndex >= characters.length ||
    targetIndex >= characters.length
  )
    return characters;
  const next = [...characters];
  const [moved] = next.splice(fromIndex, 1);
  let insertAt = after ? targetIndex + 1 : targetIndex;
  if (fromIndex < insertAt) insertAt -= 1;
  if (insertAt === fromIndex) return characters;
  next.splice(insertAt, 0, moved);
  return next;
}
