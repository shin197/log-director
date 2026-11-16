import { defaultDisplay, displayTime } from './presentation.ts';
import { isSafeImageUrl } from './importFormats.ts';
import { hashDataUri, resolveImageUrl } from './imagePool.ts';
import { compileQuery, sanitizeLiveQuery } from './query.ts';
import {
  buildMessageStyleObjects,
  createStyleResolver,
  defaultGlobalStyle,
  styleObjectToCssString,
} from './styles.ts';
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

export function getRollResultClass(
  diceResult?: string,
  sourceRoll?: unknown,
): string {
  const trimmed = diceResult?.trim() ?? '';
  if (!trimmed) return '';

  if (sourceRoll && typeof sourceRoll === 'object') {
    const roll = sourceRoll as Record<string, unknown>;
    const sourceResult =
      typeof roll.result === 'string' ? roll.result.trim() : '';
    if (!sourceResult || sourceResult === trimmed) {
      const classes: string[] = [];
      if (roll.success) classes.push('success');
      if (roll.critical) classes.push('critical');
      if (roll.failure) classes.push('failure');
      if (roll.fumble) classes.push('fumble');
      if (classes.length > 0) {
        return classes.join(' ');
      }
    }
  }
  return '';
}

export function exportLog(
  p: Project,
  format: ExportFormat,
  options?: ExportOptions,
): string {
  const settings = { ...defaultDisplay, ...p.display };
  const showSystemChannel = options?.showSystemChannel ?? true;
  const encodeBase64 = options?.encodeBase64 ?? false;
  const charMap = new Map((p.characters ?? []).map((c) => [c.id, c]));

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
    const raw = resolveImageUrl(url, p.images).trim();
    if (!raw) return '';
    if (encodeBase64 && options?.urlToBase64?.[raw]) {
      return options.urlToBase64[raw];
    }
    return raw;
  };

  const parsedOriginals: Record<string, unknown>[][] = (p.original ?? []).map(
    (orig) => {
      try {
        return JSON.parse(orig.raw.replace(/^\uFEFF/, '')).messages ?? [];
      } catch {
        return [];
      }
    },
  );

  if (format === 'json') {
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
      const fileOriginals = parsedOriginals[b.sourceFileIndex ?? 0] ?? [];
      const source =
        b.sourceIndex === undefined ? {} : (fileOriginals[b.sourceIndex] ?? {});
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
        const linkedChar = b.characterId ? charMap.get(b.characterId) : undefined;
        m.speaker = b.speaker;
        m.color = b.color || linkedChar?.color || '';
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

  const globalStyle = p.styles?.global ?? defaultGlobalStyle();
  const resolveStyle = createStyleResolver(
    p.styles,
    p.characters ?? [],
    p.scenes ?? [],
    p.blocks,
  );

  const toChannelCode = (ch: string) =>
    ch === '메인' ? 'main' : ch === '잡담' ? 'other' : ch;

  const buildRollElement = (diceResult?: string, diceAttr?: string) => {
    if (!diceResult) return '';
    return `<span class="roll-result"${diceAttr ? ` style="${escape(diceAttr)}"` : ''}>${escape(diceResult)}</span>`;
  };

  const messages = targetBlocks
    .map((b) => {
      const fileOriginals = parsedOriginals[b.sourceFileIndex ?? 0] ?? [];
      const source =
        b.sourceIndex === undefined ? {} : (fileOriginals[b.sourceIndex] ?? {});

      const linkedChar =
        b.sourceType === 'system' || !b.characterId
          ? undefined
          : charMap.get(b.characterId);
      const rawColor = (linkedChar?.color || b.color || '').trim();
      const color = /^#[0-9a-f]{3,8}$/i.test(rawColor) ? rawColor : '#888888';

      const msgProps = resolveStyle(b);
      const styled = buildMessageStyleObjects(
        msgProps,
        globalStyle.dividerColor,
        b.sourceType === 'system' ? undefined : color,
      );
      if (
        !styled.panelStyle.padding &&
        (styled.panelStyle.backgroundColor ||
          msgProps.panelBorderStyle === 'box' ||
          msgProps.panelBorderStyle === 'left-accent')
      ) {
        styled.panelStyle.padding = '12px 14px';
        styled.panelStyle.margin = '4px 0';
      }
      const panelAttr = styleObjectToCssString(styled.panelStyle);
      const textAttr = styleObjectToCssString(styled.textStyle);
      const diceAttr = styleObjectToCssString(styled.diceStyle);
      const avatarAttr = styleObjectToCssString(styled.avatarStyle);

      if (b.sourceType === 'system') {
        const sysCh =
          settings.showChannel && showSystemChannel && b.channel ? b.channel : '';
        const dataCh = sysCh ? ` data-channel="${escape(toChannelCode(sysCh))}"` : '';
        const headerEl = sysCh
          ? `<div class="message-header"><span class="channel-name">[${escape(sysCh)}]</span></div>`
          : '';
        const textEl = `<div class="message-text"${textAttr ? ` style="${escape(textAttr)}"` : ''}>${escape(b.text)}</div>`;
        const diceEl = buildRollElement(b.diceResult, diceAttr);
        return `<article class="message system"${dataCh}${panelAttr ? ` style="${escape(panelAttr)}"` : ''}>${headerEl}${textEl}${diceEl}</article>`;
      }

      const normCh = settings.showChannel && b.channel ? b.channel : '';
      const dataCh = normCh ? ` data-channel="${escape(toChannelCode(normCh))}"` : '';
      const time = displayTime(b.timestamp, settings);
      const speakerStyle = styled.speakerColor
        ? `--speaker-color:${color};color:${styled.speakerColor}`
        : `--speaker-color:${color}`;
      const avatarClass = styled.avatarHidden ? '' : getAvatarClass(resolveIcon(b.iconUrl));
      const spacerSizeAttr =
        !styled.avatarHidden && msgProps.avatarSize !== undefined
          ? ` style="width:${msgProps.avatarSize}px;height:${msgProps.avatarSize}px"`
          : '';
      const avatarEl = styled.avatarHidden
        ? ''
        : avatarClass
          ? `<span class="avatar ${avatarClass}"${avatarAttr ? ` style="${escape(avatarAttr)}"` : ''} aria-hidden="true"></span>`
          : `<span class="avatar-spacer"${spacerSizeAttr} aria-hidden="true"></span>`;
      const timeDatetime =
        typeof source.createdAt === 'number'
          ? ` datetime="${new Date(source.createdAt).toISOString()}"`
          : '';
      const timeEl = time ? `<time class="timestamp"${timeDatetime}>${escape(time)}</time>` : '';
      const chEl = normCh ? `<span class="channel-name">[${escape(normCh)}]</span>` : '';
      const headerEl = `<div class="message-header"><span class="speaker" style="${speakerStyle}">${escape(b.speaker ?? '')}</span>${timeEl}${chEl}</div>`;
      const diceEl = buildRollElement(b.diceResult, diceAttr);
      const contentEl = `<div class="message-content">${headerEl}<div class="message-text"${textAttr ? ` style="${escape(textAttr)}"` : ''}>${escape(b.text)}</div>${diceEl}</div>`;
      const noAvatarClass = styled.avatarHidden ? ' no-avatar' : '';
      return `<article class="message${noAvatarClass}"${dataCh}${panelAttr ? ` style="${escape(panelAttr)}"` : ''}>${avatarEl}${contentEl}</article>`;
    })
    .join('\n');

  const avatarCss = [...avatarIds.entries()]
    .map(([url, idx]) => `.avatar-image-${idx}{background-image:url("${escape(url)}")}`)
    .join('');

  const pageBg = globalStyle.pageBgColor;
  const bodyColor = globalStyle.messageDefaults.textColor ?? '#eee';
  const bodyFont = globalStyle.messageDefaults.fontFamily || 'system-ui';
  const systemColor = globalStyle.systemDefaults?.textColor || globalStyle.systemTextColor;
  const systemIndent = globalStyle.messageDefaults.avatarHidden
    ? 0
    : (globalStyle.messageDefaults.avatarSize ?? 40) + 12;
  const listGapCss =
    globalStyle.messageGap > 0
      ? `display:flex;flex-direction:column;gap:${globalStyle.messageGap}px;`
      : '';
  const titleStyle = `.log-title,h1{font-size:${globalStyle.titleSize}px;margin:24px 0;color:${globalStyle.titleColor};text-align:${globalStyle.titleAlign}}`;

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escape(p.title)}</title><style>:root{color-scheme:dark;color:${bodyColor};background:${pageBg}}*{box-sizing:border-box}body{min-width:280px;margin:0;background:${pageBg};color:${bodyColor};font-family:${bodyFont}}.message-list{${listGapCss}width:100%;max-width:${globalStyle.containerWidth}px;margin:0 auto;padding:0 24px 48px}${titleStyle}.message{display:grid;grid-template-columns:40px minmax(0,1fr);column-gap:12px;padding:16px 0;border-bottom:1px solid ${globalStyle.dividerColor}}.message.no-avatar{grid-template-columns:minmax(0,1fr);column-gap:0}.message.system{display:block;padding-left:${systemIndent}px;color:${systemColor}}.avatar,.avatar-spacer{width:40px;height:40px}.avatar{display:block;background-repeat:no-repeat;background-size:100% 100%}${avatarCss}.message-header{display:flex;align-items:baseline;flex-wrap:wrap;gap:8px}.speaker{color:var(--speaker-color);font-size:14px;font-weight:bold}.timestamp,.edited,.channel-name{color:${globalStyle.metaColor};font-size:12px}.message-text,.roll-result{font-size:${globalStyle.messageDefaults.fontSize ?? 16}px;line-height:1.6;overflow-wrap:anywhere;white-space:pre-wrap}.roll-result{display:block}</style></head><body><main class="message-list"><h1 class="log-title">${escape(p.title)}</h1>${messages}</main></body></html>`;
}
