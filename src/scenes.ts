import type { Block, Scene } from './core.ts';

export type SceneRange = {
  scene: Scene;
  startIndex: number;
  endIndex: number;
  count: number;
  blockIds: Set<string>;
};

/**
 * Normalizes scenes: keeps only scenes whose messageId exists in blocks,
 * enforces at most one scene per messageId, and orders scenes by block order.
 */
export function normalizeScenes(scenes: Scene[] | undefined, blocks: Block[]): Scene[] {
  if (!scenes?.length || !blocks.length) return [];
  const blockIndex = new Map<string, number>();
  blocks.forEach((b, i) => blockIndex.set(b.id, i));

  const seenMessages = new Set<string>();
  const valid: { scene: Scene; index: number }[] = [];

  for (const s of scenes) {
    if (!s || typeof s.id !== 'string' || typeof s.messageId !== 'string') continue;
    const idx = blockIndex.get(s.messageId);
    if (idx === undefined || seenMessages.has(s.messageId)) continue;
    seenMessages.add(s.messageId);
    valid.push({
      scene: {
        id: s.id,
        name: typeof s.name === 'string' ? s.name : '장면',
        messageId: s.messageId,
      },
      index: idx,
    });
  }

  valid.sort((a, b) => a.index - b.index);
  return valid.map((v) => v.scene);
}

/**
 * Computes the message range for each scene: from its bookmarked message
 * up to the message right before the next scene's bookmarked message (or end of log).
 */
export function computeSceneRanges(
  scenes: Scene[] | undefined,
  blocks: Block[],
): SceneRange[] {
  const ordered = normalizeScenes(scenes, blocks);
  if (!ordered.length) return [];

  const blockIndex = new Map<string, number>();
  blocks.forEach((b, i) => blockIndex.set(b.id, i));

  const starts = ordered.map((scene) => ({
    scene,
    startIndex: blockIndex.get(scene.messageId)!,
  }));

  return starts.map(({ scene, startIndex }, i) => {
    const endIndex =
      i + 1 < starts.length ? starts[i + 1].startIndex - 1 : blocks.length - 1;
    const blockIds = new Set<string>();
    for (let j = startIndex; j <= endIndex; j++) {
      if (blocks[j]) blockIds.add(blocks[j].id);
    }
    return {
      scene,
      startIndex,
      endIndex,
      count: Math.max(0, endIndex - startIndex + 1),
      blockIds,
    };
  });
}

export function addSceneForMessage(
  scenes: Scene[] | undefined,
  blocks: Block[],
  messageId: string,
  customName?: string,
): { scenes: Scene[]; added: Scene | null; existing: Scene | null } {
  const ordered = normalizeScenes(scenes, blocks);
  const existing = ordered.find((s) => s.messageId === messageId) ?? null;
  if (existing) {
    return { scenes: ordered, added: null, existing };
  }
  if (!blocks.some((b) => b.id === messageId)) {
    return { scenes: ordered, added: null, existing: null };
  }
  let nextNum = ordered.length + 1;
  while (ordered.some((s) => s.name === `장면 ${nextNum}`)) {
    nextNum++;
  }
  const added: Scene = {
    id: crypto.randomUUID(),
    name: customName?.trim() || `장면 ${nextNum}`,
    messageId,
  };
  return {
    scenes: normalizeScenes([...ordered, added], blocks),
    added,
    existing: null,
  };
}

export function updateSceneName(
  scenes: Scene[] | undefined,
  blocks: Block[],
  sceneId: string,
  name: string,
): Scene[] {
  return normalizeScenes(scenes, blocks).map((s) =>
    s.id === sceneId ? { ...s, name } : s,
  );
}

export function removeScene(
  scenes: Scene[] | undefined,
  blocks: Block[],
  sceneId: string,
): Scene[] {
  return normalizeScenes(scenes, blocks).filter((s) => s.id !== sceneId);
}

export function findAdjacentScene(
  scenes: Scene[] | undefined,
  blocks: Block[],
  currentMessageId: string | null,
  direction: 1 | -1,
): Scene | null {
  const ranges = computeSceneRanges(scenes, blocks);
  if (!ranges.length) return null;

  const currentIndex = currentMessageId
    ? blocks.findIndex((b) => b.id === currentMessageId)
    : -1;

  if (currentIndex < 0) {
    return direction > 0 ? ranges[0].scene : ranges[ranges.length - 1].scene;
  }

  if (direction > 0) {
    const next = ranges.find((r) => r.startIndex > currentIndex);
    return next ? next.scene : ranges[ranges.length - 1].scene;
  } else {
    for (let i = ranges.length - 1; i >= 0; i--) {
      if (ranges[i].startIndex < currentIndex) {
        return ranges[i].scene;
      }
    }
    return ranges[0].scene;
  }
}
