import { loadContent, defaultContentRoots } from '@paobu/core/content';

const roots = defaultContentRoots();
const preview = loadContent({ roots, allowUnreviewed: true });
const production = loadContent({ roots, allowUnreviewed: false });

const problems = [];
const tools = preview.allEntities.filter((entity) => entity.kind === 'tool');
const casesById = new Map(preview.cases.map((item) => [item.caseId, item]));
const referencedCases = new Set();

for (const entity of preview.allEntities) {
  if (entity.translations.length !== 2) {
    problems.push(`${entity.entityId} has ${entity.translations.length} translation(s), expected 2.`);
  }
  for (const locale of ['zh-CN', 'en']) {
    const rendered = entity.rendered[locale];
    if (!rendered) {
      problems.push(`${entity.entityId} is missing rendered ${locale} content.`);
      continue;
    }
    if (rendered.plainText.length < 200) {
      problems.push(`${entity.entityId} ${locale} body is suspiciously short (${rendered.plainText.length} characters).`);
    }
    if (/\/knowledge\//.test(rendered.plainText)) {
      problems.push(`${entity.entityId} ${locale} contains a stale /knowledge/ link.`);
    }
  }
}

for (const entity of tools) {
  const details = entity.details;
  if (details.toolId !== entity.entityId) {
    problems.push(`${entity.entityId} details.toolId is ${details.toolId}.`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(details.specVersion)) {
    problems.push(`${entity.entityId} has an invalid specVersion: ${details.specVersion}.`);
  }
  if (details.inputs.length === 0 || details.outputs.length === 0) {
    problems.push(`${entity.entityId} must declare inputs and outputs.`);
  }
  for (const port of [...details.inputs, ...details.outputs]) {
    if (!port.name || !port.type || !port.labels?.['zh-CN'] || !port.labels?.en) {
      problems.push(`${entity.entityId} port ${port.name || '(unnamed)'} is missing a bilingual label, type or name.`);
    }
  }
  if (!details.formulaDescription || !details.rounding || details.assumptions.length === 0) {
    problems.push(`${entity.entityId} must state its formula, rounding and assumptions.`);
  }
  if (details.caseRefs.length === 0) {
    problems.push(`${entity.entityId} has no independent cases.`);
  }
  for (const caseId of details.caseRefs) {
    referencedCases.add(caseId);
    const item = casesById.get(caseId);
    if (!item) {
      problems.push(`${entity.entityId} references missing case ${caseId}.`);
      continue;
    }
    if (item.toolId !== entity.entityId) {
      problems.push(`Case ${caseId} belongs to ${item.toolId}, not ${entity.entityId}.`);
    }
    if (Object.keys(item.input).length === 0 || Object.keys(item.expected).length === 0) {
      problems.push(`Case ${caseId} must include input and expected values.`);
    }
    if (!item.basis || item.basis.length < 20) {
      problems.push(`Case ${caseId} needs an independent basis.`);
    }
  }
  const sources = preview.sourcesFor(entity);
  if (sources.length === 0) {
    problems.push(`${entity.entityId} has no resolvable sources.`);
  }
  for (const source of sources) {
    if (!source.url.startsWith('https://') || source.claims.length === 0) {
      problems.push(`${entity.entityId} source ${source.sourceId} needs an HTTPS URL and claims.`);
    }
  }
}

for (const item of preview.cases) {
  if (!referencedCases.has(item.caseId)) {
    problems.push(`Case ${item.caseId} is not referenced by any tool.`);
  }
}

console.log(`Content roots: ${roots.routes}, ${roots.knowledge}, ${roots.tools}`);
console.log(`Tools: ${tools.length}`);
console.log(`Visible tools: ${preview.visible('tool').length}`);
console.log(`Independent cases: ${preview.cases.length}`);
console.log(`Production-visible entities: ${production.entities.length}`);

if (problems.length > 0) {
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log('Tool content validation passed.');
}
