import type { Block, Character, Scene } from './core.ts';
import type { StyleCard } from './styles.ts';
import { SYSTEM_CHARACTER_ID } from './systemCharacter.ts';
import { computeSceneRanges, type SceneRange } from './scenes.ts';

export type SearchFieldKey = 'from' | 'in' | 'dice' | 'is' | 'scene' | 'style' | 'text';
export type IsFlag = 'dice' | 'system' | 'normal' | 'unlinked';

export type SearchChip = {
  id: string;
  key: SearchFieldKey;
  value: string;
  negative: boolean;
};

export const IS_FLAGS: {
  value: IsFlag;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    value: 'dice',
    label: '판정 있음',
    description: '주사위 판정이 있는 메시지',
    icon: '🎲',
  },
  {
    value: 'system',
    label: '시스템',
    description: '시스템 메시지만',
    icon: '⚙',
  },
  {
    value: 'normal',
    label: '일반 대사',
    description: '일반 대사만',
    icon: '💬',
  },
  {
    value: 'unlinked',
    label: '미연결 캐릭터',
    description: '캐릭터와 연결되지 않은 사용자 지정 캐릭터만',
    icon: '⛓',
  },
];

function isSystemBlock(b: Block): boolean {
  return b.sourceType === 'system' || b.characterId === SYSTEM_CHARACTER_ID;
}

function getSpeakerNames(b: Block, characters?: Character[]): string[] {
  if (isSystemBlock(b)) return [];
  const names: string[] = [];
  if (b.speaker) names.push(b.speaker);
  if (b.characterId && characters) {
    const linked = characters.find(
      (c) => c.id === b.characterId && c.id !== SYSTEM_CHARACTER_ID,
    );
    if (linked && !names.includes(linked.name)) names.push(linked.name);
  }
  return names;
}

export function quoteValueIfNeeded(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  if (!escaped) return '""';
  return /\s/.test(escaped) || escaped.includes('"') ? `"${escaped}"` : escaped;
}

export function tokenizeQuery(query: string): { tokens: string[]; openQuote: boolean } {
  const tokens: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < query.length; i++) {
    const ch = query[i];
    if (ch === '\\' && i + 1 < query.length) {
      const next = query[i + 1];
      if (next === '"' || next === '\\') {
        cur += next;
        i++;
        continue;
      }
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      cur += ch;
    } else if (/\s/.test(ch) && !inQuotes) {
      if (cur) {
        tokens.push(cur);
        cur = '';
      }
    } else {
      cur += ch;
    }
  }

  if (cur) {
    tokens.push(cur);
  }

  return { tokens, openQuote: inQuotes };
}

export function unquoteSearchValue(raw: string): string {
  let val = raw;
  if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
    val = val.slice(1, -1);
  }
  return val;
}

/**
 * 검색 입력 문자열의 이스케이프 시퀀스(\", \\)를 실제 문자로 복원합니다.
 */
export function unescapeSearchValue(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    if (
      raw[i] === '\\' &&
      i + 1 < raw.length &&
      (raw[i + 1] === '"' || raw[i + 1] === '\\')
    ) {
      out += raw[i + 1];
      i++;
    } else {
      out += raw[i];
    }
  }
  return out;
}

/**
 * SearchBar 자동완성/칩 생성 시 필터 값 입력(따옴표 열림/닫힘 및 \", \\ 이스케이프 포함)을
 * 실제 표시·저장용 값으로 파싱합니다.
 */
export function parseFilterValueInput(raw: string): string {
  if (!raw.startsWith('"')) {
    return unescapeSearchValue(raw);
  }
  let out = '';
  let i = 1;
  while (i < raw.length) {
    const ch = raw[i];
    if (
      ch === '\\' &&
      i + 1 < raw.length &&
      (raw[i + 1] === '"' || raw[i + 1] === '\\')
    ) {
      out += raw[i + 1];
      i += 2;
      continue;
    }
    if (ch === '"' && i === raw.length - 1) {
      break;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * 따옴표 및 이스케이프(\", \\)를 고려해 검색 입력을 공백 기준 토큰으로 분리합니다.
 */
export function splitSearchTokens(
  input: string,
): Array<{ raw: string; start: number; end: number }> {
  const tokens: Array<{ raw: string; start: number; end: number }> = [];
  let i = 0;
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i])) i++;
    if (i >= input.length) break;
    const start = i;
    let inQuotes = false;
    while (i < input.length) {
      const ch = input[i];
      if (
        ch === '\\' &&
        i + 1 < input.length &&
        (input[i + 1] === '"' || input[i + 1] === '\\')
      ) {
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = !inQuotes;
        i++;
        continue;
      }
      if (!inQuotes && /\s/.test(ch)) {
        break;
      }
      i++;
    }
    tokens.push({ raw: input.slice(start, i), start, end: i });
  }
  return tokens;
}

export function formatChipToken(chip: Omit<SearchChip, 'id'>): string {
  const prefix = chip.negative ? '-' : '';
  const val = quoteValueIfNeeded(chip.value);
  if (chip.key === 'text') return `${prefix}${val}`;
  return `${prefix}${chip.key}:${val}`;
}

export function formatChipDisplay(chip: Omit<SearchChip, 'id'>): {
  icon: string;
  label: string;
} {
  const neg = chip.negative ? '-' : '';
  switch (chip.key) {
    case 'from':
      return { icon: `${neg}👤`, label: chip.value };
    case 'in':
      return {
        icon: `${neg}#`,
        label:
          chip.value.toLowerCase() === 'none' || chip.value === '(채널 없음)'
            ? '(채널 없음)'
            : chip.value,
      };
    case 'dice':
      return { icon: `${neg}🎲`, label: chip.value };
    case 'scene':
      return { icon: `${neg}★`, label: chip.value };
    case 'style':
      return {
        icon: `${neg}🎨`,
        label:
          chip.value.toLowerCase() === 'none' || chip.value === '(스타일 없음)'
            ? '(스타일 없음)'
            : chip.value,
      };
    case 'is': {
      const found = IS_FLAGS.find((f) => f.value === chip.value.toLowerCase());
      return {
        icon: `${neg}${found?.icon ?? '✨'}`,
        label: found?.label ?? `is:${chip.value}`,
      };
    }
    case 'text':
      return { icon: chip.negative ? '🚫' : '🔍', label: chip.value };
  }
}

export function tryParseFilterToken(rawToken: string): Omit<SearchChip, 'id'> | null {
  const trimmed = rawToken.trim();
  if (!trimmed) return null;

  let token = trimmed;
  const negative = token.startsWith('-');
  if (negative) token = token.slice(1);
  if (!token) return null;

  const colon = token.indexOf(':');
  if (colon < 0) {
    if (!negative) return null;
    const value = unquoteSearchValue(token);
    if (!value) return null;
    return { key: 'text', value, negative: true };
  }

  const key = token.slice(0, colon).toLowerCase();
  const value = unquoteSearchValue(token.slice(colon + 1)).trim();
  if (!value) return null;

  if (
    key === 'from' ||
    key === 'in' ||
    key === 'dice' ||
    key === 'scene' ||
    key === 'style'
  ) {
    return { key, value, negative };
  }
  if (key === 'is') {
    const lower = value.toLowerCase();
    if (
      lower === 'dice' ||
      lower === 'system' ||
      lower === 'normal' ||
      lower === 'unlinked'
    ) {
      return { key: 'is', value: lower, negative };
    }
  }
  return null;
}

export function parseQueryToChipsAndText(query: string): {
  chips: SearchChip[];
  text: string;
} {
  const { tokens } = tokenizeQuery(query);
  const chips: SearchChip[] = [];
  const remaining: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const parsed = tryParseFilterToken(tokens[i]);
    if (parsed) {
      chips.push({ id: `chip-${i}-${parsed.key}-${parsed.value}`, ...parsed });
    } else {
      remaining.push(tokens[i]);
    }
  }
  return { chips, text: remaining.join(' ') };
}

export function sanitizeLiveQuery(query: string): string {
  let working = query;
  const { openQuote } = tokenizeQuery(working);
  if (openQuote) {
    working += '"';
  }
  const { tokens } = tokenizeQuery(working);
  const formatted: string[] = [];
  for (const raw of tokens) {
    const negative = raw.startsWith('-');
    const t = negative ? raw.slice(1) : raw;
    if (!t || t.endsWith(':')) continue;
    const colon = t.indexOf(':');
    if (colon < 0) {
      const val = unquoteSearchValue(t);
      if (!val) continue;
      formatted.push(`${negative ? '-' : ''}${quoteValueIfNeeded(val)}`);
      continue;
    }
    const key = t.slice(0, colon);
    const rawVal = unquoteSearchValue(t.slice(colon + 1));
    const valLower = rawVal.toLowerCase();
    if (!valLower) continue;
    if (key === 'is') {
      const validIs = ['dice', 'system', 'normal', 'unlinked'];
      if (
        !validIs.includes(valLower) &&
        validIs.some((flag) => flag.startsWith(valLower))
      ) {
        continue;
      }
    }
    formatted.push(`${negative ? '-' : ''}${key}:${quoteValueIfNeeded(rawVal)}`);
  }
  return formatted.join(' ');
}

/**
 * 스타일 카드의 직접 메시지 지정(styleIds), 캐릭터 지정(character.styleIds),
 * 그리고 카드 내부 필터(OR 합집합)를 종합해 단일 메시지 판별 함수를 생성합니다.
 */
export function createStyleCardMatcher(
  card: StyleCard,
  characters: Character[] = [],
  scenes: Scene[] = [],
  blocks: Block[] = [],
  styleCards: StyleCard[] = [],
  visitedStyleIds?: Set<string>,
  charMap?: Map<string, Character>,
): (b: Block) => boolean {
  const nextVisited = new Set(visitedStyleIds);
  nextVisited.add(card.id);
  const resolvedCharMap = charMap ?? new Map(characters.map((c) => [c.id, c]));
  const predicates: ((b: Block) => boolean)[] = [];
  for (const rawFilter of card.filters) {
    const sanitized = sanitizeLiveQuery(rawFilter);
    if (!sanitized) continue;
    try {
      predicates.push(
        compileQuery(sanitized, characters, scenes, blocks, styleCards, nextVisited),
      );
    } catch {
      try {
        predicates.push(
          compileQuery(rawFilter, characters, scenes, blocks, styleCards, nextVisited),
        );
      } catch {
        // 잘못된 필터는 건너뜀
      }
    }
  }
  return (b: Block): boolean => {
    if (b.styleIds?.includes(card.id)) return true;
    if (b.characterId && resolvedCharMap.get(b.characterId)?.styleIds?.includes(card.id)) {
      return true;
    }
    if (predicates.length === 0) return false;
    return predicates.some((fn) => fn(b));
  };
}

export function compileQuery(
  query: string,
  characters?: Character[],
  scenes?: Scene[],
  blocks?: Block[],
  styleCards?: StyleCard[],
  visitedStyleIds?: Set<string>,
): (b: Block) => boolean {
  const { tokens, openQuote } = tokenizeQuery(query);
  if (openQuote) throw Error('따옴표를 닫아주세요.');

  let cachedSceneRanges: SceneRange[] | null = null;

  const checks = tokens.map((rawToken) => {
    let token = rawToken;
    const negative = token.startsWith('-');
    if (negative) token = token.slice(1);
    if (!token) throw Error('검색어를 입력해주세요.');

    const colon = token.indexOf(':');
    const key = colon < 0 ? 'all' : token.slice(0, colon);
    const rawValue = colon < 0 ? token : token.slice(colon + 1);
    const value = unquoteSearchValue(rawValue).toLowerCase();

    if (!value) throw Error('검색어를 입력해주세요.');

    let match: (b: Block) => boolean;

    switch (key) {
      case 'all':
        match = (b) => {
          const speakers = getSpeakerNames(b, characters);
          return [...speakers, b.text, b.diceResult]
            .join('\n')
            .toLowerCase()
            .includes(value);
        };
        break;
      case 'from':
        match = (b) => {
          if (isSystemBlock(b)) return false;
          const speakers = getSpeakerNames(b, characters);
          return speakers.some((name) => name.toLowerCase().includes(value));
        };
        break;
      case 'in':
        match = (b) => {
          const ch = b.channel ?? '';
          if (value === 'none' || value === '(채널 없음)') {
            return ch === '';
          }
          return ch.toLowerCase().includes(value);
        };
        break;
      case 'dice':
        match = (b) => b.diceResult.toLowerCase().includes(value);
        break;
      case 'scene': {
        if (!cachedSceneRanges) {
          cachedSceneRanges = computeSceneRanges(scenes, blocks ?? []);
        }
        const matchedIds = new Set<string>();
        for (const r of cachedSceneRanges) {
          if (r.scene.name.toLowerCase().includes(value)) {
            for (const id of r.blockIds) matchedIds.add(id);
          }
        }
        match = (b) => matchedIds.has(b.id);
        break;
      }
      case 'style': {
        const cards = (styleCards ?? []).filter((c) => !visitedStyleIds?.has(c.id));
        if (value === 'none' || value === '(스타일 없음)') {
          const allMatchers = cards.map((card) =>
            createStyleCardMatcher(
              card,
              characters ?? [],
              scenes ?? [],
              blocks ?? [],
              styleCards ?? [],
              visitedStyleIds,
            ),
          );
          match = (b) => !allMatchers.some((fn) => fn(b));
        } else {
          const targetCards = cards.filter((c) => c.name.toLowerCase().includes(value));
          const matchers = targetCards.map((card) =>
            createStyleCardMatcher(
              card,
              characters ?? [],
              scenes ?? [],
              blocks ?? [],
              styleCards ?? [],
              visitedStyleIds,
            ),
          );
          match = (b) => matchers.some((fn) => fn(b));
        }
        break;
      }
      case 'is':
        if (value === 'dice') {
          match = (b) => b.diceResult.trim().length > 0;
        } else if (value === 'system') {
          match = (b) => isSystemBlock(b);
        } else if (value === 'normal') {
          match = (b) => !isSystemBlock(b);
        } else if (value === 'unlinked') {
          match = (b) => !isSystemBlock(b) && !b.characterId;
        } else {
          throw Error(`알 수 없는 is 조건: ${value}`);
        }
        break;
      default:
        throw Error(`알 수 없는 검색 필드: ${key}`);
    }

    return (b: Block) => match(b) !== negative;
  });

  return (b) => checks.every((check) => check(b));
}

export function moveBlocks(
  blocks: Block[],
  ids: Set<string>,
  target: string,
  after: boolean,
): Block[] {
  const targetIndex = blocks.findIndex((b) => b.id === target);
  if (targetIndex < 0 || !ids.size) return blocks;
  const moving = blocks.filter((b) => ids.has(b.id));
  if (!moving.length) return blocks;
  const rest = blocks.filter((b) => !ids.has(b.id));
  const boundary = after ? targetIndex + 1 : targetIndex;
  const insertAt = blocks.slice(0, boundary).filter((b) => !ids.has(b.id)).length;
  const result = [...rest];
  result.splice(insertAt, 0, ...moving);
  return result.every((b, i) => b.id === blocks[i].id) ? blocks : result;
}

export function reorder(
  blocks: Block[],
  id: string,
  target: string,
  after: boolean,
): Block[] {
  return moveBlocks(blocks, new Set([id]), target, after);
}
