import { defaultDisplay, displayTime } from './presentation.ts';
import { isSafeImageUrl } from './importFormats.ts';
import { compileQuery, sanitizeLiveQuery } from './query.ts';
import type { Project, Block } from './core';

export type ExportFormat = 'html' | 'txt' | 'json' | 'md';

export type ExportOptions = {
  query?: string;
  showSystemChannel?: boolean;
  encodeBase64?: boolean;
  urlToBase64?: Record<string, string>;
};

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const md = (s: string) => s.replace(/([\\`*_{}\[\]<>#!|])/g, '\\$1');

function hashDataUri(input: string): string {
  const seeds = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
    0x5be0cd19,
  ];
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    const idx = i & 7;
    seeds[idx] = Math.imul(seeds[idx] ^ code, 0x01000193) >>> 0;
    seeds[(idx + 1) & 7] =
      (seeds[(idx + 1) & 7] + ((seeds[idx] << 5) | (seeds[idx] >>> 27))) >>> 0;
  }
  return seeds.map((n) => n.toString(16).padStart(8, '0')).join('');
}

export function exportLog(
  p: Project,
  format: ExportFormat,
  options?: ExportOptions,
): string {
  const settings = { ...defaultDisplay, ...p.display };
  const showSystemChannel = options?.showSystemChannel ?? true;
  const encodeBase64 = options?.encodeBase64 ?? false;

  let targetBlocks = p.blocks;
  if (options?.query?.trim()) {
    try {
      const predicate = compileQuery(
        sanitizeLiveQuery(options.query),
        p.characters ?? [],
      );
      targetBlocks = p.blocks.filter(predicate);
    } catch {
      // 유효하지 않은 쿼리인 경우 전체 블록 유지
    }
  }

  const resolveIcon = (url?: string): string => {
    const raw = url?.trim() ?? '';
    if (!raw) return '';
    if (encodeBase64 && options?.urlToBase64?.[raw]) {
      return options.urlToBase64[raw];
    }
    return raw;
  };

  if (format === 'json') {
    let originals: Record<string, unknown>[] = [];
    try {
      originals =
        JSON.parse(p.original?.raw.replace(/^\uFEFF/, '') ?? '{}').messages ?? [];
    } catch {}

    const images: Record<string, string> = {};
    const dataUriToKey = new Map<string, string>();
    const getOrCreateImageKey = (dataUri: string, preferredKey?: string): string => {
      const existing = dataUriToKey.get(dataUri);
      if (existing) return existing;
      let key =
        preferredKey && !isSafeImageUrl(preferredKey) && !(preferredKey in images)
          ? preferredKey
          : hashDataUri(dataUri);
      while (key in images && images[key] !== dataUri) {
        key = hashDataUri(key + dataUri.length);
      }
      images[key] = dataUri;
      dataUriToKey.set(dataUri, key);
      return key;
    };

    const messages = targetBlocks.map((b) => {
      const source = b.sourceIndex === undefined ? {} : (originals[b.sourceIndex] ?? {});
      const m: Record<string, unknown> = {
        ...source,
        type: b.sourceType || 'normal',
        text: b.text,
      };
      const isSys = m.type === 'system';
      const showCh = isSys
        ? settings.showChannel && showSystemChannel
        : settings.showChannel;

      if (showCh) {
        m.channelName = b.channel ?? source.channelName ?? '';
        m.channel =
          m.channelName === source.channelName && source.channel !== undefined
            ? source.channel
            : m.channelName === '메인'
              ? 'main'
              : m.channelName === '잡담'
                ? 'other'
                : m.channelName;
      } else {
        delete m.channel;
        delete m.channelName;
      }

      if (b.timestamp !== source.timestamp) {
        delete m.createdAt;
      }
      if (b.timestamp) m.timestamp = b.timestamp;
      else delete m.timestamp;

      if (isSys) {
        delete m.speaker;
        delete m.color;
        delete m.iconUrl;
        delete m.iconImage;
      } else {
        m.speaker = b.speaker;
        m.color = b.color ?? '';
        const icon = resolveIcon(b.iconUrl);
        if (/^data:image\//i.test(icon)) {
          const preferred =
            typeof source.iconImage === 'string' ? source.iconImage : undefined;
          m.iconImage = getOrCreateImageKey(icon, preferred);
          delete m.iconUrl;
        } else {
          m.iconUrl = icon;
          delete m.iconImage;
        }
      }

      if (b.diceResult) m.diceResult = b.diceResult;
      else delete m.diceResult;
      if (b.diceResult !== source.diceResult) delete m.roll;

      const timestamp = displayTime(b.timestamp, settings);
      if (timestamp) m.timestamp = timestamp;
      else {
        delete m.timestamp;
        delete m.createdAt;
      }
      return m;
    });

    const payload: Record<string, unknown> = {
      title: p.title,
      messageCount: messages.length,
      messages,
    };
    if (Object.keys(images).length > 0) {
      payload.images = images;
    }
    return JSON.stringify(payload, null, 2);
  }

  if (format === 'txt') {
    return (
      `${p.title}\n========================================\n\n` +
      targetBlocks
        .map((b) => {
          const isSys = b.sourceType === 'system';
          const time = displayTime(b.timestamp, settings);
          const showCh = isSys
            ? settings.showChannel && showSystemChannel
            : settings.showChannel;
          const ch = showCh && b.channel ? `[${b.channel}]` : '';
          const speaker = isSys ? 'system' : (b.speaker ?? '');
          const header =
            [speaker, time ? `(${time})` : '', ch].filter(Boolean).join(' ') + ' :';
          const body = [b.text, b.diceResult].filter(Boolean).join('\n');
          return `${header}\n${body}`;
        })
        .join('\n\n') +
      '\n'
    );
  }

  if (format === 'md') {
    return (
      `# ${md(p.title)}\n\n---\n\n` +
      targetBlocks
        .map((b) => {
          if (b.sourceType === 'system') {
            const sysCh =
              settings.showChannel && showSystemChannel && b.channel
                ? `*[${md(b.channel)}]* `
                : '';
            const textLines = b.text ? b.text.split('\n').map(md) : [''];
            const diceLines = b.diceResult
              ? b.diceResult
                  .split('\n')
                  .filter(Boolean)
                  .map((d) => `\`${d}\``)
              : [];
            const allLines = [...textLines, ...diceLines];
            return allLines
              .map((line, idx) => `> ${idx === 0 ? sysCh : ''}${line}`)
              .join('\n');
          }
          const time = displayTime(b.timestamp, settings);
          const timePart = time ? ` *(${md(time)})*` : '';
          const chPart = settings.showChannel && b.channel ? ` *[${md(b.channel)}]*` : '';
          const dicePart = b.diceResult
            ? b.diceResult
                .split('\n')
                .filter(Boolean)
                .map((d) => `\`${d}\``)
                .join('\n')
            : '';
          const body = [b.text ? md(b.text) : '', dicePart].filter(Boolean).join('\n');
          return `**${md(b.speaker ?? '')}**${timePart}${chPart} :\n${body}`;
        })
        .join('\n\n') +
      '\n'
    );
  }

  const avatarIds = new Map<string, number>();
  const getAvatarClass = (url?: string) => {
    if (!url || !isSafeImageUrl(url)) return '';
    let idx = avatarIds.get(url);
    if (idx === undefined) {
      idx = avatarIds.size;
      avatarIds.set(url, idx);
    }
    return `avatar-image-${idx}`;
  };

  const toChannelCode = (ch: string) =>
    ch === '메인' ? 'main' : ch === '잡담' ? 'other' : ch;

  const messages = targetBlocks
    .map((b) => {
      if (b.sourceType === 'system') {
        const sysCh =
          settings.showChannel && showSystemChannel && b.channel ? b.channel : '';
        const dataCh = sysCh ? ` data-channel="${escape(toChannelCode(sysCh))}"` : '';
        const chSpan = sysCh
          ? `<span class="channel-name">[${escape(sysCh)}]</span>\n`
          : '';
        const text = `<div class="message-text">${chSpan}${escape(b.text)}</div>${b.diceResult ? `<span class="roll-result">${escape(b.diceResult)}</span>` : ''}`;
        return `<article class="message system"${dataCh}>${text}</article>`;
      }
      const normCh = settings.showChannel && b.channel ? b.channel : '';
      const dataCh = normCh ? ` data-channel="${escape(toChannelCode(normCh))}"` : '';
      const time = displayTime(b.timestamp, settings);
      const color = /^#[0-9a-f]{3,8}$/i.test(b.color ?? '') ? b.color! : '#eee';
      const avatarClass = getAvatarClass(resolveIcon(b.iconUrl));
      const avatarEl = avatarClass
        ? `<span class="avatar ${avatarClass}" aria-hidden="true"></span>`
        : '<span class="avatar-spacer" aria-hidden="true"></span>';
      const headerEl = `<div class="message-header"><span class="speaker" style="--speaker-color:${color}">${escape(b.speaker ?? '')}</span>${time ? ` <time class="timestamp">${escape(time)}</time>` : ''}${normCh ? ` <span class="channel-name">[${escape(normCh)}]</span>` : ''}</div>`;
      const contentEl = `<div class="message-content">${headerEl}<div class="message-text">${escape(b.text)}</div>${b.diceResult ? `<span class="roll-result">${escape(b.diceResult)}</span>` : ''}</div>`;
      return `<article class="message"${dataCh}>${avatarEl}${contentEl}</article>`;
    })
    .join('\n');

  const avatarCss = [...avatarIds.entries()]
    .map(([url, idx]) => `.avatar-image-${idx}{background-image:url("${escape(url)}")}`)
    .join('');

  return `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(p.title)}</title><style>body{background:#121212;color:#eee;font-family:system-ui;margin:0}.message-list{max-width:960px;margin:auto;padding:24px}.log-title,h1{font-size:24px;margin:24px 0}.message{display:grid;grid-template-columns:40px minmax(0,1fr);gap:12px;padding:16px 0;border-bottom:1px solid #262626}.message.system,.system{display:block;padding-left:52px;color:#888}.avatar,.avatar-spacer{width:40px;height:40px;display:block}.avatar{background-repeat:no-repeat;background-size:100% 100%}${avatarCss}.message-header{font-size:14px;margin-bottom:5px}.speaker{color:var(--speaker-color);font-size:14px;font-weight:bold}.timestamp,.channel-name,.message-header span{font-size:12px;color:#888}.message-text,.roll-result{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;font-size:16px}.roll-result{display:block;color:#888}</style></head><body><main class="message-list"><h1 class="log-title">${escape(p.title)}</h1>${messages}</main></body></html>`;
}
