import type { Character } from './core.ts';
export function imageUrl(value: unknown): string {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string') throw Error('이미지 URL이 문자열이 아닙니다.');
  const raw = value.trim();
  const markdown = raw.match(/^\[[^\]]*\]\((https?:\/\/[^\s]+)\)$/);
  const url = markdown?.[1] ?? raw;
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw Error();
  } catch {
    throw Error('이미지는 http 또는 https URL이어야 합니다.');
  }
  return url;
}
export function parseClipboardCharacter(text: string): Character {
  let payload;
  try {
    payload = JSON.parse(text.trim());
  } catch {
    throw Error('올바른 코코포리아 캐릭터 JSON을 붙여넣어주세요.');
  }
  if (
    payload?.kind !== 'character' ||
    !payload.data ||
    typeof payload.data.name !== 'string' ||
    !payload.data.name.trim()
  )
    throw Error('캐릭터 이름이 포함된 kind: character 데이터가 필요합니다.');
  const data = payload.data;
  const color = data.color ?? '#888888';
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))
    throw Error('색상은 #RRGGBB 형식이어야 합니다.');
  if (data.faces !== undefined && !Array.isArray(data.faces))
    throw Error('표정 목록 형식이 올바르지 않습니다.');
  const faces: Character['faces'] = [];
  for (const face of data.faces ?? []) {
    const url = imageUrl(face?.iconUrl);
    if (url && !faces.some((f) => f.iconUrl === url))
      faces.push({
        name: typeof face.label === 'string' ? face.label : '',
        iconUrl: url,
      });
  }
  const iconUrl = imageUrl(data.iconUrl);
  if (iconUrl && !faces.some((f) => f.iconUrl === iconUrl))
    faces.unshift({ name: '', iconUrl });
  return {
    id: crypto.randomUUID(),
    name: data.name.trim(),
    color,
    iconUrl: iconUrl || faces[0]?.iconUrl || '',
    faces,
  };
}
