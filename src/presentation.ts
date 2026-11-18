export type MergeSeparatorMode = 'newline' | 'doubleNewline' | 'space';

export type DisplaySettings = {
  showChannel: boolean;
  showTimestamp: boolean;
  timestampFormat: string;
  applyStylesInEditor?: boolean;
  virtualScroll?: boolean;
  virtualBuffer?: number;
  mergeSeparator?: MergeSeparatorMode;
  mergeDifferentFaces?: boolean;
  mergeIgnoreOtherChannels?: boolean;
  autoWrapQuotes?: boolean;
  maxUndoSteps?: number;
  showScrollbarOverlay?: boolean;
  preserveOriginals?: boolean;
  channelRelativeLineNumbers?: boolean;
};

export const defaultDisplay: DisplaySettings = {
  showChannel: true,
  showTimestamp: true,
  timestampFormat: 'original',
  applyStylesInEditor: false,
  virtualScroll: true,
  virtualBuffer: 30,
  mergeSeparator: 'newline',
  mergeDifferentFaces: false,
  mergeIgnoreOtherChannels: false,
  autoWrapQuotes: true,
  maxUndoSteps: 100,
  showScrollbarOverlay: true,
  preserveOriginals: true,
  channelRelativeLineNumbers: false,
};

export function displayTime(raw: string | undefined, settings: DisplaySettings): string {
  if (!settings.showTimestamp || !raw) return '';
  if (settings.timestampFormat === 'original') return raw;
  const match = raw.match(
    /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2}):(\d{2})$/,
  );
  let values: Record<string, string>;
  if (match) {
    const [, y, m, d, ap, h, minute, second] = match;
    values = {
      YYYY: y,
      MM: m.padStart(2, '0'),
      DD: d.padStart(2, '0'),
      HH: String((Number(h) % 12) + (ap === '오후' ? 12 : 0)).padStart(2, '0'),
      mm: minute,
      ss: second,
    };
  } else {
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T| )(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!iso) return raw;
    values = {
      YYYY: iso[1],
      MM: iso[2],
      DD: iso[3],
      HH: iso[4],
      mm: iso[5],
      ss: iso[6] ?? '00',
    };
  }
  return settings.timestampFormat.replace(
    /YYYY|MM|DD|HH|mm|ss/g,
    (token) => values[token],
  );
}
