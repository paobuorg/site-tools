import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runPlanner } from '../src/lib/planners';

const toolsRoot = process.env.TOOLS_CONTENT_DIR
  ? path.resolve(process.env.TOOLS_CONTENT_DIR)
  : process.env.PAOBU_REPOS_DIR
    ? path.join(process.env.PAOBU_REPOS_DIR, 'running-handbook', 'tools')
    : path.resolve(import.meta.dirname, '../../running-handbook/tools');
const casesDir = path.join(toolsRoot, 'data/cases');

const cases = [
  'case-recovery-planner-marathon-47',
  'case-recovery-planner-5k-32',
  'case-recovery-planner-100mi-58',
  'case-race-calendar-planner-marathon',
  'case-race-calendar-planner-5k',
  'case-race-calendar-planner-ultra-skip',
  'case-race-travel-planner-tokyo',
  'case-race-travel-planner-new-york',
  'case-race-travel-planner-same-zone',
  'case-course-recon-checklist-road-marathon',
  'case-course-recon-checklist-mountain-100',
  'case-course-recon-checklist-half-low',
  'case-altitude-acclimation-2300',
  'case-altitude-acclimation-3500',
  'case-altitude-acclimation-4200',
  'case-trail-vertical-50k',
  'case-trail-vertical-half',
  'case-trail-vertical-100k',
];

for (const caseId of cases) {
  test(`published planner case ${caseId} matches`, () => {
    const record = JSON.parse(fs.readFileSync(path.join(casesDir, `${caseId}.json`), 'utf8')) as {
      toolId: string;
      input: Record<string, string | number | boolean>;
      expected: Record<string, unknown>;
    };
    const slug = record.toolId.replace('tool:', '');
    assert.deepEqual(runPlanner(slug, record.input), record.expected, caseId);
  });
}
