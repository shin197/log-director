import type { Block } from './core.ts';

export type ChannelSummary = {
  name: string;
  count: number;
  isDefault: boolean;
};

export const DEFAULT_CHANNELS = ['', '메인'] as const;

export function formatChannelLabel(name: string): string {
  return name === '' ? '(채널 없음)' : name;
}

export function collectChannels(blocks: Block[]): ChannelSummary[] {
  const counts = new Map<string, number>();
  for (const name of DEFAULT_CHANNELS) counts.set(name, 0);

  const customOrder: string[] = [];
  for (const block of blocks) {
    const name = block.channel ?? '';
    if (!counts.has(name)) {
      counts.set(name, 1);
      customOrder.push(name);
    } else {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  const defaults: ChannelSummary[] = DEFAULT_CHANNELS.map((name) => ({
    name,
    count: counts.get(name) ?? 0,
    isDefault: true,
  }));

  const customs: ChannelSummary[] = customOrder
    .filter((name) => (counts.get(name) ?? 0) > 0)
    .map((name) => ({
      name,
      count: counts.get(name) ?? 0,
      isDefault: false,
    }));

  return [...defaults, ...customs];
}
