import type { Block } from './core.ts';

export function isSafeImageUrl(url?: string): boolean {
  if (!url) return false;
  return /^(https?:\/\/|data:image\/(?:png|jpe?g|gif|webp|avif|bmp|ico);base64,[A-Za-z0-9+/=\s]+$)/i.test(
    url.trim(),
  );
}

function decodeHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function normalizeChannel(raw: string, label?: string): string {
  const cleanLabel = label?.replace(/^\[|\]$/g, '').trim();
  if (cleanLabel) return cleanLabel;
  const trimmed = raw.trim();
  if (trimmed === 'main') return '메인';
  if (trimmed === 'other') return '잡담';
  return trimmed;
}

function unescapeMarkdown(s: string): string {
  return s.replace(/\\([\\`*_{}[\]<>#!|])/g, '$1');
}

export function parseHtmlLog(
  raw: string,
  filename: string,
): { title: string; blocks: Block[] } {
  const h1Match = raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = h1Match?.[1] ?? titleMatch?.[1] ?? filename;
  const title = decodeHtml(rawTitle).trim() || filename;

  // <style> 내 .avatar-image-N { background-image: url("..."); } 추출 (base64 포함)
  const avatarMap = new Map<string, string>();
  const avatarRegex =
    /\.(avatar-image-\d+)\s*\{\s*background-image:\s*url\((["']?)([\s\S]*?)\2\)\s*;?\s*\}/gi;
  let avMatch: RegExpExecArray | null;
  while ((avMatch = avatarRegex.exec(raw)) !== null) {
    avatarMap.set(avMatch[1], avMatch[3].trim());
  }

  // 1) <article class="message ..."> 포맷 (html_sample, html_ccf_sample, 내보내기 HTML)
  const articleRegex = /<article\b([^>]*)>([\s\S]*?)<\/article>/gi;
  const articles = [...raw.matchAll(articleRegex)];
  if (articles.length > 0) {
    const blocks: Block[] = [];
    for (let i = 0; i < articles.length; i++) {
      const attrs = articles[i][1];
      const inner = articles[i][2];
      const classMatch = attrs.match(/class\s*=\s*(["'])(.*?)\1/i);
      const classes = classMatch?.[2] ?? '';
      const isSystem = /\bsystem\b/i.test(classes);

      const dataChannelMatch = attrs.match(/data-channel\s*=\s*(["'])(.*?)\1/i);
      const channelSpanMatch = inner.match(
        /<span[^>]*class\s*=\s*(["'])[^"']*\bchannel-name\b[^"']*\1[^>]*>([\s\S]*?)<\/span>/i,
      );
      const channel = normalizeChannel(
        dataChannelMatch?.[2] ?? '',
        channelSpanMatch ? decodeHtml(channelSpanMatch[2]) : undefined,
      );

      // 본문 텍스트 수집 (한 메시지 내 여러 message-text div가 있을 수 있음)
      // 시스템 메시지 등은 message-text 내부에 <span class="channel-name">[메인]</span>을 포함할 수 있으므로 제거
      const textParts = [
        ...inner.matchAll(
          /<div[^>]*class\s*=\s*(["'])[^"']*\bmessage-text\b[^"']*\1[^>]*>([\s\S]*?)<\/div>/gi,
        ),
      ].map((m) =>
        decodeHtml(
          m[2].replace(
            /<span[^>]*class\s*=\s*(["'])[^"']*\bchannel-name\b[^"']*\1[^>]*>[\s\S]*?<\/span>/gi,
            '',
          ),
        ).replace(/^\n+|\n+$/g, ''),
      );

      // 주사위 판정 결과 수집 (span.roll-result 또는 div.roll-result)
      const diceParts = [
        ...inner.matchAll(
          /<(?:span|div)[^>]*class\s*=\s*(["'])[^"']*\broll-result\b[^"']*\1[^>]*>([\s\S]*?)<\/(?:span|div)>/gi,
        ),
      ].map((m) => decodeHtml(m[2]).trim());

      const text = textParts.join('\n');
      const diceResult = diceParts.filter(Boolean).join('\n');

      if (isSystem) {
        blocks.push({
          id: crypto.randomUUID(),
          sourceIndex: i,
          text,
          diceResult,
          color: '',
          iconUrl: '',
          timestamp: '',
          channel,
          sourceType: 'system',
        });
        continue;
      }

      // 화자 및 색상 추출
      let speaker = '';
      let color = '';
      const speakerSpan = inner.match(
        /<span[^>]*class\s*=\s*(["'])[^"']*\bspeaker\b[^"']*\1([^>]*)>([\s\S]*?)<\/span>/i,
      );
      if (speakerSpan) {
        speaker = decodeHtml(speakerSpan[3]).trim();
        const colorMatch = speakerSpan[2].match(
          /--speaker-color\s*:\s*(#[0-9a-f]{3,8})/i,
        );
        if (colorMatch) color = colorMatch[1];
      } else {
        const strongMatch = inner.match(/<strong([^>]*)>([\s\S]*?)<\/strong>/i);
        if (strongMatch) {
          speaker = decodeHtml(strongMatch[2]).trim();
          const colorMatch = strongMatch[1].match(/color\s*:\s*(#[0-9a-f]{3,8})/i);
          if (colorMatch) color = colorMatch[1];
        }
      }

      // 아바타 이미지 추출 (CSS 클래스 매핑 또는 <img>)
      let iconUrl = '';
      const avatarClassMatch = inner.match(/\b(avatar-image-\d+)\b/);
      if (avatarClassMatch && avatarMap.has(avatarClassMatch[1])) {
        iconUrl = avatarMap.get(avatarClassMatch[1]) ?? '';
      } else {
        const imgMatch = inner.match(/<img[^>]*src\s*=\s*(["'])([\s\S]*?)\1/i);
        if (imgMatch) iconUrl = decodeHtml(imgMatch[2]).trim();
      }

      // 타임스탬프 추출
      const timeMatch = inner.match(/<time[^>]*>([\s\S]*?)<\/time>/i);
      const timestamp = timeMatch ? decodeHtml(timeMatch[1]).trim() : '';

      blocks.push({
        id: crypto.randomUUID(),
        sourceIndex: i,
        speaker,
        text,
        diceResult,
        color,
        iconUrl,
        timestamp,
        channel,
        sourceType: 'normal',
      });
    }
    return { title, blocks };
  }

  // 2) 코코포리아 Raw HTML (<p style="color:...;"><span>[채널]</span><span>화자</span> : <span>본문</span></p>)
  const pRegex = /<p([^>]*)>([\s\S]*?)<\/p>/gi;
  const paragraphs = [...raw.matchAll(pRegex)];
  if (paragraphs.length > 0) {
    const blocks: Block[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const attrs = paragraphs[i][1];
      const inner = paragraphs[i][2];
      const spans = [...inner.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)].map((m) =>
        decodeHtml(m[1]),
      );
      if (spans.length < 2) continue;

      const colorMatch = attrs.match(/color\s*:\s*(#[0-9a-f]{3,8})/i);
      const color = colorMatch?.[1] ?? '';

      let channel = '';
      let speaker = '';
      let text = '';

      if (spans.length >= 3) {
        channel = normalizeChannel(spans[0].replace(/^\[|\]$/g, '').trim());
        speaker = spans[1].trim();
        text = spans.slice(2).join('\n').trim();
      } else {
        speaker = spans[0].trim();
        text = spans[1].trim();
      }

      blocks.push({
        id: crypto.randomUUID(),
        sourceIndex: i,
        speaker,
        text,
        diceResult: '',
        color,
        iconUrl: '',
        timestamp: '',
        channel,
        sourceType: 'normal',
      });
    }
    if (blocks.length > 0) return { title, blocks };
  }

  throw Error('지원하는 HTML 로그 구조를 찾을 수 없습니다.');
}

export function parseMarkdownLog(
  raw: string,
  filename: string,
): { title: string; blocks: Block[] } {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  let title = filename;
  let startIdx = 0;

  // 상단 제목(# ...)과 구분선(---) 파싱
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('# ')) {
      title = unescapeMarkdown(line.slice(2).trim()) || filename;
      startIdx = i + 1;
      continue;
    }
    if (line === '---') {
      startIdx = i + 1;
      break;
    }
    break;
  }

  const blocks: Block[] = [];
  let i = startIdx;
  const mdHeaderRe =
    /^\*\*(.+?)\*\*(?:\s+\*\((.+?)\)\*)?(?:\s+\*\[([^\]]*)\]\*)?\s*:\s*$/;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    // 1) 시스템 인용 블록 (> *[채널]* ... 또는 > ...)
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      let channel = '';
      if (quoteLines.length > 0) {
        const chPrefix = quoteLines[0].match(/^\*\[([^\]]*)\]\*\s*/);
        if (chPrefix) {
          channel = chPrefix[1].trim();
          quoteLines[0] = quoteLines[0].slice(chPrefix[0].length);
        }
      }
      const textLines: string[] = [];
      const diceLines: string[] = [];
      for (const qLine of quoteLines) {
        const diceMatch = qLine.match(/^`(.+)`$/);
        if (diceMatch && qLine.includes('＞')) {
          diceLines.push(unescapeMarkdown(diceMatch[1]));
        } else {
          textLines.push(unescapeMarkdown(qLine));
        }
      }
      blocks.push({
        id: crypto.randomUUID(),
        sourceIndex: blocks.length,
        text: textLines.join('\n'),
        diceResult: diceLines.join('\n'),
        color: '',
        iconUrl: '',
        timestamp: '',
        channel,
        sourceType: 'system',
      });
      continue;
    }

    // 2) 일반 메시지 헤더: **화자** *(시각)* *[채널]* : 또는 **화자** *(시각 [채널])* : 또는 **화자** :
    const headerMatch = line.match(mdHeaderRe);
    if (headerMatch) {
      const speaker = unescapeMarkdown(headerMatch[1].trim());
      const metaRaw = headerMatch[2] ? unescapeMarkdown(headerMatch[2].trim()) : '';

      let channel = headerMatch[3] ? unescapeMarkdown(headerMatch[3].trim()) : '';
      let timestamp = metaRaw;
      if (!channel && metaRaw) {
        const chMatch = metaRaw.match(/\[([^\]]*)\]/);
        if (chMatch) {
          channel = chMatch[1].trim();
          timestamp = metaRaw.replace(chMatch[0], '').trim();
        }
      }

      i++;
      const bodyLines: string[] = [];
      while (i < lines.length) {
        const nextLine = lines[i];
        if (nextLine.startsWith('>') || mdHeaderRe.test(nextLine)) {
          break;
        }
        bodyLines.push(nextLine);
        i++;
      }

      while (bodyLines.length && !bodyLines[0].trim()) bodyLines.shift();
      while (bodyLines.length && !bodyLines[bodyLines.length - 1].trim()) bodyLines.pop();

      const textLines: string[] = [];
      const diceLines: string[] = [];
      for (const nextLine of bodyLines) {
        const diceMatch = nextLine.match(/^`(.+)`$/);
        if (diceMatch) {
          diceLines.push(unescapeMarkdown(diceMatch[1]));
        } else {
          textLines.push(unescapeMarkdown(nextLine));
        }
      }

      blocks.push({
        id: crypto.randomUUID(),
        sourceIndex: blocks.length,
        speaker,
        text: textLines.join('\n'),
        diceResult: diceLines.join('\n'),
        color: '',
        iconUrl: '',
        timestamp,
        channel,
        sourceType: 'normal',
      });
      continue;
    }

    // 예기치 않은 단독 텍스트 줄은 건너뜀
    i++;
  }

  if (!blocks.length) {
    throw Error('마크다운 로그에서 메시지를 찾을 수 없습니다.');
  }

  return { title, blocks };
}

const TXT_HEADER_RE = /^(.+?)(?:\s+\(([^)]+)\))?(?:\s+\[([^\]]*)\])?\s*:\s*$/;

export function parseTxtLog(
  raw: string,
  filename: string,
): { title: string; blocks: Block[] } {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  let title = filename;
  let startIdx = 0;

  // 상단 제목 + 구분선(====...) 파싱
  for (let i = 0; i < Math.min(lines.length - 1, 5); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^={5,}$/.test(lines[i + 1]?.trim() ?? '')) {
      title = line || filename;
      startIdx = i + 2;
    }
    break;
  }

  const isHeaderLine = (idx: number): RegExpMatchArray | null => {
    const line = lines[idx];
    const m = line.match(TXT_HEADER_RE);
    if (!m) return null;
    // 시각이나 채널이 명시되었거나, 이전 줄이 비어 있거나 시작 지점일 때만 헤더로 인정
    const hasMeta = m[2] !== undefined || m[3] !== undefined;
    const afterBlank = idx === startIdx || !lines[idx - 1]?.trim();
    return hasMeta || afterBlank ? m : null;
  };

  const blocks: Block[] = [];
  let i = startIdx;

  while (i < lines.length) {
    if (!lines[i].trim()) {
      i++;
      continue;
    }

    const header = isHeaderLine(i);
    if (!header) {
      i++;
      continue;
    }

    const rawSpeaker = header[1].trim();
    const timestamp = header[2]?.trim() ?? '';
    const channel = header[3]?.trim() ?? '';
    const isSystem = rawSpeaker === 'system';

    i++;
    const bodyLines: string[] = [];
    while (i < lines.length) {
      if (isHeaderLine(i)) break;
      bodyLines.push(lines[i]);
      i++;
    }

    while (bodyLines.length && !bodyLines[0].trim()) bodyLines.shift();
    while (bodyLines.length && !bodyLines[bodyLines.length - 1].trim()) bodyLines.pop();

    const textLines: string[] = [];
    const diceLines: string[] = [];
    for (const bodyLine of bodyLines) {
      if (bodyLine.includes('＞')) {
        diceLines.push(bodyLine.trim());
      } else {
        textLines.push(bodyLine);
      }
    }

    blocks.push({
      id: crypto.randomUUID(),
      sourceIndex: blocks.length,
      ...(isSystem ? {} : { speaker: rawSpeaker }),
      text: textLines.join('\n'),
      diceResult: diceLines.join('\n'),
      color: '',
      iconUrl: '',
      timestamp,
      channel,
      sourceType: isSystem ? 'system' : 'normal',
    });
  }

  if (!blocks.length) {
    throw Error('TXT 로그에서 메시지를 찾을 수 없습니다.');
  }

  return { title, blocks };
}
