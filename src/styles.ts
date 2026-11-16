import type { Block, Character, Project, Scene } from './core.ts';
import {
  compileQuery,
  formatChipDisplay,
  parseQueryToChipsAndText,
  sanitizeLiveQuery,
} from './query.ts';

export type AvatarShape = 'square' | 'rounded' | 'circle' | 'diamond';
export type PanelBorderStyle = 'bottom' | 'box' | 'left-accent' | 'none';
export type FontWeightOption = 'normal' | 'bold';
export type FontStyleOption = 'normal' | 'italic';

export type MessageStyleProps = {
  fontFamily?: string;
  fontSize?: number;
  textColor?: string;
  fontWeight?: FontWeightOption;
  fontStyle?: FontStyleOption;
  speakerColor?: string;
  panelBgColor?: string;
  panelBorderColor?: string;
  panelBorderStyle?: PanelBorderStyle;
  panelRadius?: number;
  avatarShape?: AvatarShape;
  avatarBorderColor?: string;
  avatarBorderWidth?: number;
  diceBgColor?: string;
  diceTextColor?: string;
  diceBorderColor?: string;
  diceFontWeight?: FontWeightOption;
};

export type GlobalStyleConfig = {
  pageBgColor: string;
  containerWidth: number;
  titleColor: string;
  titleSize: number;
  titleAlign: 'left' | 'center';
  metaColor: string;
  dividerColor: string;
  systemTextColor: string;
  messageDefaults: MessageStyleProps;
};

export type StyleCard = {
  id: string;
  name: string;
  filters: string[];
  props: MessageStyleProps;
};

export type ProjectStyles = {
  global: GlobalStyleConfig;
  cards: StyleCard[];
};

export type StyleUsageItem =
  | { kind: 'filter'; filter: string; label: string }
  | { kind: 'character'; characterId: string; label: string }
  | { kind: 'message'; messageId: string; label: string };

export const FONT_FAMILY_PRESETS: { label: string; value: string }[] = [
  { label: '지정 안 함 (상위 스타일 유지)', value: '' },
  {
    label: '시스템 기본 고딕 (Sans-serif)',
    value: 'system-ui, -apple-system, sans-serif',
  },
  { label: '명조 / 세리프 (Serif)', value: ' Georgia, "Nanum Myeongjo", Batang, serif' },
  {
    label: '고정폭 / 타자기 (Monospace)',
    value: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
  },
  { label: '둥근 고딕 (Rounded)', value: '"Pretendard", "Malgun Gothic", sans-serif' },
];

export function defaultGlobalStyle(): GlobalStyleConfig {
  return {
    pageBgColor: '#121212',
    containerWidth: 960,
    titleColor: '#EEEEEE',
    titleSize: 24,
    titleAlign: 'left',
    metaColor: '#888888',
    dividerColor: '#262626',
    systemTextColor: '#888888',
    messageDefaults: {},
  };
}

export function defaultProjectStyles(): ProjectStyles {
  return {
    global: defaultGlobalStyle(),
    cards: [],
  };
}

const VALID_AVATAR_SHAPES = new Set<AvatarShape>([
  'square',
  'rounded',
  'circle',
  'diamond',
]);
const VALID_BORDER_STYLES = new Set<PanelBorderStyle>([
  'bottom',
  'box',
  'left-accent',
  'none',
]);
const VALID_FONT_WEIGHTS = new Set<FontWeightOption>(['normal', 'bold']);
const VALID_FONT_STYLES = new Set<FontStyleOption>(['normal', 'italic']);

export function normalizeMessageStyleProps(raw: any): MessageStyleProps {
  if (!raw || typeof raw !== 'object') return {};
  const out: MessageStyleProps = {};
  if (typeof raw.fontFamily === 'string' && raw.fontFamily.trim()) {
    out.fontFamily = raw.fontFamily.trim();
  }
  if (
    typeof raw.fontSize === 'number' &&
    Number.isFinite(raw.fontSize) &&
    raw.fontSize >= 10 &&
    raw.fontSize <= 48
  ) {
    out.fontSize = Math.round(raw.fontSize);
  }
  if (typeof raw.textColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.textColor)) {
    out.textColor = raw.textColor.toUpperCase();
  }
  if (VALID_FONT_WEIGHTS.has(raw.fontWeight)) {
    out.fontWeight = raw.fontWeight;
  }
  if (VALID_FONT_STYLES.has(raw.fontStyle)) {
    out.fontStyle = raw.fontStyle;
  }
  if (
    typeof raw.speakerColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(raw.speakerColor)
  ) {
    out.speakerColor = raw.speakerColor.toUpperCase();
  }
  if (
    typeof raw.panelBgColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(raw.panelBgColor)
  ) {
    out.panelBgColor = raw.panelBgColor.toUpperCase();
  }
  if (
    typeof raw.panelBorderColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(raw.panelBorderColor)
  ) {
    out.panelBorderColor = raw.panelBorderColor.toUpperCase();
  }
  if (VALID_BORDER_STYLES.has(raw.panelBorderStyle)) {
    out.panelBorderStyle = raw.panelBorderStyle;
  }
  if (
    typeof raw.panelRadius === 'number' &&
    Number.isFinite(raw.panelRadius) &&
    raw.panelRadius >= 0 &&
    raw.panelRadius <= 32
  ) {
    out.panelRadius = Math.round(raw.panelRadius);
  }
  if (VALID_AVATAR_SHAPES.has(raw.avatarShape)) {
    out.avatarShape = raw.avatarShape;
  }
  if (
    typeof raw.avatarBorderColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(raw.avatarBorderColor)
  ) {
    out.avatarBorderColor = raw.avatarBorderColor.toUpperCase();
  }
  if (
    typeof raw.avatarBorderWidth === 'number' &&
    Number.isFinite(raw.avatarBorderWidth) &&
    raw.avatarBorderWidth >= 0 &&
    raw.avatarBorderWidth <= 10
  ) {
    out.avatarBorderWidth = Math.round(raw.avatarBorderWidth);
  }
  if (typeof raw.diceBgColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.diceBgColor)) {
    out.diceBgColor = raw.diceBgColor.toUpperCase();
  }
  if (
    typeof raw.diceTextColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(raw.diceTextColor)
  ) {
    out.diceTextColor = raw.diceTextColor.toUpperCase();
  }
  if (
    typeof raw.diceBorderColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(raw.diceBorderColor)
  ) {
    out.diceBorderColor = raw.diceBorderColor.toUpperCase();
  }
  if (VALID_FONT_WEIGHTS.has(raw.diceFontWeight)) {
    out.diceFontWeight = raw.diceFontWeight;
  }
  return out;
}

export function normalizeProjectStyles(raw: any): ProjectStyles | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const defGlobal = defaultGlobalStyle();
  const g = raw.global && typeof raw.global === 'object' ? raw.global : {};
  const global: GlobalStyleConfig = {
    pageBgColor:
      typeof g.pageBgColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(g.pageBgColor)
        ? g.pageBgColor.toUpperCase()
        : defGlobal.pageBgColor,
    containerWidth:
      typeof g.containerWidth === 'number' &&
      Number.isFinite(g.containerWidth) &&
      g.containerWidth >= 480 &&
      g.containerWidth <= 1920
        ? Math.round(g.containerWidth)
        : defGlobal.containerWidth,
    titleColor:
      typeof g.titleColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(g.titleColor)
        ? g.titleColor.toUpperCase()
        : defGlobal.titleColor,
    titleSize:
      typeof g.titleSize === 'number' &&
      Number.isFinite(g.titleSize) &&
      g.titleSize >= 14 &&
      g.titleSize <= 48
        ? Math.round(g.titleSize)
        : defGlobal.titleSize,
    titleAlign: g.titleAlign === 'center' ? 'center' : 'left',
    metaColor:
      typeof g.metaColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(g.metaColor)
        ? g.metaColor.toUpperCase()
        : defGlobal.metaColor,
    dividerColor:
      typeof g.dividerColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(g.dividerColor)
        ? g.dividerColor.toUpperCase()
        : defGlobal.dividerColor,
    systemTextColor:
      typeof g.systemTextColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(g.systemTextColor)
        ? g.systemTextColor.toUpperCase()
        : defGlobal.systemTextColor,
    messageDefaults: normalizeMessageStyleProps(g.messageDefaults),
  };

  const cards: StyleCard[] = Array.isArray(raw.cards)
    ? raw.cards
        .filter((c: any) => c && typeof c === 'object' && typeof c.id === 'string')
        .map((c: any, idx: number) => ({
          id: c.id,
          name:
            typeof c.name === 'string' && c.name.trim()
              ? c.name.trim()
              : `스타일 ${idx + 1}`,
          filters: Array.isArray(c.filters)
            ? c.filters
                .filter((f: any) => typeof f === 'string' && f.trim())
                .map((f: string) => f.trim())
            : [],
          props: normalizeMessageStyleProps(c.props),
        }))
    : [];

  return { global, cards };
}

export function createStyleCard(partial?: Partial<StyleCard>, index = 1): StyleCard {
  return {
    id: partial?.id ?? crypto.randomUUID(),
    name: partial?.name?.trim() || `새 스타일 ${index}`,
    filters: partial?.filters ? [...partial.filters] : [],
    props: partial?.props ? { ...partial.props } : {},
  };
}

/**
 * 스타일 카드를 복제해 원본 바로 뒤에 삽입합니다.
 */
export function duplicateStyleCard(styles: ProjectStyles, cardId: string): ProjectStyles {
  const idx = styles.cards.findIndex((c) => c.id === cardId);
  if (idx < 0) return styles;
  const orig = styles.cards[idx];
  const copy: StyleCard = {
    id: crypto.randomUUID(),
    name: `${orig.name} (복사본)`,
    filters: [...orig.filters],
    props: { ...orig.props },
  };
  const nextCards = [...styles.cards];
  nextCards.splice(idx + 1, 0, copy);
  return {
    ...styles,
    cards: nextCards,
  };
}

/**
 * 스타일 카드를 삭제하고, 해당 스타일과 연결된 캐릭터·메시지의 스타일 참조도 모두 해제합니다.
 */
export function removeStyleCardFromProject(project: Project, cardId: string): Project {
  const currentStyles = project.styles ?? defaultProjectStyles();
  const nextCards = currentStyles.cards.filter((c) => c.id !== cardId);
  const nextCharacters = project.characters?.map((ch) => {
    if (!ch.styleIds?.includes(cardId)) return ch;
    const nextIds = ch.styleIds.filter((id) => id !== cardId);
    const copy = { ...ch };
    if (nextIds.length > 0) copy.styleIds = nextIds;
    else delete copy.styleIds;
    return copy;
  });
  const nextBlocks = project.blocks.map((b) => {
    if (!b.styleIds?.includes(cardId)) return b;
    const nextIds = b.styleIds.filter((id) => id !== cardId);
    const copy = { ...b };
    if (nextIds.length > 0) copy.styleIds = nextIds;
    else delete copy.styleIds;
    return copy;
  });
  return {
    ...project,
    styles: {
      ...currentStyles,
      cards: nextCards,
    },
    ...(nextCharacters ? { characters: nextCharacters } : {}),
    blocks: nextBlocks,
  };
}

/**
 * 드래그 앤 드롭으로 일반 스타일 카드의 순서를 변경합니다. (원본 불변성 유지)
 */
export function moveStyleCard(
  cards: StyleCard[],
  fromIndex: number,
  targetIndex: number,
  after: boolean,
): StyleCard[] {
  if (
    fromIndex < 0 ||
    fromIndex >= cards.length ||
    targetIndex < 0 ||
    targetIndex >= cards.length ||
    fromIndex === targetIndex
  ) {
    return cards;
  }
  const item = cards[fromIndex];
  const remaining = cards.filter((_, i) => i !== fromIndex);
  let insertAt = remaining.findIndex((c) => c.id === cards[targetIndex].id);
  if (insertAt < 0) return cards;
  if (after) insertAt += 1;
  if (insertAt === fromIndex) return cards;
  const next = [...remaining];
  next.splice(insertAt, 0, item);
  return next;
}

/**
 * 스타일 카드에 검색 필터를 추가합니다. 유효하지 않은 검색 문법이면 오류를 던집니다.
 */
export function addFilterToStyleCard(card: StyleCard, rawFilter: string): StyleCard {
  const trimmed = rawFilter.trim();
  if (!trimmed) throw Error('추가할 필터 조건을 입력해주세요.');
  // 문법 검증
  compileQuery(trimmed);
  if (card.filters.includes(trimmed)) {
    return card;
  }
  return {
    ...card,
    filters: [...card.filters, trimmed],
  };
}

/**
 * 스타일 카드에서 특정 필터(사용처)를 제거합니다.
 */
export function removeFilterFromStyleCard(
  card: StyleCard,
  filterToRemove: string,
): StyleCard {
  return {
    ...card,
    filters: card.filters.filter((f) => f !== filterToRemove),
  };
}

/**
 * 필터 문자열을 사람이 읽기 좋은 사용처 칩 라벨로 변환합니다.
 */
export function formatFilterUsageLabel(filter: string): string {
  const parsed = parseQueryToChipsAndText(filter);
  const parts: string[] = [];
  for (const chip of parsed.chips) {
    const d = formatChipDisplay(chip);
    parts.push(`${d.icon} ${d.label}`);
  }
  if (parsed.text) {
    parts.push(parsed.text);
  }
  return parts.join(' + ') || filter;
}

/**
 * 특정 스타일 카드의 모든 사용처(필터, 캐릭터, 개별 메시지) 목록을 수집합니다.
 */
export function collectStyleCardUsages(
  card: StyleCard,
  project: Project,
): StyleUsageItem[] {
  const usages: StyleUsageItem[] = [];
  for (const f of card.filters) {
    usages.push({
      kind: 'filter',
      filter: f,
      label: formatFilterUsageLabel(f),
    });
  }
  for (const ch of project.characters ?? []) {
    if (ch.styleIds?.includes(card.id)) {
      usages.push({
        kind: 'character',
        characterId: ch.id,
        label: `캐릭터: ${ch.name}`,
      });
    }
  }
  for (const b of project.blocks) {
    if (b.styleIds?.includes(card.id)) {
      const preview = (b.speaker ? `${b.speaker}: ` : '') + b.text.slice(0, 14);
      usages.push({
        kind: 'message',
        messageId: b.id,
        label: `메시지: ${preview}`,
      });
    }
  }
  return usages;
}

/**
 * 사용처 칩의 X 버튼을 눌렀을 때 해당 연결(필터·캐릭터·메시지)을 해제합니다.
 */
export function unlinkStyleUsageFromProject(
  project: Project,
  cardId: string,
  usage: StyleUsageItem,
): Project {
  const currentStyles = project.styles ?? defaultProjectStyles();
  if (usage.kind === 'filter') {
    return {
      ...project,
      styles: {
        ...currentStyles,
        cards: currentStyles.cards.map((c) =>
          c.id === cardId ? removeFilterFromStyleCard(c, usage.filter) : c,
        ),
      },
    };
  }
  if (usage.kind === 'character') {
    return {
      ...project,
      characters: project.characters?.map((ch) => {
        if (ch.id !== usage.characterId || !ch.styleIds?.includes(cardId)) return ch;
        const nextIds = ch.styleIds.filter((id) => id !== cardId);
        const copy = { ...ch };
        if (nextIds.length > 0) copy.styleIds = nextIds;
        else delete copy.styleIds;
        return copy;
      }),
    };
  }
  return {
    ...project,
    blocks: project.blocks.map((b) => {
      if (b.id !== usage.messageId || !b.styleIds?.includes(cardId)) return b;
      const nextIds = b.styleIds.filter((id) => id !== cardId);
      const copy = { ...b };
      if (nextIds.length > 0) copy.styleIds = nextIds;
      else delete copy.styleIds;
      return copy;
    }),
  };
}

/**
 * MessageStyleProps를 화면/미리보기 렌더링용 인라인 스타일 묶음으로 변환합니다.
 */
export function buildMessageStyleObjects(
  props: MessageStyleProps,
  dividerColor = '#262626',
): {
  panelStyle: Record<string, string | number | undefined>;
  avatarStyle: Record<string, string | number | undefined>;
  speakerColor?: string;
  textStyle: Record<string, string | number | undefined>;
  diceStyle: Record<string, string | number | undefined>;
} {
  const panelStyle: Record<string, string | number | undefined> = {};
  if (props.panelBgColor) {
    panelStyle.backgroundColor = props.panelBgColor;
  }
  const bColor = props.panelBorderColor || dividerColor;
  if (props.panelBorderStyle === 'none') {
    panelStyle.border = 'none';
    panelStyle.borderBottom = 'none';
  } else if (props.panelBorderStyle === 'box') {
    panelStyle.border = `1px solid ${bColor}`;
  } else if (props.panelBorderStyle === 'left-accent') {
    panelStyle.borderLeft = `4px solid ${props.panelBorderColor || '#6CD4BC'}`;
    if (props.panelBorderColor) {
      panelStyle.borderBottom = `1px solid ${dividerColor}`;
    }
  } else if (props.panelBorderStyle === 'bottom' || props.panelBorderColor) {
    panelStyle.borderBottom = `1px solid ${bColor}`;
  }
  if (props.panelRadius !== undefined) {
    panelStyle.borderRadius = `${props.panelRadius}px`;
  }

  const avatarStyle: Record<string, string | number | undefined> = {};
  if (props.avatarShape === 'square') {
    avatarStyle.borderRadius = '0px';
    avatarStyle.clipPath = 'none';
  } else if (props.avatarShape === 'rounded') {
    avatarStyle.borderRadius = '8px';
    avatarStyle.clipPath = 'none';
  } else if (props.avatarShape === 'circle') {
    avatarStyle.borderRadius = '50%';
    avatarStyle.clipPath = 'none';
  } else if (props.avatarShape === 'diamond') {
    avatarStyle.borderRadius = '0px';
    avatarStyle.clipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
  }
  if (props.avatarBorderWidth !== undefined) {
    if (props.avatarBorderWidth > 0) {
      avatarStyle.border = `${props.avatarBorderWidth}px solid ${props.avatarBorderColor || '#888888'}`;
      avatarStyle.boxSizing = 'border-box';
    } else {
      avatarStyle.border = 'none';
    }
  } else if (props.avatarBorderColor) {
    avatarStyle.border = `2px solid ${props.avatarBorderColor}`;
    avatarStyle.boxSizing = 'border-box';
  }

  const textStyle: Record<string, string | number | undefined> = {};
  if (props.fontFamily) textStyle.fontFamily = props.fontFamily;
  if (props.fontSize) textStyle.fontSize = `${props.fontSize}px`;
  if (props.textColor) textStyle.color = props.textColor;
  if (props.fontWeight) textStyle.fontWeight = props.fontWeight;
  if (props.fontStyle) textStyle.fontStyle = props.fontStyle;

  const diceStyle: Record<string, string | number | undefined> = {};
  if (props.diceBgColor) {
    diceStyle.backgroundColor = props.diceBgColor;
    diceStyle.padding = '3px 8px';
    diceStyle.borderRadius = '4px';
    diceStyle.display = 'inline-block';
    diceStyle.marginTop = '4px';
  }
  if (props.diceTextColor) {
    diceStyle.color = props.diceTextColor;
  }
  if (props.diceBorderColor) {
    diceStyle.border = `1px solid ${props.diceBorderColor}`;
    diceStyle.padding = '3px 8px';
    diceStyle.borderRadius = '4px';
    diceStyle.display = 'inline-block';
    diceStyle.marginTop = '4px';
  }
  if (props.diceFontWeight) {
    diceStyle.fontWeight = props.diceFontWeight;
  }

  return {
    panelStyle,
    avatarStyle,
    speakerColor: props.speakerColor,
    textStyle,
    diceStyle,
  };
}

/**
 * camelCase 스타일 객체를 HTML style 속성용 CSS 문자열로 직렬화합니다.
 */
export function styleObjectToCssString(
  styleObj: Record<string, string | number | undefined>,
): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(styleObj)) {
    if (val === undefined || val === '') continue;
    const cssKey = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    parts.push(`${cssKey}:${val}`);
  }
  return parts.join(';');
}

/**
 * 두 MessageStyleProps를 병합합니다. override에 지정된(undefined나 빈 문자열이 아닌) 속성만 덮어씁니다.
 */
export function mergeMessageStyleProps(
  base: MessageStyleProps,
  override: MessageStyleProps,
): MessageStyleProps {
  const next: MessageStyleProps = { ...base };
  for (const [key, val] of Object.entries(override)) {
    if (val !== undefined && val !== '') {
      (next as Record<string, unknown>)[key] = val;
    }
  }
  return next;
}

/**
 * 프로젝트의 전역 스타일과 스타일 카드 목록을 기반으로 각 메시지의 최종 스타일을 계산하는 리졸버를 생성합니다.
 * - 카드 내부 필터들은 합연산(OR, 합집합)으로 동작합니다.
 * - 여러 스타일 카드가 동시에 일치하면 같은 속성끼리만 충돌하며, 목록 아래에 있는 스타일 카드가 우선합니다.
 * - 지정하지 않은 속성은 이전(상위) 스타일 결과를 그대로 유지합니다.
 */
export function createStyleResolver(
  styles: ProjectStyles | undefined,
  characters: Character[] = [],
  scenes: Scene[] = [],
  allBlocks: Block[] = [],
): (block: Block) => MessageStyleProps {
  if (!styles) {
    return () => ({});
  }
  const baseDefaults = styles.global.messageDefaults ?? {};
  const charMap = new Map(characters.map((c) => [c.id, c]));

  const compiledCards = styles.cards.map((card) => {
    const predicates: ((b: Block) => boolean)[] = [];
    for (const rawFilter of card.filters) {
      const sanitized = sanitizeLiveQuery(rawFilter);
      if (!sanitized) continue;
      try {
        predicates.push(compileQuery(sanitized, characters, scenes, allBlocks));
      } catch {
        try {
          predicates.push(compileQuery(rawFilter, characters, scenes, allBlocks));
        } catch {
          // 잘못된 필터는 건너뜀
        }
      }
    }
    return {
      card,
      matches: (b: Block): boolean => {
        if (b.styleIds?.includes(card.id)) return true;
        if (b.characterId && charMap.get(b.characterId)?.styleIds?.includes(card.id)) {
          return true;
        }
        if (predicates.length === 0) return false;
        // 필터끼리는 합연산(OR)
        return predicates.some((fn) => fn(b));
      },
    };
  });

  return (block: Block): MessageStyleProps => {
    let resolved: MessageStyleProps = { ...baseDefaults };
    for (const item of compiledCards) {
      if (item.matches(block)) {
        resolved = mergeMessageStyleProps(resolved, item.card.props);
      }
    }
    return resolved;
  };
}
