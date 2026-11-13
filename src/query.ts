import type { Block, Character } from './core.ts';
import { SYSTEM_CHARACTER_ID } from './systemCharacter.ts';

export type SearchFieldKey = 'from' | 'in' | 'dice' | 'is' | 'text';
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
    label: '미연결 화자',
    description: '캐릭터와 연결되지 않은 사용자 지정 화자만',
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
  const clean = value.replace(/"/g, '');
  if (!clean) return '""';
  return /\s/.test(clean) ? `"${clean}"` : clean;
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
  if ((trimmed.match(/"/g)?.length ?? 0) % 2 !== 0) return null;

  let token = trimmed;
  const negative = token.startsWith('-');
  if (negative) token = token.slice(1);
  if (!token) return null;

  const colon = token.indexOf(':');
  if (colon < 0) {
    if (!negative) return null;
    const value = token.replace(/^"|"$/g, '');
    if (!value) return null;
    return { key: 'text', value, negative: true };
  }

  const key = token.slice(0, colon).toLowerCase();
  const value = token
    .slice(colon + 1)
    .replace(/^"|"$/g, '')
    .trim();
  if (!value) return null;

  if (key === 'from' || key === 'in' || key === 'dice') {
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
  const tokens = query.match(/(?:[^\s"]|"[^"]*")+/g) ?? [];
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
  if ((working.match(/"/g)?.length ?? 0) % 2 !== 0) {
    working += '"';
  }
  const tokens = working.match(/(?:[^\s"]|"[^"]*")+/g) ?? [];
  const validTokens = tokens.filter((raw) => {
    const t = raw.startsWith('-') ? raw.slice(1) : raw;
    if (!t || t.endsWith(':')) return false;
    const colon = t.indexOf(':');
    if (colon < 0) return true;
    const key = t.slice(0, colon);
    const val = t
      .slice(colon + 1)
      .replace(/^"|"$/g, '')
      .toLowerCase();
    if (!val) return false;
    if (key === 'is') {
      const validIs = ['dice', 'system', 'normal', 'unlinked'];
      if (!validIs.includes(val) && validIs.some((flag) => flag.startsWith(val))) {
        return false;
      }
    }
    return true;
  });
  return validTokens.join(' ');
}

export function compileQuery(
  query: string,
  characters?: Character[],
): (b: Block) => boolean {
  const tokens = query.match(/(?:[^\s"]|"[^"]*")+/g) ?? [];
  if ((query.match(/"/g)?.length ?? 0) % 2) throw Error('따옴표를 닫아주세요.');

  const checks = tokens.map((rawToken) => {
    let token = rawToken;
    const negative = token.startsWith('-');
    if (negative) token = token.slice(1);
    if (!token) throw Error('검색어를 입력해주세요.');

    const colon = token.indexOf(':');
    const key = colon < 0 ? 'all' : token.slice(0, colon);
    const rawValue = colon < 0 ? token : token.slice(colon + 1);
    const value = rawValue.replace(/^"|"$/g, '').toLowerCase();

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
