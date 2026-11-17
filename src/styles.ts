import type { Block, Character, Project, Scene } from './core.ts';
import {
  compileQuery,
  createStyleCardMatcher,
  formatChipDisplay,
  parseQueryToChipsAndText,
} from './query.ts';

export type AvatarShape = 'square' | 'rounded' | 'circle' | 'diamond';
export type PanelShape = 'square' | 'rounded';
export type PanelBorderStyle = 'bottom' | 'box' | 'left-accent' | 'none';
export type BorderLineStyle = 'solid' | 'dashed' | 'dotted';
export type TextAlignOption = 'left' | 'center' | 'right';
export type FontWeightOption = 'normal' | 'bold';
export type FontStyleOption = 'normal' | 'italic';

export type MessageStyleProps = {
  fontFamily?: string;
  fontSize?: number;
  textColor?: string;
  fontWeight?: FontWeightOption;
  fontStyle?: FontStyleOption;
  textAlign?: TextAlignOption;
  speakerColor?: string;
  speakerFontSize?: number;
  panelShape?: PanelShape;
  panelBgColor?: string;
  panelBorderColor?: string;
  panelBorderStyle?: PanelBorderStyle;
  panelBorderLineStyle?: BorderLineStyle;
  panelRadius?: number;
  panelPaddingY?: number;
  panelPaddingX?: number;
  avatarHidden?: boolean;
  avatarSize?: number;
  avatarShape?: AvatarShape;
  avatarBgColor?: string;
  avatarBorderColor?: string;
  avatarBorderWidth?: number;
  avatarBorderLineStyle?: BorderLineStyle;
  diceBgColor?: string;
  diceTextColor?: string;
  diceBorderColor?: string;
  diceBorderStyle?: PanelBorderStyle;
  diceBorderLineStyle?: BorderLineStyle;
  diceFontWeight?: FontWeightOption;
  diceAlign?: TextAlignOption;
};

export type GlobalStyleConfig = {
  pageBgColor: string;
  containerWidth: number;
  messageGap: number;
  titleColor: string;
  titleSize: number;
  titleAlign: 'left' | 'center';
  metaColor: string;
  dividerColor: string;
  systemTextColor: string;
  messageDefaults: MessageStyleProps;
  systemDefaults: MessageStyleProps;
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
  | { kind: 'messages'; count: number; label: string };

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
    messageGap: 0,
    titleColor: '#EEEEEE',
    titleSize: 24,
    titleAlign: 'left',
    metaColor: '#888888',
    dividerColor: '#262626',
    systemTextColor: '#888888',
    messageDefaults: {},
    systemDefaults: {},
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
const VALID_PANEL_SHAPES = new Set<PanelShape>(['square', 'rounded']);
const VALID_BORDER_STYLES = new Set<PanelBorderStyle>([
  'bottom',
  'box',
  'left-accent',
  'none',
]);
const VALID_FONT_WEIGHTS = new Set<FontWeightOption>(['normal', 'bold']);
const VALID_FONT_STYLES = new Set<FontStyleOption>(['normal', 'italic']);
const VALID_BORDER_LINE_STYLES = new Set<BorderLineStyle>(['solid', 'dashed', 'dotted']);
const VALID_TEXT_ALIGNS = new Set<TextAlignOption>(['left', 'center', 'right']);

function normalizeBorderColorValue(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed === 'none' || trimmed === 'speaker') return trimmed;
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  return undefined;
}

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
  if (VALID_TEXT_ALIGNS.has(raw.textAlign)) {
    out.textAlign = raw.textAlign;
  }
  if (
    typeof raw.speakerColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(raw.speakerColor)
  ) {
    out.speakerColor = raw.speakerColor.toUpperCase();
  }
  if (
    typeof raw.speakerFontSize === 'number' &&
    Number.isFinite(raw.speakerFontSize) &&
    raw.speakerFontSize >= 10 &&
    raw.speakerFontSize <= 36
  ) {
    out.speakerFontSize = Math.round(raw.speakerFontSize);
  }
  if (VALID_PANEL_SHAPES.has(raw.panelShape)) {
    out.panelShape = raw.panelShape;
  }
  if (
    typeof raw.panelBgColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(raw.panelBgColor)
  ) {
    out.panelBgColor = raw.panelBgColor.toUpperCase();
  }
  const panelBorderColor = normalizeBorderColorValue(raw.panelBorderColor);
  if (panelBorderColor) {
    out.panelBorderColor = panelBorderColor;
  }
  if (VALID_BORDER_STYLES.has(raw.panelBorderStyle)) {
    out.panelBorderStyle = raw.panelBorderStyle;
  }
  if (VALID_BORDER_LINE_STYLES.has(raw.panelBorderLineStyle)) {
    out.panelBorderLineStyle = raw.panelBorderLineStyle;
  }
  if (
    typeof raw.panelRadius === 'number' &&
    Number.isFinite(raw.panelRadius) &&
    raw.panelRadius >= 0 &&
    raw.panelRadius <= 32
  ) {
    out.panelRadius = Math.round(raw.panelRadius);
  }
  if (
    typeof raw.panelPaddingY === 'number' &&
    Number.isFinite(raw.panelPaddingY) &&
    raw.panelPaddingY >= 0 &&
    raw.panelPaddingY <= 48
  ) {
    out.panelPaddingY = Math.round(raw.panelPaddingY);
  }
  if (
    typeof raw.panelPaddingX === 'number' &&
    Number.isFinite(raw.panelPaddingX) &&
    raw.panelPaddingX >= 0 &&
    raw.panelPaddingX <= 64
  ) {
    out.panelPaddingX = Math.round(raw.panelPaddingX);
  }
  if (typeof raw.avatarHidden === 'boolean') {
    out.avatarHidden = raw.avatarHidden;
  }
  if (
    typeof raw.avatarSize === 'number' &&
    Number.isFinite(raw.avatarSize) &&
    raw.avatarSize >= 16 &&
    raw.avatarSize <= 128
  ) {
    out.avatarSize = Math.round(raw.avatarSize);
  }
  if (VALID_AVATAR_SHAPES.has(raw.avatarShape)) {
    out.avatarShape = raw.avatarShape;
  }
  if (
    typeof raw.avatarBgColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(raw.avatarBgColor)
  ) {
    out.avatarBgColor = raw.avatarBgColor.toUpperCase();
  }
  const avatarBorderColor = normalizeBorderColorValue(raw.avatarBorderColor);
  if (avatarBorderColor) {
    out.avatarBorderColor = avatarBorderColor;
  }
  if (
    typeof raw.avatarBorderWidth === 'number' &&
    Number.isFinite(raw.avatarBorderWidth) &&
    raw.avatarBorderWidth >= 0 &&
    raw.avatarBorderWidth <= 10
  ) {
    out.avatarBorderWidth = Math.round(raw.avatarBorderWidth);
  }
  if (VALID_BORDER_LINE_STYLES.has(raw.avatarBorderLineStyle)) {
    out.avatarBorderLineStyle = raw.avatarBorderLineStyle;
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
  const diceBorderColor = normalizeBorderColorValue(raw.diceBorderColor);
  if (diceBorderColor) {
    out.diceBorderColor = diceBorderColor;
  }
  if (VALID_BORDER_STYLES.has(raw.diceBorderStyle)) {
    out.diceBorderStyle = raw.diceBorderStyle;
  }
  if (VALID_BORDER_LINE_STYLES.has(raw.diceBorderLineStyle)) {
    out.diceBorderLineStyle = raw.diceBorderLineStyle;
  }
  if (VALID_FONT_WEIGHTS.has(raw.diceFontWeight)) {
    out.diceFontWeight = raw.diceFontWeight;
  }
  if (VALID_TEXT_ALIGNS.has(raw.diceAlign)) {
    out.diceAlign = raw.diceAlign;
  }
  return out;
}

export function normalizeProjectStyles(raw: any): ProjectStyles | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const defGlobal = defaultGlobalStyle();
  const g = raw.global && typeof raw.global === 'object' ? raw.global : {};
  const rawSystemTextColor =
    typeof g.systemTextColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(g.systemTextColor)
      ? g.systemTextColor.toUpperCase()
      : defGlobal.systemTextColor;
  const systemDefaults = normalizeMessageStyleProps(g.systemDefaults);
  if (!systemDefaults.textColor && rawSystemTextColor !== defGlobal.systemTextColor) {
    systemDefaults.textColor = rawSystemTextColor;
  }
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
    messageGap:
      typeof g.messageGap === 'number' &&
      Number.isFinite(g.messageGap) &&
      g.messageGap >= 0 &&
      g.messageGap <= 48
        ? Math.round(g.messageGap)
        : defGlobal.messageGap,
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
    systemTextColor: systemDefaults.textColor ?? rawSystemTextColor,
    messageDefaults: normalizeMessageStyleProps(g.messageDefaults),
    systemDefaults,
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
  let messageCount = 0;
  for (const b of project.blocks) {
    if (b.styleIds?.includes(card.id)) {
      messageCount += 1;
    }
  }
  if (messageCount > 0) {
    usages.push({
      kind: 'messages',
      count: messageCount,
      label: `개별 메시지 ${messageCount}건`,
    });
  }
  return usages;
}

/**
 * 사용처 칩의 X 버튼을 눌렀을 때 해당 연결(필터·캐릭터·개별 메시지 전체)을 해제합니다.
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
      if (!b.styleIds?.includes(cardId)) return b;
      const nextIds = b.styleIds.filter((id) => id !== cardId);
      const copy = { ...b };
      if (nextIds.length > 0) copy.styleIds = nextIds;
      else delete copy.styleIds;
      return copy;
    }),
  };
}

function resolveBorderColor(
  raw: string | undefined,
  fallback: string,
  speakerColor?: string,
): string | undefined {
  if (raw === 'none') return undefined;
  if (raw === 'speaker') return speakerColor || fallback;
  return raw || fallback;
}

/**
 * MessageStyleProps를 화면/미리보기 렌더링용 인라인 스타일 묶음으로 변환합니다.
 */
export function buildMessageStyleObjects(
  props: MessageStyleProps,
  dividerColor = '#262626',
  speakerColor?: string,
): {
  panelStyle: Record<string, string | number | undefined>;
  avatarStyle: Record<string, string | number | undefined>;
  avatarFrameStyle: Record<string, string | number | undefined>;
  avatarInnerStyle: Record<string, string | number | undefined>;
  avatarShape?: AvatarShape;
  avatarHidden: boolean;
  speakerColor?: string;
  speakerFontSize?: number;
  textStyle: Record<string, string | number | undefined>;
  diceStyle: Record<string, string | number | undefined>;
} {
  const effectiveSpeakerColor = props.speakerColor || speakerColor;
  const panelStyle: Record<string, string | number | undefined> = {};
  if (props.panelBgColor) {
    panelStyle.backgroundColor = props.panelBgColor;
  }
  const panelLineStyle = props.panelBorderLineStyle || 'solid';
  const bColor = resolveBorderColor(props.panelBorderColor, dividerColor, effectiveSpeakerColor);
  if (props.panelBorderStyle === 'none' || props.panelBorderColor === 'none') {
    panelStyle.border = 'none';
    panelStyle.borderBottom = 'none';
  } else if (props.panelBorderStyle === 'box') {
    if (bColor) panelStyle.border = `1px ${panelLineStyle} ${bColor}`;
  } else if (props.panelBorderStyle === 'left-accent') {
    const accentColor =
      props.panelBorderColor && props.panelBorderColor !== 'none'
        ? (bColor ?? '#6CD4BC')
        : '#6CD4BC';
    panelStyle.borderLeft = `4px ${panelLineStyle} ${accentColor}`;
    if (props.panelBorderColor && props.panelBorderColor !== 'none') {
      panelStyle.borderBottom = `1px ${panelLineStyle} ${dividerColor}`;
    }
  } else if (
    props.panelBorderStyle === 'bottom' ||
    props.panelBorderColor ||
    props.panelBorderLineStyle
  ) {
    if (bColor) panelStyle.borderBottom = `1px ${panelLineStyle} ${bColor}`;
  }
  if (props.panelRadius !== undefined) {
    panelStyle.borderRadius = `${props.panelRadius}px`;
  } else if (props.panelShape === 'square') {
    panelStyle.borderRadius = '0px';
  } else if (props.panelShape === 'rounded') {
    panelStyle.borderRadius = '6px';
  }
  if (props.panelPaddingY !== undefined || props.panelPaddingX !== undefined) {
    panelStyle.padding = `${props.panelPaddingY ?? 16}px ${props.panelPaddingX ?? 0}px`;
  }
  if (!props.avatarHidden && props.avatarSize !== undefined) {
    panelStyle.gridTemplateColumns = `${props.avatarSize}px minmax(0, 1fr)`;
  }

  const avatarStyle: Record<string, string | number | undefined> = {};
  if (!props.avatarHidden && props.avatarSize !== undefined) {
    avatarStyle.width = `${props.avatarSize}px`;
    avatarStyle.height = `${props.avatarSize}px`;
  }
  if (props.avatarBgColor) {
    avatarStyle.backgroundColor = props.avatarBgColor;
  }
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
    avatarStyle.clipPath = 'none';
  }
  const avatarLineStyle = props.avatarBorderLineStyle || 'solid';
  const avBorderColor = resolveBorderColor(
    props.avatarBorderColor,
    '#888888',
    effectiveSpeakerColor,
  );
  if (props.avatarBorderColor === 'none' || props.avatarBorderWidth === 0) {
    avatarStyle.border = 'none';
  } else if (
    (props.avatarBorderWidth !== undefined && props.avatarBorderWidth > 0) ||
    (props.avatarBorderColor && props.avatarBorderColor !== 'none')
  ) {
    const width = props.avatarBorderWidth ?? 2;
    avatarStyle.border = `${width}px ${avatarLineStyle} ${avBorderColor ?? '#888888'}`;
    avatarStyle.boxSizing = 'border-box';
  }

  // 인장 마름모 회전 및 내부 반대 회전(카운터 로테이션) 스타일 구성
  // 마름모 형태는 45도 회전 시 외곽 bounding box가 원래 크기(S)에 딱 맞도록
  // 틀(frame)을 1/sqrt(2) ≈ 70.7107% 크기로 줄여 45도 회전하고,
  // 내부 이미지/문구는 -45도로 역회전 및 sqrt(2) ≈ 141.4214% 크기로 채워 모서리 잘림을 방지합니다.
  const avatarFrameStyle: Record<string, string | number | undefined> = {};
  const avatarInnerStyle: Record<string, string | number | undefined> = {};

  if (props.avatarShape === 'diamond') {
    avatarFrameStyle.width = '70.7107%';
    avatarFrameStyle.height = '70.7107%';
    avatarFrameStyle.transform = 'rotate(45deg)';
    avatarFrameStyle.overflow = 'hidden';
    avatarFrameStyle.boxSizing = 'border-box';
    avatarFrameStyle.display = 'flex';
    avatarFrameStyle.alignItems = 'center';
    avatarFrameStyle.justifyContent = 'center';
    avatarFrameStyle.flexShrink = 0;
    if (props.avatarBgColor) {
      avatarFrameStyle.backgroundColor = props.avatarBgColor;
    }
    if (avatarStyle.border) {
      avatarFrameStyle.border = avatarStyle.border;
    }

    avatarInnerStyle.width = '141.4214%';
    avatarInnerStyle.height = '141.4214%';
    avatarInnerStyle.maxWidth = 'none';
    avatarInnerStyle.maxHeight = 'none';
    avatarInnerStyle.transform = 'rotate(-45deg)';
    avatarInnerStyle.transformOrigin = 'center center';
    avatarInnerStyle.objectFit = 'cover';
    avatarInnerStyle.flexShrink = 0;
    avatarInnerStyle.display = 'block';
  } else {
    avatarFrameStyle.width = '100%';
    avatarFrameStyle.height = '100%';
    avatarFrameStyle.overflow = 'hidden';
    avatarFrameStyle.boxSizing = 'border-box';
    if (avatarStyle.borderRadius) {
      avatarFrameStyle.borderRadius = avatarStyle.borderRadius;
    }
    if (props.avatarBgColor) {
      avatarFrameStyle.backgroundColor = props.avatarBgColor;
    }
    if (avatarStyle.border) {
      avatarFrameStyle.border = avatarStyle.border;
    }

    avatarInnerStyle.width = '100%';
    avatarInnerStyle.height = '100%';
    avatarInnerStyle.objectFit = 'cover';
    avatarInnerStyle.display = 'block';
  }

  const textStyle: Record<string, string | number | undefined> = {};
  if (props.fontFamily) textStyle.fontFamily = props.fontFamily;
  if (props.fontSize) textStyle.fontSize = `${props.fontSize}px`;
  if (props.textColor) textStyle.color = props.textColor;
  if (props.fontWeight) textStyle.fontWeight = props.fontWeight;
  if (props.fontStyle) textStyle.fontStyle = props.fontStyle;
  if (props.textAlign) textStyle.textAlign = props.textAlign;

  const diceStyle: Record<string, string | number | undefined> = {};
  const hasDiceBox = Boolean(
    props.diceBgColor ||
      (props.diceBorderStyle && props.diceBorderStyle !== 'none') ||
      (props.diceBorderColor && props.diceBorderColor !== 'none'),
  );
  if (props.diceBgColor) {
    diceStyle.backgroundColor = props.diceBgColor;
  }
  if (props.diceTextColor) {
    diceStyle.color = props.diceTextColor;
  }
  const diceLineStyle = props.diceBorderLineStyle || 'solid';
  const dBorderColor = resolveBorderColor(
    props.diceBorderColor,
    '#48BFA4',
    effectiveSpeakerColor,
  );
  if (props.diceBorderStyle === 'none' || props.diceBorderColor === 'none') {
    diceStyle.border = 'none';
    diceStyle.borderLeft = 'none';
    diceStyle.borderBottom = 'none';
  } else if (props.diceBorderStyle === 'left-accent') {
    diceStyle.borderLeft = `2px ${diceLineStyle} ${dBorderColor ?? '#48BFA4'}`;
  } else if (props.diceBorderStyle === 'bottom') {
    diceStyle.borderBottom = `1px ${diceLineStyle} ${dBorderColor ?? '#48BFA4'}`;
  } else if (
    props.diceBorderStyle === 'box' ||
    (props.diceBorderColor && props.diceBorderColor !== 'none')
  ) {
    diceStyle.border = `1px ${diceLineStyle} ${dBorderColor ?? '#48BFA4'}`;
  }
  if (hasDiceBox) {
    diceStyle.padding = '3px 8px';
    diceStyle.borderRadius =
      props.diceBorderStyle === 'left-accent' ? '0 4px 4px 0' : '4px';
    diceStyle.display = props.diceAlign ? 'block' : 'inline-block';
    diceStyle.marginTop = '4px';
  }
  if (props.diceFontWeight) {
    diceStyle.fontWeight = props.diceFontWeight;
  }
  if (props.diceAlign) {
    diceStyle.textAlign = props.diceAlign;
  }

  return {
    panelStyle,
    avatarStyle,
    avatarFrameStyle,
    avatarInnerStyle,
    avatarShape: props.avatarShape,
    avatarHidden: Boolean(props.avatarHidden),
    speakerColor: props.speakerColor,
    speakerFontSize: props.speakerFontSize,
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
 * 전역 설정으로부터 시스템 메시지의 기본 스타일을 조합합니다.
 * 일반 메시지의 글꼴·크기는 상속하되, 패널·아바타·일반 대사 색상은 분리하고
 * 시스템 메시지 전용 스타일(`systemDefaults`)을 최우선으로 적용합니다.
 */
export function resolveSystemBaseStyle(global: GlobalStyleConfig): MessageStyleProps {
  const msg = global.messageDefaults ?? {};
  const sys = global.systemDefaults ?? {};
  return mergeMessageStyleProps(
    {
      fontFamily: msg.fontFamily,
      fontSize: msg.fontSize,
      textColor: global.systemTextColor,
    },
    sys,
  );
}

/**
 * 프로젝트의 전역 스타일과 스타일 카드 목록을 기반으로 각 메시지의 최종 스타일을 계산하는 리졸버를 생성합니다.
 * - 일반 메시지는 `global.messageDefaults`, 시스템 메시지는 `global.systemDefaults`를 기본층으로 사용합니다.
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
  const normalDefaults = styles.global.messageDefaults ?? {};
  const systemDefaults = resolveSystemBaseStyle(styles.global);
  const charMap = new Map(characters.map((c) => [c.id, c]));

  const compiledCards = styles.cards.map((card) => ({
    card,
    matches: createStyleCardMatcher(
      card,
      characters,
      scenes,
      allBlocks,
      styles.cards,
      undefined,
      charMap,
    ),
  }));

  return (block: Block): MessageStyleProps => {
    let resolved: MessageStyleProps =
      block.sourceType === 'system' ? { ...systemDefaults } : { ...normalDefaults };
    for (const item of compiledCards) {
      if (item.matches(block)) {
        resolved = mergeMessageStyleProps(resolved, item.card.props);
      }
    }
    return resolved;
  };
}

export type StylePresetFile = {
  format: 'log-director-styles';
  version: 1;
  styles: ProjectStyles;
};

/**
 * Serializes project styles (global settings + style cards) into a standalone JSON preset.
 */
export function exportStylesConfig(styles: ProjectStyles | undefined): string {
  const payload: StylePresetFile = {
    format: 'log-director-styles',
    version: 1,
    styles: styles ?? defaultProjectStyles(),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Parses and validates an imported style preset JSON or project JSON's styles block.
 */
export function parseStylesConfig(rawText: string): ProjectStyles {
  let parsed: any;
  try {
    parsed = JSON.parse(rawText.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('올바른 JSON 형식의 스타일 설정 파일이 아닙니다.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('스타일 설정 구조를 확인할 수 없습니다.');
  }
  const candidate =
    parsed.format === 'log-director-styles' && parsed.styles
      ? parsed.styles
      : parsed.styles && typeof parsed.styles === 'object'
        ? parsed.styles
        : parsed;

  if (!candidate || typeof candidate !== 'object' || (!Array.isArray(candidate.cards) && !candidate.global)) {
    throw new Error('유효한 스타일 카드(cards) 또는 전역 스타일 정보가 없습니다.');
  }
  const normalized = normalizeProjectStyles(candidate);
  if (!normalized) {
    throw new Error('스타일 설정을 해석할 수 없습니다.');
  }
  return normalized;
}
