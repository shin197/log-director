import { defaultDisplay, displayTime } from './presentation.ts';
import type { Project, Block } from './core';
export type ExportFormat = 'html' | 'txt' | 'json' | 'md';
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const md = (s: string) => s.replace(/([\\`*_{}\[\]<>#!|])/g, '\\$1');
export function exportLog(p: Project, format: ExportFormat): string {
  const settings = { ...defaultDisplay, ...p.display };
  const meta = (b: Block) =>
    [
      displayTime(b.timestamp, settings),
      settings.showChannel && b.channel ? `[${b.channel}]` : '',
    ]
      .filter(Boolean)
      .join(' ');
  if (format === 'json') {
    let originals: Record<string, unknown>[] = [];
    try {
      originals =
        JSON.parse(p.original?.raw.replace(/^\uFEFF/, '') ?? '{}').messages ?? [];
    } catch {}
    const messages = p.blocks.map((b) => {
      const source = b.sourceIndex === undefined ? {} : (originals[b.sourceIndex] ?? {});
      const m: Record<string, unknown> = {
        ...source,
        type: b.sourceType || 'normal',
        text: b.text,
      };
      m.channelName = b.channel ?? source.channelName ?? '';
      m.channel =
        m.channelName === source.channelName
          ? (source.channel ?? 'main')
          : m.channelName === '메인'
            ? 'main'
            : m.channelName === '잡담'
              ? 'other'
              : m.channelName;
      if (b.timestamp !== source.timestamp) {
        delete m.createdAt;
      }
      if (b.timestamp) m.timestamp = b.timestamp;
      else delete m.timestamp;
      if (m.type !== 'system') {
        m.speaker = b.speaker;
        m.color = b.color ?? '';
        m.iconUrl = b.iconUrl ?? '';
      }
      if (b.diceResult) m.diceResult = b.diceResult;
      else delete m.diceResult;
      if (b.diceResult !== source.diceResult) delete m.roll;
      if (!settings.showChannel) {
        delete m.channel;
        delete m.channelName;
      }
      const timestamp = displayTime(b.timestamp, settings);
      if (timestamp) m.timestamp = timestamp;
      else {
        delete m.timestamp;
        delete m.createdAt;
      }
      return m;
    });
    return JSON.stringify(
      { title: p.title, messageCount: messages.length, messages },
      null,
      2,
    );
  }
  if (format === 'txt' || format === 'md') {
    const markdown = format === 'md';
    return (
      (markdown
        ? `# ${md(p.title)}\n\n---`
        : `${p.title}\n========================================`) +
      '\n\n' +
      p.blocks
        .map((b) => {
          const body = [b.text, b.diceResult].filter(Boolean).join('\n');
          if (b.sourceType === 'system')
            return markdown
              ? body
                  .split('\n')
                  .map((line) => '> ' + md(line))
                  .join('\n')
              : body;
          return markdown
            ? `**${md(b.speaker)}**${meta(b) ? ` *(${md(meta(b))})*` : ''} :\n${md(body)}`
            : `${b.speaker}${meta(b) ? ` (${meta(b)})` : ''} :\n${body}`;
        })
        .join('\n\n') +
      '\n'
    );
  }
  const messages = p.blocks
    .map((b) => {
      const text = `<div class="message-text">${escape(b.text)}</div>${b.diceResult ? `<div class="roll-result">${escape(b.diceResult)}</div>` : ''}`;
      if (b.sourceType === 'system')
        return `<article class="message system">${text}</article>`;
      const color = /^#[0-9a-f]{3,8}$/i.test(b.color ?? '') ? b.color : '#eee';
      return `<article class="message"><div class="avatar">${/^https?:\/\//.test(b.iconUrl ?? '') ? `<img src="${escape(b.iconUrl!)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</div><div><div class="message-header"><strong style="color:${color}">${escape(b.speaker)}</strong> <span>${escape(meta(b))}</span></div>${text}</div></article>`;
    })
    .join('\n');
  return `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(p.title)}</title><style>body{background:#121212;color:#eee;font-family:system-ui;margin:0}.message-list{max-width:960px;margin:auto;padding:24px}.message{display:grid;grid-template-columns:40px minmax(0,1fr);gap:12px;padding:16px 0;border-bottom:1px solid #262626}.system{display:block;padding-left:52px;color:#888}.avatar,.avatar img{width:40px;height:40px}.message-header{font-size:14px;margin-bottom:5px}.message-header span{font-size:12px;color:#888}.message-text,.roll-result{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;font-size:16px}.roll-result{color:#888}h1{font-size:24px}</style></head><body><main class="message-list"><h1>${escape(p.title)}</h1>${messages}</main></body></html>`;
}
