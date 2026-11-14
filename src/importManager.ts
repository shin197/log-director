import {
  type Block,
  type Character,
  type OriginalFile,
  type Project,
  type Scene,
  parse,
} from './core.ts';
import {
  type ImagePool,
  internImageUrl,
  normalizeProjectImagePool,
  resolveImageUrl,
} from './imagePool.ts';
import { isMeaningfulProject } from './storage.ts';
import {
  SYSTEM_CHARACTER_ID,
  ensureSystemCharacter,
  systemCharacter,
} from './systemCharacter.ts';

export type ImportedLogItem = {
  id: string;
  name: string;
  raw: string;
  project: Project;
};

export type ImportMergeMode = 'append' | 'insert-scene' | 'interleave';

export type ImportManagerOptions = {
  mode: ImportMergeMode;
  targetSceneId?: string;
  registerScenes: boolean;
  mergeCharacters: boolean;
  skipBoundaryDuplicates: boolean;
};

export const DEFAULT_IMPORT_OPTIONS: ImportManagerOptions = {
  mode: 'append',
  targetSceneId: '',
  registerScenes: false,
  mergeCharacters: true,
  skipBoundaryDuplicates: true,
};

let importSeq = 0;

export const createImportedLogItem = (name: string, raw: string): ImportedLogItem => {
  const project = parse(raw, name);
  importSeq += 1;
  return {
    id: `import-${Date.now().toString(36)}-${importSeq}`,
    name,
    raw,
    project,
  };
};

export const moveImportedItem = (
  items: ImportedLogItem[],
  fromIndex: number,
  toIndex: number,
): ImportedLogItem[] => {
  if (
    fromIndex < 0 ||
    fromIndex >= items.length ||
    toIndex < 0 ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

/**
 * Parses Korean or standard timestamp strings into epoch milliseconds.
 * Examples supported:
 * - "2026. 10. 20. 오후 10:47:02"
 * - "2026. 10. 20. 오전 9:05:00"
 * - "2026-10-20 22:47:02" / ISO 8601
 * - "2026/10/20 22:47:02"
 */
export const parseLogTimestamp = (raw?: string): number | null => {
  const text = raw?.trim();
  if (!text) return null;

  // Match Korean format: YYYY. M. D. [오전|오후|AM|PM] H:mm[:ss]
  const krMatch = text.match(
    /^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})\.?\s*(?:(오전|오후|AM|PM|am|pm)\s*)?(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/,
  );
  if (krMatch) {
    const year = Number(krMatch[1]);
    const month = Number(krMatch[2]);
    const day = Number(krMatch[3]);
    const meridiem = krMatch[4]?.toLowerCase();
    let hour = Number(krMatch[5]);
    const minute = Number(krMatch[6]);
    const second = krMatch[7] ? Number(krMatch[7]) : 0;

    if (meridiem === '오후' || meridiem === 'pm') {
      if (hour < 12) hour += 12;
    } else if (meridiem === '오전' || meridiem === 'am') {
      if (hour === 12) hour = 0;
    }

    const ms = Date.UTC(year, month - 1, day, hour, minute, second);
    return Number.isNaN(ms) ? null : ms;
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
};

const blockSignature = (block: Block, charactersById: Map<string, Character>): string => {
  if (block.sourceType === 'system' || block.characterId === SYSTEM_CHARACTER_ID) {
    return `sys||${block.text.trim()}||${block.diceResult?.trim() ?? ''}`;
  }
  const speaker =
    block.speaker?.trim() ||
    (block.characterId ? charactersById.get(block.characterId)?.name?.trim() : '') ||
    '';
  return `msg||${speaker}||${block.text.trim()}||${block.diceResult?.trim() ?? ''}`;
};

/**
 * Checks if a suffix of `prevBlocks` matches an identical prefix of `nextBlocks`
 * (up to `maxOverlap` messages) and strips the overlapping prefix from `nextBlocks`.
 */
export const stripBoundaryDuplicates = (
  prevBlocks: Block[],
  nextBlocks: Block[],
  prevChars: Map<string, Character>,
  nextChars: Map<string, Character>,
  maxOverlap = 50,
): { blocks: Block[]; skippedCount: number } => {
  if (prevBlocks.length === 0 || nextBlocks.length === 0) {
    return { blocks: nextBlocks, skippedCount: 0 };
  }

  const limit = Math.min(prevBlocks.length, nextBlocks.length, maxOverlap);
  let matchedOverlap = 0;

  for (let k = limit; k >= 1; k -= 1) {
    let allMatch = true;
    for (let i = 0; i < k; i += 1) {
      const prevSig = blockSignature(prevBlocks[prevBlocks.length - k + i], prevChars);
      const nextSig = blockSignature(nextBlocks[i], nextChars);
      if (prevSig !== nextSig) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) {
      matchedOverlap = k;
      break;
    }
  }

  if (matchedOverlap === 0) {
    return { blocks: nextBlocks, skippedCount: 0 };
  }

  return {
    blocks: nextBlocks.slice(matchedOverlap),
    skippedCount: matchedOverlap,
  };
};

const stripExtension = (fileName: string): string =>
  fileName.replace(/\.[^.]+$/, '').trim() || fileName.trim() || '장면';

let mergeUidSeq = 0;
const nextMergeUid = (prefix: string): string => {
  mergeUidSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${mergeUidSeq}`;
};

type StreamEntry = {
  streamIndex: number;
  indexInStream: number;
  effectiveTime: number | null;
  block: Block;
};

const interleaveBlockStreams = (streams: Block[][]): Block[] => {
  const entries: StreamEntry[] = [];

  streams.forEach((blocks, streamIndex) => {
    let lastTime: number | null = null;
    blocks.forEach((block, indexInStream) => {
      const parsed = parseLogTimestamp(block.timestamp);
      if (parsed !== null) {
        lastTime = parsed;
      }
      entries.push({
        streamIndex,
        indexInStream,
        effectiveTime: parsed !== null ? parsed : lastTime,
        block,
      });
    });
  });

  // Sort entries with known effectiveTime chronologically; entries without any timestamp
  // up to that point stay anchored at the beginning of their stream in stream order.
  const sorted = [...entries].sort((a, b) => {
    if (a.effectiveTime !== null && b.effectiveTime !== null) {
      if (a.effectiveTime !== b.effectiveTime) {
        return a.effectiveTime - b.effectiveTime;
      }
      if (a.streamIndex !== b.streamIndex) {
        return a.streamIndex - b.streamIndex;
      }
      return a.indexInStream - b.indexInStream;
    }
    if (a.effectiveTime === null && b.effectiveTime === null) {
      if (a.streamIndex !== b.streamIndex) {
        return a.streamIndex - b.streamIndex;
      }
      return a.indexInStream - b.indexInStream;
    }
    // Keep leading timestamp-less messages before timestamped messages if from earlier or same stream
    return a.effectiveTime === null ? -1 : 1;
  });

  return sorted.map((entry) => entry.block);
};

export const mergeImportedLogs = (
  baseProject: Project,
  items: ImportedLogItem[],
  options: ImportManagerOptions,
): { project: Project; addedBlockCount: number; skippedDuplicateCount: number } => {
  if (items.length === 0) {
    return { project: baseProject, addedBlockCount: 0, skippedDuplicateCount: 0 };
  }

  const baseIsMeaningful = isMeaningfulProject(baseProject);
  const nextOriginals: OriginalFile[] = baseIsMeaningful ? [...baseProject.original] : [];
  const mergedImages: ImagePool = baseIsMeaningful
    ? { ...(baseProject.images ?? {}) }
    : {};
  const internCache = new Map<string, string>();
  const resolveAndInternFrom = (
    url: string | undefined,
    sourcePool?: ImagePool,
  ): string => {
    const resolved = resolveImageUrl(url, sourcePool).trim();
    return resolved ? internImageUrl(resolved, mergedImages, internCache) : '';
  };

  // Clone base characters
  const nextCharacters: Character[] = baseIsMeaningful
    ? (baseProject.characters ?? []).map((c) => ({
        ...c,
        faces: (c.faces ?? []).map((f) => ({ ...f })),
      }))
    : [systemCharacter()];

  const charByName = new Map<string, Character>();
  nextCharacters.forEach((c) => {
    if (c.id !== SYSTEM_CHARACTER_ID && c.name.trim()) {
      charByName.set(c.name.trim(), c);
    }
  });

  const usedBlockIds = new Set<string>(
    baseIsMeaningful ? baseProject.blocks.map((b) => b.id) : [],
  );
  const usedCharIds = new Set<string>(nextCharacters.map((c) => c.id));
  const usedSceneIds = new Set<string>(
    baseIsMeaningful ? (baseProject.scenes ?? []).map((s) => s.id) : [],
  );

  const nextScenes: Scene[] = baseIsMeaningful
    ? (baseProject.scenes ?? []).map((s) => ({ ...s }))
    : [];
  const sceneMarkedMessageIds = new Set<string>(nextScenes.map((s) => s.messageId));

  let skippedDuplicateCount = 0;
  let addedBlockCount = 0;

  const processedItemBlocks: Block[][] = [];
  const baseCharMap = new Map<string, Character>(nextCharacters.map((c) => [c.id, c]));
  let previousStreamBlocks: Block[] = baseIsMeaningful ? baseProject.blocks : [];
  let previousStreamCharMap: Map<string, Character> = baseCharMap;

  for (let idx = 0; idx < items.length; idx += 1) {
    const item = items[idx];
    const itemProj = item.project;

    // 1. Append original file entries & compute sourceFileIndex offset
    const sourceOffset = nextOriginals.length;
    if ((itemProj.original ?? []).length > 0) {
      itemProj.original.forEach((orig) => {
        nextOriginals.push({ name: orig.name, raw: orig.raw });
      });
    } else {
      nextOriginals.push({ name: item.name, raw: item.raw });
    }

    // 2. Character mapping for this imported file
    const charIdMap = new Map<string, string>();
    charIdMap.set(SYSTEM_CHARACTER_ID, SYSTEM_CHARACTER_ID);
    const itemChars = itemProj.characters ?? [];
    const itemCharMap = new Map<string, Character>(itemChars.map((c) => [c.id, c]));

    for (const srcChar of itemChars) {
      if (srcChar.id === SYSTEM_CHARACTER_ID) continue;
      const trimmedName = srcChar.name.trim();

      if (options.mergeCharacters && trimmedName && charByName.has(trimmedName)) {
        const targetChar = charByName.get(trimmedName)!;
        charIdMap.set(srcChar.id, targetChar.id);

        // Merge missing faces by canonical iconUrl
        const existingUrls = new Set(
          targetChar.faces.map((f) => (f.iconUrl ?? '').trim()).filter(Boolean),
        );
        for (const face of srcChar.faces ?? []) {
          const iconUrl = resolveAndInternFrom(face.iconUrl, itemProj.images);
          if (iconUrl && !existingUrls.has(iconUrl)) {
            existingUrls.add(iconUrl);
            targetChar.faces.push({
              name: face.name || `표정 ${targetChar.faces.length + 1}`,
              iconUrl,
            });
          }
        }
        if (!targetChar.color && srcChar.color) {
          targetChar.color = srcChar.color;
        }
      } else {
        let newCharId = srcChar.id;
        if (usedCharIds.has(newCharId)) {
          newCharId = nextMergeUid('char');
        }
        usedCharIds.add(newCharId);
        charIdMap.set(srcChar.id, newCharId);

        const clonedChar: Character = {
          ...srcChar,
          id: newCharId,
          iconUrl: resolveAndInternFrom(srcChar.iconUrl, itemProj.images),
          faces: (srcChar.faces ?? []).map((f) => ({
            ...f,
            iconUrl: resolveAndInternFrom(f.iconUrl, itemProj.images),
          })),
        };
        nextCharacters.push(clonedChar);
        if (trimmedName && !charByName.has(trimmedName)) {
          charByName.set(trimmedName, clonedChar);
        }
      }
    }

    // 3. Optionally skip boundary duplicates relative to previous stream
    let rawBlocks = itemProj.blocks;
    if (options.skipBoundaryDuplicates && previousStreamBlocks.length > 0) {
      const stripped = stripBoundaryDuplicates(
        previousStreamBlocks,
        rawBlocks,
        previousStreamCharMap,
        itemCharMap,
      );
      rawBlocks = stripped.blocks;
      skippedDuplicateCount += stripped.skippedCount;
    }

    previousStreamBlocks = itemProj.blocks;
    previousStreamCharMap = itemCharMap;

    // 4. Remap block IDs, character IDs, and sourceFileIndex
    const blockIdMap = new Map<string, string>();
    const remappedBlocks: Block[] = rawBlocks.map((b) => {
      let nextId = b.id;
      if (usedBlockIds.has(nextId)) {
        nextId = nextMergeUid('msg');
      }
      usedBlockIds.add(nextId);
      blockIdMap.set(b.id, nextId);

      const mappedCharId =
        b.sourceType === 'system'
          ? SYSTEM_CHARACTER_ID
          : b.characterId
            ? (charIdMap.get(b.characterId) ?? b.characterId)
            : null;

      return {
        ...b,
        id: nextId,
        characterId: mappedCharId,
        iconUrl: b.iconUrl ? resolveAndInternFrom(b.iconUrl, itemProj.images) : b.iconUrl,
        sourceFileIndex: (b.sourceFileIndex ?? 0) + sourceOffset,
      };
    });

    // 5. Carry over existing scenes inside the imported project
    for (const scene of itemProj.scenes ?? []) {
      const mappedMsgId = blockIdMap.get(scene.messageId);
      if (mappedMsgId && !sceneMarkedMessageIds.has(mappedMsgId)) {
        let nextSceneId = scene.id;
        if (usedSceneIds.has(nextSceneId)) {
          nextSceneId = nextMergeUid('scene');
        }
        usedSceneIds.add(nextSceneId);
        sceneMarkedMessageIds.add(mappedMsgId);
        nextScenes.push({
          id: nextSceneId,
          name: scene.name,
          messageId: mappedMsgId,
        });
      }
    }

    // 6. Register scene bookmark at the start of each imported file if requested
    if (options.registerScenes && remappedBlocks.length > 0) {
      const firstBlockId = remappedBlocks[0].id;
      if (!sceneMarkedMessageIds.has(firstBlockId)) {
        const sceneId = nextMergeUid('scene');
        usedSceneIds.add(sceneId);
        sceneMarkedMessageIds.add(firstBlockId);
        nextScenes.push({
          id: sceneId,
          name: stripExtension(item.name),
          messageId: firstBlockId,
        });
      }
    }

    addedBlockCount += remappedBlocks.length;
    processedItemBlocks.push(remappedBlocks);
  }

  // 7. Combine blocks according to options.mode
  const baseBlocks = baseIsMeaningful ? [...baseProject.blocks] : [];
  const flattenedImported = processedItemBlocks.flat();
  let combinedBlocks: Block[];

  if (!baseIsMeaningful || baseBlocks.length === 0) {
    combinedBlocks =
      options.mode === 'interleave'
        ? interleaveBlockStreams(processedItemBlocks)
        : flattenedImported;
  } else if (options.mode === 'insert-scene' && options.targetSceneId) {
    const targetScene = (baseProject.scenes ?? []).find(
      (s) => s.id === options.targetSceneId,
    );
    const targetIdx = targetScene
      ? baseBlocks.findIndex((b) => b.id === targetScene.messageId)
      : -1;
    if (targetIdx >= 0) {
      combinedBlocks = [
        ...baseBlocks.slice(0, targetIdx),
        ...flattenedImported,
        ...baseBlocks.slice(targetIdx),
      ];
    } else {
      combinedBlocks = [...baseBlocks, ...flattenedImported];
    }
  } else if (options.mode === 'interleave') {
    combinedBlocks = interleaveBlockStreams([baseBlocks, ...processedItemBlocks]);
  } else {
    combinedBlocks = [...baseBlocks, ...flattenedImported];
  }

  // Sort scenes so their order matches the timeline message order
  const blockIndexById = new Map<string, number>();
  combinedBlocks.forEach((b, i) => blockIndexById.set(b.id, i));
  const sortedScenes = nextScenes
    .filter((s) => blockIndexById.has(s.messageId))
    .sort(
      (a, b) =>
        (blockIndexById.get(a.messageId) ?? 0) - (blockIndexById.get(b.messageId) ?? 0),
    );

  const nextTitle = baseIsMeaningful
    ? baseProject.title
    : items[0].project.title || stripExtension(items[0].name) || baseProject.title;

  return {
    project: normalizeProjectImagePool(
      ensureSystemCharacter({
        ...baseProject,
        title: nextTitle,
        original: nextOriginals,
        ...(Object.keys(mergedImages).length > 0 ? { images: mergedImages } : {}),
        characters: nextCharacters,
        blocks: combinedBlocks,
        scenes: sortedScenes,
      }),
    ),
    addedBlockCount,
    skippedDuplicateCount,
  };
};
