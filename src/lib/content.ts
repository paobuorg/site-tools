import type { ContentIndex } from '@paobu/core/content';
import { loadDefaultContent } from '@paobu/core/content';

let cached: ContentIndex | undefined;

export function siteContent(): ContentIndex {
  if (cached) return cached;
  const allowUnreviewed = import.meta.env.PREVIEW_UNREVIEWED === '1' || import.meta.env.DEV;
  cached = loadDefaultContent(allowUnreviewed);
  return cached;
}
