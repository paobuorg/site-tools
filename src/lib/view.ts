import type { ContentEntity, ToolDetails } from '@paobu/core/content';
import type { Locale } from '@paobu/core/lib/i18n';
import { siteOrigin } from '@paobu/core/lib/sites';

export type ToolCategory = 'pace' | 'track';

export const TOOL_CATEGORY: Record<string, ToolCategory> = {
  pace: 'pace',
  splits: 'pace',
  'track-view': 'track',
  'track-convert': 'track',
  'track-simplify': 'track',
  'route-compare': 'track',
  'run-walk': 'pace',
  'race-predict': 'pace',
};

export const TOOL_ICON: Record<string, string> = {
  pace: 'timer',
  splits: 'list',
  'track-view': 'map',
  'track-convert': 'code',
  'track-simplify': 'layers',
  'route-compare': 'compare',
  'run-walk': 'motion',
  'race-predict': 'chart',
};

export function toolDetails(entity: ContentEntity): ToolDetails {
  return entity.details as ToolDetails;
}

export function toolCategory(slug: string): ToolCategory {
  return TOOL_CATEGORY[slug] ?? 'pace';
}

export function toolIcon(slug: string): string {
  return TOOL_ICON[slug] ?? 'tools';
}

export function toolHref(entity: ContentEntity, locale: Locale): string {
  return `/${locale}/tools/${entity.slug}/`;
}

export function entityHref(entity: ContentEntity, locale: Locale): string {
  if (entity.kind === 'tool') return toolHref(entity, locale);
  if (entity.kind === 'route') return `${siteOrigin('routes')}/${locale}/routes/${entity.slug}/`;
  const type = (entity.details as { contentType?: string }).contentType;
  const section = type === 'glossary' ? 'glossary' : type === 'learning-path' ? 'paths' : 'articles';
  return `${siteOrigin('knowledge')}/${locale}/${section}/${entity.slug}/`;
}

export function formatDate(value: string | null, locale: Locale): string {
  if (!value) return locale === 'zh-CN' ? '尚未审阅' : 'Not yet reviewed';
  return new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}
