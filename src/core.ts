import { systemCharacter } from './systemCharacter.ts';
import { migrateCharacters } from './characters.ts';
import {
  isSafeImageUrl,
  parseHtmlLog,
  parseMarkdownLog,
  parseTxtLog,
} from './importFormats.ts';
import type { DisplaySettings } from './presentation';
export type Character = {
  id: string;
  name: string;
  iconUrl: string;
  color: string;
  faces: { name: string; iconUrl: string }[];
};
export type Block = {
  characterId?: string | null;
  id: string;
  sourceIndex?: number;
  speaker?: string;
  text: string;
  diceResult: string;
  color?: string;
  iconUrl?: string;
  timestamp?: string;
  channel?: string;
  sourceType?: string;
};
export type Project = {
  format: 'log-studio';
  version: 1;
  title: string;
  original: { name: string; raw: string } | null;
  blocks: Block[];
  characters?: Character[];
  display?: DisplaySettings;
  expressions?: { speaker: string; iconUrl: string; name: string }[];
};
export const blank = (): Project => ({
  format: 'log-studio',
  version: 1,
  title: '새 로그',
  original: null,
  blocks: [],
  characters: [systemCharacter()],
});
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
    return migrateCharacters({
      format: 'log-studio',
      version: 1,
      title,
      original: { name, raw },
      blocks,
    });
  }

  if (
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.markdown') ||
    (!trimmed.startsWith('{') &&
      (/^\s*#\s+/m.test(trimmed) || /^\*\*.+?\*\*.*:\s*$/m.test(trimmed)))
  ) {
    const { title, blocks } = parseMarkdownLog(cleaned, name);
    return migrateCharacters({
      format: 'log-studio',
      version: 1,
      title,
      original: { name, raw },
      blocks,
    });
  }

  if (
    lowerName.endsWith('.txt') ||
    (!lowerName.endsWith('.json') && !trimmed.startsWith('{') && !trimmed.startsWith('['))
  ) {
    const { title, blocks } = parseTxtLog(cleaned, name);
    return migrateCharacters({
      format: 'log-studio',
      version: 1,
      title,
      original: { name, raw },
      blocks,
    });
  }

  const d = JSON.parse(cleaned);
  if (d.format === 'log-studio') {
    if (
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
      !(
        d.original === null ||
        (typeof d.original?.raw === 'string' && typeof d.original?.name === 'string')
      )
    )
      throw Error('프로젝트 구조를 확인해주세요.');
    return migrateCharacters(d);
  }
  if (!Array.isArray(d.messages)) throw Error('messages 배열을 가진 JSON이 필요합니다.');
  const imagesMap =
    d.images && typeof d.images === 'object'
      ? (d.images as Record<string, unknown>)
      : null;
  return migrateCharacters({
    format: 'log-studio',
    version: 1,
    title: typeof d.title === 'string' ? d.title : name,
    original: { name, raw },
    blocks: d.messages.map((m: any, i: number) => {
      if (
        !m ||
        typeof m.text !== 'string' ||
        (m.speaker !== undefined &&
          !(m.type === 'system' && m.speaker === null) &&
          typeof m.speaker !== 'string') ||
        (m.diceResult !== undefined && typeof m.diceResult !== 'string')
      )
        throw Error(
          `${i + 1}번째 메시지 형식을 확인해주세요. 원본은 변경되지 않았습니다.`,
        );
      let iconUrl = '';
      if (typeof m.iconImage === 'string' && m.iconImage) {
        if (isSafeImageUrl(m.iconImage)) {
          iconUrl = m.iconImage;
        } else {
          const mapped = imagesMap?.[m.iconImage];
          if (typeof mapped === 'string' && isSafeImageUrl(mapped)) {
            iconUrl = mapped;
          }
        }
      } else if (typeof m.iconUrl === 'string') {
        iconUrl = m.iconUrl;
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
    }),
  });
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
