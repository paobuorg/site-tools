import type { ContentEntity, ToolDetails } from '@paobu/core/content';
import type { Locale } from '@paobu/core/lib/i18n';
import { localePrefix } from '@paobu/core/lib/routing';
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
  'fueling-planner': 'pace',
  'route-elevation': 'track',
  'shoe-mileage': 'track',
  'race-checklist': 'pace',
  'training-load': 'pace',
  'heat-adjust': 'pace',
  'grade-adjusted-pace': 'pace',
  'carb-load-planner': 'pace',
  'sweat-rate': 'pace',
  'injury-risk-check': 'pace',
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
  'fueling-planner': 'drop',
  'route-elevation': 'ruler',
  'shoe-mileage': 'shoe',
  'race-checklist': 'check',
  'training-load': 'chart',
  'heat-adjust': 'sun',
  'grade-adjusted-pace': 'mountain',
  'carb-load-planner': 'spark',
  'sweat-rate': 'drop',
  'injury-risk-check': 'bone',
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
  return `${localePrefix(locale)}/tools/${entity.slug}/`;
}

export function entityHref(entity: ContentEntity, locale: Locale): string {
  const prefix = localePrefix(locale);
  if (entity.kind === 'tool') return toolHref(entity, locale);
  if (entity.kind === 'route') return `${siteOrigin('routes')}${prefix}/routes/${entity.slug}/`;
  const type = (entity.details as { contentType?: string }).contentType;
  const section = type === 'glossary' ? 'glossary' : type === 'learning-path' ? 'paths' : 'articles';
  return `${siteOrigin('knowledge')}${prefix}/${section}/${entity.slug}/`;
}

export function formatDate(value: string | null, locale: Locale): string {
  if (!value) return locale === 'zh-CN' ? '尚未核验' : 'Not yet checked';
  return new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}
