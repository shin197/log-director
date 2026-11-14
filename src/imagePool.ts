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

export function normalizeProjectImagePool(p: Project): Project {
  const existingImages = p.images ?? {};
  const nextImages: ImagePool = {};
  const cache = new Map<string, string>();

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

  const prevKeys = Object.keys(existingImages);
  const nextKeys = Object.keys(nextImages);
  const poolChanged =
    prevKeys.length !== nextKeys.length ||
    nextKeys.some((k) => existingImages[k] !== nextImages[k]);

  if (!charsChanged && !blocksChanged && !poolChanged) {
    return p;
  }

  const next: Project = {
    ...p,
    characters: charsChanged ? nextCharacters : p.characters,
    blocks: blocksChanged ? nextBlocks : p.blocks,
  };
  if (nextKeys.length > 0) {
    next.images = nextImages;
  } else {
    delete next.images;
  }
  return next;
}
