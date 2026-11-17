import type { Block, Character, Project } from './core.ts';
import { isSafeImageUrl } from './importFormats.ts';

export const IMAGE_REF_PREFIX = 'img:';
export type ImagePool = Record<string, string>;

export function hashDataUri(input: string): string {
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

export function isImagePoolRef(url?: string): boolean {
  return typeof url === 'string' && url.startsWith(IMAGE_REF_PREFIX);
}

export function resolveImageUrl(url?: string, images?: ImagePool): string {
  if (!url) return '';
  if (url.startsWith(IMAGE_REF_PREFIX)) {
    return images?.[url.slice(IMAGE_REF_PREFIX.length)] ?? '';
  }
  return url;
}

export function isRenderableImageUrl(url?: string, images?: ImagePool): boolean {
  return isSafeImageUrl(resolveImageUrl(url, images));
}

export function internImageUrl(
  url: string | undefined,
  images: ImagePool,
  cache?: Map<string, string>,
): string {
  if (!url) return '';
  if (url.startsWith(IMAGE_REF_PREFIX)) {
    const key = url.slice(IMAGE_REF_PREFIX.length);
    return key in images ? url : '';
  }
  const trimmed = url.trim();
  if (/^data:image\//i.test(trimmed) && isSafeImageUrl(trimmed)) {
    const cached = cache?.get(trimmed);
    if (cached) return IMAGE_REF_PREFIX + cached;
    let key = hashDataUri(trimmed);
    while (key in images && images[key] !== trimmed) {
      key = hashDataUri(`${key}:${trimmed.length}`);
    }
    images[key] = trimmed;
    cache?.set(trimmed, key);
    return IMAGE_REF_PREFIX + key;
  }
  return url;
}

export function collectReferencedImageKeys(p: Project): Set<string> {
  const used = new Set<string>();
  const addRef = (url?: string) => {
    if (url && url.startsWith(IMAGE_REF_PREFIX)) {
      used.add(url.slice(IMAGE_REF_PREFIX.length));
    }
  };
  for (const c of p.characters ?? []) {
    addRef(c.iconUrl);
    for (const f of c.faces) {
      addRef(f.iconUrl);
    }
  }
  for (const b of p.blocks) {
    addRef(b.iconUrl);
  }
  if (p.quickSlots) {
    for (const slot of Object.values(p.quickSlots)) {
      addRef(slot.iconUrl);
    }
  }
  return used;
}

export function getUnusedImageStats(p: Project): {
  totalCount: number;
  unusedCount: number;
  unusedBytes: number;
} {
  const images = p.images ?? {};
  const keys = Object.keys(images);
  if (keys.length === 0) {
    return { totalCount: 0, unusedCount: 0, unusedBytes: 0 };
  }
  const used = collectReferencedImageKeys(p);
  let unusedCount = 0;
  let unusedBytes = 0;
  for (const k of keys) {
    if (!used.has(k)) {
      unusedCount += 1;
      unusedBytes += images[k]?.length ?? 0;
    }
  }
  return { totalCount: keys.length, unusedCount, unusedBytes };
}

function processProjectImagePool(p: Project, pruneUnused: boolean): Project {
  const existingImages = p.images ?? {};
  const nextImages: ImagePool = pruneUnused ? {} : { ...existingImages };
  const cache = new Map<string, string>();
  if (!pruneUnused) {
    for (const [k, v] of Object.entries(existingImages)) {
      cache.set(v, k);
    }
  }

  const normalizeRef = (url?: string): string => {
    if (!url) return '';
    if (url.startsWith(IMAGE_REF_PREFIX)) {
      const key = url.slice(IMAGE_REF_PREFIX.length);
      if (key in existingImages) {
        nextImages[key] = existingImages[key];
        return url;
      }
      return '';
    }
    return internImageUrl(url, nextImages, cache);
  };

  let charsChanged = false;
  const nextCharacters: Character[] | undefined = p.characters?.map((c) => {
    const nextIconUrl = normalizeRef(c.iconUrl);
    let facesChanged = false;
    const nextFaces = c.faces.map((f) => {
      const nextFaceUrl = normalizeRef(f.iconUrl);
      if (nextFaceUrl !== f.iconUrl) {
        facesChanged = true;
        return { ...f, iconUrl: nextFaceUrl };
      }
      return f;
    });
    if (nextIconUrl !== c.iconUrl || facesChanged) {
      charsChanged = true;
      return {
        ...c,
        iconUrl: nextIconUrl,
        faces: facesChanged ? nextFaces : c.faces,
      };
    }
    return c;
  });

  let blocksChanged = false;
  const nextBlocks: Block[] = p.blocks.map((b) => {
    if (!b.iconUrl) return b;
    const nextIconUrl = normalizeRef(b.iconUrl);
    if (nextIconUrl !== b.iconUrl) {
      blocksChanged = true;
      return { ...b, iconUrl: nextIconUrl };
    }
    return b;
  });

  let slotsChanged = false;
  let nextQuickSlots = p.quickSlots;
  if (p.quickSlots) {
    const updatedSlots: NonNullable<Project['quickSlots']> = {};
    for (const [k, slot] of Object.entries(p.quickSlots)) {
      const nextIconUrl = normalizeRef(slot.iconUrl);
      if (nextIconUrl !== slot.iconUrl) {
        slotsChanged = true;
        updatedSlots[k] = { ...slot, iconUrl: nextIconUrl };
      } else {
        updatedSlots[k] = slot;
      }
    }
    if (slotsChanged) {
      nextQuickSlots = updatedSlots;
    }
  }

  const prevKeys = Object.keys(existingImages);
  const nextKeys = Object.keys(nextImages);
  const poolChanged =
    prevKeys.length !== nextKeys.length ||
    nextKeys.some((k) => existingImages[k] !== nextImages[k]);

  if (!charsChanged && !blocksChanged && !slotsChanged && !poolChanged) {
    return p;
  }

  const next: Project = {
    ...p,
    characters: charsChanged ? nextCharacters : p.characters,
    blocks: blocksChanged ? nextBlocks : p.blocks,
    ...(slotsChanged ? { quickSlots: nextQuickSlots } : {}),
  };
  if (nextKeys.length > 0) {
    next.images = nextImages;
  } else {
    delete next.images;
  }
  return next;
}

/**
 * Registers newly added data:image URIs into the image pool while preserving
 * unreferenced pool keys so users can review and manually prune them.
 */
export function internProjectImages(p: Project): Project {
  return processProjectImagePool(p, false);
}

/**
 * Normalizes the image pool and prunes any keys no longer referenced by blocks or characters.
 */
export function normalizeProjectImagePool(p: Project): Project {
  return processProjectImagePool(p, true);
}
