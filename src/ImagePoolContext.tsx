import { createContext, useContext } from 'react';
import type { ImagePool } from './imagePool';

export const EMPTY_IMAGE_POOL: ImagePool = {};
export const ImagePoolContext = createContext<ImagePool>(EMPTY_IMAGE_POOL);

export function useImagePool(): ImagePool {
  return useContext(ImagePoolContext);
}
