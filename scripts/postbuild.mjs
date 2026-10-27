import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadLocalEnv, projectRoot } from './load-env.mjs';

loadLocalEnv();

const { loadContent, defaultContentRoots, enrichSearchContent, expandSearchAliases } =
  await import('@paobu/core/content');
const { writeHostingFiles, writeReleaseManifest } = await import('@paobu/core/lib/release');
const { createIndex, close } = await import('pagefind');

const distDir = path.join(projectRoot, 'dist');
if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  throw new Error('dist/index.html is missing. Run astro build before postbuild.');
}

const allowUnreviewed = process.env.PREVIEW_UNREVIEWED === '1';
const content = loadContent({ roots: defaultContentRoots(), allowUnreviewed });
const localeLanguage = { 'zh-CN': 'zh', en: 'en' };
const records = [];

for (const entity of content.visible('tool')) {
  const details = entity.details;
  for (const locale of ['zh-CN', 'en']) {
    const translation = content.translation(entity, locale);
    const other = content.translation(entity, locale === 'zh-CN' ? 'en' : 'zh-CN');
    const aliases = new Set([
      other.title,
      ...translation.aliases,
      details.specVersion,
      entity.slug.replace(/-/g, ' '),
      ...details.inputs.map((port) => port.name),
      ...details.outputs.map((port) => port.name),
    ]);
    const aliasText = expandSearchAliases([
      translation.title,
      translation.summary,
      ...[...aliases].filter(Boolean),
    ]);
    const body = enrichSearchContent(
      `${translation.title}\n${translation.summary}\n\n${translation.plainText}\n\n${aliasText.join(' ')}`,
    );
    records.push({
      url: `/${locale}/tools/${entity.slug}/`,
      content: body,
      language: localeLanguage[locale],
      meta: {
        title: translation.title,
        summary: translation.summary,
        kind: entity.kind,
        site: 'tools',
        locale,
        status: entity.status,
        preview: entity.status === 'published' ? '0' : '1',
        specVersion: details.specVersion,
        toolId: details.toolId,
      },
      filters: {
        locale: [locale],
        kind: [entity.kind],
        site: ['tools'],
      },
    });
  }
}

const pagefindDir = path.join(distDir, 'pagefind');
fs.rmSync(pagefindDir, { recursive: true, force: true });
const created = await createIndex({ verbose: false });
if (!created.index) {
  throw new Error(`Pagefind could not create an index: ${created.errors.join('; ')}`);
}
let added = 0;
for (const record of records) {
  const response = await created.index.addCustomRecord(record);
  if (response.errors.length > 0) {
    throw new Error(`Pagefind record ${record.url}: ${response.errors.join('; ')}`);
  }
  added += 1;
}
const written = await created.index.writeFiles({ outputPath: pagefindDir });
if (written.errors.length > 0) {
  throw new Error(`Pagefind write failed: ${written.errors.join('; ')}`);
}
await close();

const manifest = {
  generatedAt: new Date().toISOString(),
  site: 'tools',
  preview: allowUnreviewed,
  recordCount: added,
  dataVersion: content
    .visible('tool')
    .map((entity) => `${entity.entityId}:${entity.updatedAt}:${entity.status}`),
};
fs.writeFileSync(path.join(distDir, 'search-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const digest = createHash('sha256');
for (const record of records) digest.update(`${record.url}\n${record.meta.title}\n`);
console.log(`Pagefind indexed ${added} local tool records (preview=${allowUnreviewed}).`);
console.log(`Search snapshot digest: ${digest.digest('hex').slice(0, 16)}`);

const origin = 'https://tools.paobu.org';
const hosting = writeHostingFiles({ distDir, origin, preview: allowUnreviewed });
writeReleaseManifest({
  distDir,
  origin,
  preview: allowUnreviewed,
  site: 'tools',
  projectRoot,
  coreLockPath: path.join(projectRoot, 'core.lock.json'),
  contentLockPath: path.join(projectRoot, 'content.lock.json'),
  searchRecords: added,
  hosting,
});
console.log(`Hosting files: ${hosting.sitemapUrls} sitemap URLs across ${hosting.htmlPages} HTML pages.`);
