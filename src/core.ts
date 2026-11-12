export type Block = {
  id: string;
  sourceIndex?: number;
  speaker: string;
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
};
export const blank = (): Project => ({
  format: 'log-studio',
  version: 1,
  title: '새 로그',
  original: null,
  blocks: [],
});
export function parse(raw: string, name: string): Project {
  const d = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (d.format === 'log-studio') {
    if (
      d.version !== 1 ||
      typeof d.title !== 'string' ||
      !Array.isArray(d.blocks) ||
      !d.blocks.every(
        (b: any) =>
          typeof b.id === 'string' &&
          typeof b.text === 'string' &&
          typeof b.speaker === 'string' &&
          typeof b.diceResult === 'string',
      ) ||
      new Set(d.blocks.map((b: any) => b.id)).size !== d.blocks.length ||
      !(
        d.original === null ||
        (typeof d.original?.raw === 'string' && typeof d.original?.name === 'string')
      )
    )
      throw Error('프로젝트 구조를 확인해주세요.');
    return d;
  }
  if (!Array.isArray(d.messages)) throw Error('messages 배열을 가진 JSON이 필요합니다.');
  return {
    format: 'log-studio',
    version: 1,
    title: typeof d.title === 'string' ? d.title : name,
    original: { name, raw },
    blocks: d.messages.map((m: any, i: number) => {
      if (
        !m ||
        typeof m.text !== 'string' ||
        (m.speaker !== undefined && typeof m.speaker !== 'string') ||
        (m.diceResult !== undefined && typeof m.diceResult !== 'string')
      )
        throw Error(
          `${i + 1}번째 메시지 형식을 확인해주세요. 원본은 변경되지 않았습니다.`,
        );
      return {
        id: crypto.randomUUID(),
        sourceIndex: i,
        speaker: m.speaker ?? '시스템',
        text: m.text,
        diceResult: m.diceResult ?? '',
        color: typeof m.color === 'string' ? m.color : '',
        iconUrl: typeof m.iconUrl === 'string' ? m.iconUrl : '',
        timestamp: typeof m.timestamp === 'string' ? m.timestamp : '',
        channel: typeof m.channelName === 'string' ? m.channelName : '',
        sourceType: typeof m.type === 'string' ? m.type : '',
      };
    }),
  };
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
