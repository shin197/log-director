import { systemCharacter } from './systemCharacter.ts';
import { migrateCharacters } from './characters.ts';
import { normalizeScenes } from './scenes.ts';
import {
  isSafeImageUrl,
  parseHtmlLog,
  parseMarkdownLog,
  parseTxtLog,
} from './importFormats.ts';
import {
  type ImagePool,
  internImageUrl,
  normalizeProjectImagePool,
} from './imagePool.ts';
import type { DisplaySettings } from './presentation';
import { normalizeProjectStyles, type ProjectStyles } from './styles.ts';
export type Character = {
  id: string;
  name: string;
  iconUrl: string;
  color: string;
  faces: { name: string; iconUrl: string }[];
  styleIds?: string[];
};
export type Block = {
  characterId?: string | null;
  id: string;
  sourceIndex?: number;
  sourceFileIndex?: number;
  speaker?: string;
  text: string;
  diceResult: string;
  color?: string;
  iconUrl?: string;
  timestamp?: string;
  channel?: string;
  sourceType?: string;
  styleIds?: string[];
};
export type Scene = {
  id: string;
  name: string;
  messageId: string;
};
export type OriginalFile = {
  name: string;
  raw: string;
};
export type QuickCharacterSlot = {
  speaker: string;
  characterId: string | null;
  iconUrl: string;
  color?: string;
};
export const PROJECT_FORMAT = 'log-director' as const;
export const LEGACY_PROJECT_FORMAT = 'log-studio' as const;
export type ProjectFormat = typeof PROJECT_FORMAT | typeof LEGACY_PROJECT_FORMAT;

export type Project = {
  format: ProjectFormat;
  version: 1;
  title: string;
  original: OriginalFile[];
  images?: ImagePool;
  blocks: Block[];
  characters?: Character[];
  scenes?: Scene[];
  styles?: ProjectStyles;
  display?: DisplaySettings;
  quickSlots?: Record<string, QuickCharacterSlot>;
  expressions?: { speaker: string; iconUrl: string; name: string }[];
};
export const blank = (): Project => ({
  format: PROJECT_FORMAT,
  version: 1,
  title: '새 로그',
  original: [],
  blocks: [],
  characters: [systemCharacter()],
});
export function validateLogStudioProject(d: any): Project {
  if (
    !d ||
    (d.format !== PROJECT_FORMAT && d.format !== LEGACY_PROJECT_FORMAT) ||
    d.version !== 1 ||
    typeof d.title !== 'string' ||
    !Array.isArray(d.blocks) ||
    !d.blocks.every(
      (b: any) =>
        typeof b.id === 'string' &&
        typeof b.text === 'string' &&
        (typeof b.speaker === 'string' ||
          (b.speaker == null && b.sourceType === 'system')) &&
        typeof b.diceResult === 'string',
    ) ||
    new Set(d.blocks.map((b: any) => b.id)).size !== d.blocks.length ||
    !Array.isArray(d.original) ||
    !d.original.every(
      (o: any) => o && typeof o.raw === 'string' && typeof o.name === 'string',
    ) ||
    (d.images !== undefined &&
      (!d.images ||
        typeof d.images !== 'object' ||
        Array.isArray(d.images) ||
        !Object.values(d.images).every((v: unknown) => typeof v === 'string')))
  )
    throw Error('프로젝트 구조를 확인해주세요.');
  const migrated = migrateCharacters({ ...d, format: PROJECT_FORMAT });
  if (Array.isArray(d.scenes)) {
    migrated.scenes = normalizeScenes(d.scenes, migrated.blocks);
  }
  if (d.styles && typeof d.styles === 'object') {
    migrated.styles = normalizeProjectStyles(d.styles);
  }
  if (d.quickSlots && typeof d.quickSlots === 'object' && !Array.isArray(d.quickSlots)) {
    const cleanSlots: Record<string, QuickCharacterSlot> = {};
    for (const [k, v] of Object.entries(d.quickSlots)) {
      if (!/^[1-9]$/.test(k) || !v || typeof v !== 'object') continue;
      const item = v as any;
      if (typeof item.speaker !== 'string') continue;
      cleanSlots[k] = {
        speaker: item.speaker,
        characterId: typeof item.characterId === 'string' ? item.characterId : null,
        iconUrl: typeof item.iconUrl === 'string' ? item.iconUrl : '',
        ...(typeof item.color === 'string' && item.color ? { color: item.color } : {}),
      };
    }
    if (Object.keys(cleanSlots).length > 0) {
      migrated.quickSlots = cleanSlots;
    } else {
      delete migrated.quickSlots;
    }
  }
  return normalizeProjectImagePool(migrated);
}

export function parse(raw: string, name: string): Project {
  const cleaned = raw.replace(/^\uFEFF/, '');
  const trimmed = cleaned.trimStart();
  const lowerName = name.toLowerCase();

  if (
    lowerName.endsWith('.html') ||
    lowerName.endsWith('.htm') ||
    trimmed.startsWith('<')
  ) {
    const { title, blocks } = parseHtmlLog(cleaned, name);
    return normalizeProjectImagePool(
      migrateCharacters({
        format: PROJECT_FORMAT,
        version: 1,
        title,
        original: [{ name, raw }],
        blocks,
      }),
    );
  }

  if (
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.markdown') ||
    (!trimmed.startsWith('{') &&
      (/^\s*#\s+/m.test(trimmed) || /^\*\*.+?\*\*.*:\s*$/m.test(trimmed)))
  ) {
    const { title, blocks } = parseMarkdownLog(cleaned, name);
    return normalizeProjectImagePool(
      migrateCharacters({
        format: PROJECT_FORMAT,
        version: 1,
        title,
        original: [{ name, raw }],
        blocks,
      }),
    );
  }

  if (
    lowerName.endsWith('.txt') ||
    (!lowerName.endsWith('.json') && !trimmed.startsWith('{') && !trimmed.startsWith('['))
  ) {
    const { title, blocks } = parseTxtLog(cleaned, name);
    return normalizeProjectImagePool(
      migrateCharacters({
        format: PROJECT_FORMAT,
        version: 1,
        title,
        original: [{ name, raw }],
        blocks,
      }),
    );
  }

  const d = JSON.parse(cleaned);
  if (d.format === PROJECT_FORMAT || d.format === LEGACY_PROJECT_FORMAT) {
    return validateLogStudioProject(d);
  }
  if (!Array.isArray(d.messages)) throw Error('messages 배열을 가진 JSON이 필요합니다.');
  const imagesMap =
    d.images && typeof d.images === 'object'
      ? (d.images as Record<string, unknown>)
      : null;
  const pool: ImagePool = {};
  const internCache = new Map<string, string>();
  const resolvedSourceCache = new Map<string, string>();
  const resolveAndIntern = (rawUrl: string): string => {
    const hit = resolvedSourceCache.get(rawUrl);
    if (hit !== undefined) return hit;
    const ref = internImageUrl(rawUrl, pool, internCache);
    resolvedSourceCache.set(rawUrl, ref);
    return ref;
  };
  const blocks: Block[] = d.messages.map((m: any, i: number) => {
    if (
      !m ||
      typeof m.text !== 'string' ||
      (m.speaker !== undefined &&
        !(m.type === 'system' && m.speaker === null) &&
        typeof m.speaker !== 'string') ||
      (m.diceResult !== undefined && typeof m.diceResult !== 'string')
    )
      throw Error(`${i + 1}번째 메시지 형식을 확인해주세요. 원본은 변경되지 않았습니다.`);
    let iconUrl = '';
    if (typeof m.iconImage === 'string' && m.iconImage) {
      if (isSafeImageUrl(m.iconImage)) {
        iconUrl = resolveAndIntern(m.iconImage);
      } else {
        const mapped = imagesMap?.[m.iconImage];
        if (typeof mapped === 'string' && isSafeImageUrl(mapped)) {
          iconUrl = resolveAndIntern(mapped);
        }
      }
    } else if (typeof m.iconUrl === 'string') {
      iconUrl = resolveAndIntern(m.iconUrl);
    }
    return {
      id: crypto.randomUUID(),
      sourceIndex: i,
      ...(m.type === 'system' ? {} : { speaker: m.speaker ?? '' }),
      text: m.text,
      diceResult: m.diceResult ?? '',
      color: typeof m.color === 'string' ? m.color : '',
      iconUrl,
      timestamp: typeof m.timestamp === 'string' ? m.timestamp : '',
      channel: typeof m.channelName === 'string' ? m.channelName.trim() : '',
      sourceType: typeof m.type === 'string' ? m.type : '',
    };
  });
  return normalizeProjectImagePool(
    migrateCharacters({
      format: PROJECT_FORMAT,
      version: 1,
      title: typeof d.title === 'string' ? d.title : name,
      original: [{ name, raw }],
      ...(Object.keys(pool).length > 0 ? { images: pool } : {}),
      blocks,
    }),
  );
}
export function replaceBlocks(
  p: Project,
  ids: Set<string>,
  find: string,
  to: string,
): Project {
  if (!find) return p;
  return {
    ...p,
    blocks: p.blocks.map((b) =>
      ids.has(b.id) ? { ...b, text: b.text.split(find).join(to) } : b,
    ),
  };
}
