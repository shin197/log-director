import type { Block } from './core.ts';
export function compileQuery(query: string): (b: Block) => boolean {
  const tokens = query.match(/(?:[^\s"]|"[^"]*")+/g) ?? [];
  if ((query.match(/"/g)?.length ?? 0) % 2) throw Error('따옴표를 닫아주세요.');
  const checks = tokens.map((token) => {
    const negative = token.startsWith('-');
    if (negative) token = token.slice(1);
    const colon = token.indexOf(':');
    const key = colon < 0 ? 'all' : token.slice(0, colon);
    const value = (colon < 0 ? token : token.slice(colon + 1))
      .replace(/^"|"$/g, '')
      .toLowerCase();
    const fields: Record<string, (b: Block) => string> = {
      all: (b) => [b.speaker, b.text, b.diceResult].join('\n'),
      speaker: (b) => b.speaker ?? (b.sourceType === 'system' ? '시스템' : ''),
      화자: (b) => b.speaker ?? (b.sourceType === 'system' ? '시스템' : ''),
      text: (b) => b.text,
      내용: (b) => b.text,
      dice: (b) => b.diceResult,
      판정: (b) => b.diceResult,
      channel: (b) => b.channel ?? '',
      채널: (b) => b.channel ?? '',
    };
    if (!fields[key]) throw Error(`알 수 없는 검색 필드: ${key}`);
    if (!value) throw Error('검색어를 입력해주세요.');
    return (b: Block) => fields[key](b).toLowerCase().includes(value) !== negative;
  });
  return (b) => checks.every((check) => check(b));
}
export function reorder(
  blocks: Block[],
  id: string,
  target: string,
  after: boolean,
): Block[] {
  const item = blocks.find((b) => b.id === id);
  if (!item || id === target || !blocks.some((b) => b.id === target)) return blocks;
  const result = blocks.filter((b) => b.id !== id);
  const index = result.findIndex((b) => b.id === target);
  result.splice(index + (after ? 1 : 0), 0, item);
  return result;
}
