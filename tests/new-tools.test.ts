import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { planFueling, FuelingInputError } from '../src/lib/fueling';
import { analyzeElevation } from '../src/lib/elevation';
import { summarizeShoe, validateShoe, ShoeInputError } from '../src/lib/shoe-mileage';
import { buildChecklist } from '../src/lib/race-checklist';
import { analyzeTrainingLoad, TrainingLoadInputError } from '../src/lib/training-load';
import { adjustForHeat, HeatAdjustInputError } from '../src/lib/heat-adjust';
import { checkInjuryRisk, InjuryRiskInputError } from '../src/lib/injury-risk-check';
import { gradeAdjustedPace, GradeAdjustedPaceInputError } from '../src/lib/grade-adjusted-pace';
import { planCarbLoad, CarbLoadPlannerInputError } from '../src/lib/carb-load-planner';
import { estimateSweatRate, SweatRateInputError } from '../src/lib/sweat-rate';

const toolsRoot = process.env.TOOLS_CONTENT_DIR
  ? path.resolve(process.env.TOOLS_CONTENT_DIR)
  : process.env.PAOBU_REPOS_DIR
    ? path.join(process.env.PAOBU_REPOS_DIR, 'running-handbook', 'tools')
    : path.resolve(import.meta.dirname, '../../running-handbook/tools');
const casesDir = path.join(toolsRoot, 'data/cases');

function readCase<T>(caseId: string): T {
  return JSON.parse(fs.readFileSync(path.join(casesDir, `${caseId}.json`), 'utf8')) as T;
}

function assertNumber(actual: number | null, expected: number, floating: boolean): void {
  assert.notEqual(actual, null, `Expected ${expected}, received null`);
  const tolerance = floating ? 1e-6 : 0;
  assert.ok(
    Math.abs((actual as number) - expected) <= tolerance,
    `Expected ${expected}, received ${actual}`,
  );
}

test('fueling planner returns a 30-60 g/h range and serving estimate', () => {
  const plan = planFueling({ durationMinutes: 90, productCarbsGrams: 25 });
  assert.equal(plan.durationHours, 1.5);
  assert.equal(plan.needsFuel, true);
  assert.equal(plan.lowTotalGrams, 45);
  assert.equal(plan.highTotalGrams, 90);
  assert.equal(plan.servingsLow, 2);
  assert.equal(plan.servingsHigh, 4);
});

test('fueling planner does not add carbohydrate for a short session', () => {
  const plan = planFueling({ durationMinutes: 45, productCarbsGrams: 25 });
  assert.equal(plan.needsFuel, false);
  assert.equal(plan.lowTotalGrams, 0);
  assert.equal(plan.highTotalGrams, 0);
  assert.equal(plan.servingsLow, 0);
});

test('fueling planner covers a long race and rejects invalid input', () => {
  const plan = planFueling({ durationMinutes: 180, productCarbsGrams: 30 });
  assert.equal(plan.lowTotalGrams, 90);
  assert.equal(plan.highTotalGrams, 180);
  assert.equal(plan.servingsLow, 3);
  assert.equal(plan.servingsHigh, 6);
  assert.throws(
    () => planFueling({ durationMinutes: 0, productCarbsGrams: 25 }),
    (error: unknown) => error instanceof FuelingInputError && error.field === 'duration',
  );
  assert.throws(
    () => planFueling({ durationMinutes: 90, productCarbsGrams: 0 }),
    (error: unknown) => error instanceof FuelingInputError && error.field === 'product',
  );
});

test('elevation analysis computes gain, loss and a profile', () => {
  const result = analyzeElevation({
    format: 'gpx',
    fileName: 'hill.gpx',
    segments: [[
      { lon: 0, lat: 0, elevation: 0 },
      { lon: 0, lat: 0.001, elevation: 100 },
      { lon: 0, lat: 0.002, elevation: 0 },
    ]],
  });
  assert.equal(result.gainMeters, 100);
  assert.equal(result.lossMeters, 100);
  assert.equal(result.minElevationMeters, 0);
  assert.equal(result.maxElevationMeters, 100);
  assert.ok((result.maxGradePercent ?? 0) > 80);
  assert.equal(result.profile.length, 3);
  assert.deepEqual(result.warnings, []);
});

test('elevation analysis refuses to invent gain when elevation is missing or partial', () => {
  const missing = analyzeElevation({
    format: 'gpx',
    fileName: 'missing.gpx',
    segments: [[
      { lon: 0, lat: 0, elevation: null },
      { lon: 0, lat: 0.001, elevation: null },
    ]],
  });
  assert.equal(missing.gainMeters, null);
  assert.equal(missing.profile.length, 0);
  assert.deepEqual(missing.warnings, [{ code: 'elevation-missing' }]);

  const partial = analyzeElevation({
    format: 'gpx',
    fileName: 'partial.gpx',
    segments: [[
      { lon: 0, lat: 0, elevation: 10 },
      { lon: 0, lat: 0.001, elevation: null },
      { lon: 0, lat: 0.002, elevation: 20 },
    ]],
  });
  assert.equal(partial.gainMeters, null);
  assert.deepEqual(partial.warnings, [{ code: 'elevation-partial' }]);
});

test('shoe mileage summarizes initial and logged distance without a universal replacement claim', () => {
  const shoe = validateShoe({ name: 'Daily trainer', initialKm: 100, reminderKm: 600 });
  const summary = summarizeShoe(shoe, [
    { id: 'r1', shoeId: shoe.id, date: '2026-10-27', distanceKm: 10 },
    { id: 'r2', shoeId: shoe.id, date: '2026-10-28', distanceKm: 5 },
  ]);
  assert.equal(summary.totalKm, 115);
  assert.equal(summary.runCount, 2);
  assert.equal(summary.remainingKm, 485);
  assert.equal(summary.percentOfReminder, 19.2);
  assert.equal(summary.lastRunDate, '2026-10-28');
  assert.throws(
    () => validateShoe({ name: ' ', initialKm: 0, reminderKm: 600 }),
    (error: unknown) => error instanceof ShoeInputError && error.field === 'name',
  );
});

test('published shoe mileage cases match', () => {
  const item = readCase<{
    input: {
      shoe: { id: string; name: string; initialKm: number; reminderKm: number };
      runs: Array<{ id: string; shoeId: string; date: string; distanceKm: number }>;
    };
    expected: {
      totalKm: number;
      runCount: number;
      remainingKm: number;
      percentOfReminder: number;
      lastRunDate: string;
    };
  }>('case-shoe-mileage-trail');
  const summary = summarizeShoe(item.input.shoe, item.input.runs);
  assertNumber(summary.totalKm, item.expected.totalKm, true);
  assertNumber(summary.runCount, item.expected.runCount, false);
  assertNumber(summary.remainingKm, item.expected.remainingKm, true);
  assertNumber(summary.percentOfReminder, item.expected.percentOfReminder, true);
  assert.equal(summary.lastRunDate, item.expected.lastRunDate);
});

test('race checklist changes with terrain, duration, weather and travel', () => {
  const basic = buildChecklist({
    raceType: 'road',
    duration: 'under-3h',
    weather: 'mild',
    travel: false,
  });
  assert.deepEqual(basic.map((section) => section.id), ['entry', 'clothing', 'fuel', 'logistics']);

  const full = buildChecklist({
    raceType: 'trail',
    duration: 'over-6h',
    weather: 'hot',
    travel: true,
  });
  assert.deepEqual(full.map((section) => section.id), [
    'entry',
    'clothing',
    'fuel',
    'logistics',
    'heat',
    'trail',
    'long-race',
    'travel',
  ]);
  assert.ok(full.some((section) => section.items.some((entry) => entry.id === 'headlamp')));
  assert.ok(full.some((section) => section.items.some((entry) => entry.id === 'heat-warning')));

  const wet = buildChecklist({
    raceType: 'road',
    duration: '3-6h',
    weather: 'rain',
    travel: false,
  });
  assert.ok(wet.some((section) => section.id === 'cold-wet'));
});

test('published race checklist cases match', () => {
  const item = readCase<{
    input: {
      raceType: 'road' | 'trail';
      duration: 'under-3h' | '3-6h' | 'over-6h';
      weather: 'mild' | 'hot' | 'cold' | 'rain';
      travel: boolean;
    };
    expected: { sectionIds: string[]; requiredItems: string[] };
  }>('case-race-checklist-road-rain');
  const sections = buildChecklist(item.input);
  assert.deepEqual(sections.map((section) => section.id), item.expected.sectionIds);
  const itemIds = new Set(sections.flatMap((section) => section.items.map((entry) => entry.id)));
  for (const required of item.expected.requiredItems) {
    assert.ok(itemIds.has(required), `Missing checklist item ${required}`);
  }
});

interface TrainingLoadCase {
  input: {
    weeklyTrainingMinutes: number;
    sessionsPerWeek: number;
    averageRpe: number;
    acuteLoad: number;
    chronicLoad: number;
  };
  expected: {
    acuteChronicRatio: number;
    weeklyRampPercent: number;
    band: string;
  };
}

test('training load normal case matches the typical-band case', () => {
  const testCase = readCase<TrainingLoadCase>('case-training-load-typical');
  const result = analyzeTrainingLoad(testCase.input);
  assertNumber(result.acuteChronicRatio, testCase.expected.acuteChronicRatio, true);
  assertNumber(result.weeklyRampPercent, testCase.expected.weeklyRampPercent, true);
  assert.equal(result.band, testCase.expected.band);
});

test('training load boundary case keeps a ratio of 1.5 in the elevated band', () => {
  const testCase = readCase<TrainingLoadCase>('case-training-load-boundary');
  const result = analyzeTrainingLoad(testCase.input);
  assertNumber(result.acuteChronicRatio, testCase.expected.acuteChronicRatio, true);
  assertNumber(result.weeklyRampPercent, testCase.expected.weeklyRampPercent, true);
  assert.equal(result.band, testCase.expected.band);
});

test('training load rejects sessions and RPE outside the declared range', () => {
  const testCase = readCase<TrainingLoadCase>('case-training-load-typical');
  assert.throws(
    () => analyzeTrainingLoad({ ...testCase.input, sessionsPerWeek: 0 }),
    (error: unknown) => error instanceof TrainingLoadInputError && error.field === 'sessions',
  );
  assert.throws(
    () => analyzeTrainingLoad({ ...testCase.input, averageRpe: 11 }),
    (error: unknown) => error instanceof TrainingLoadInputError && error.field === 'rpe',
  );
});

interface HeatAdjustCase {
  input: {
    temperatureC: number;
    relativeHumidityPercent: number;
    baselinePaceSecondsPerKm: number;
    durationMinutes: number;
  };
  expected: {
    heatScore: number;
    adjustedPaceLowSeconds: number;
    adjustedPaceHighSeconds: number;
    band: string;
  };
}

test('heat adjust normal case matches the very-hot case', () => {
  const testCase = readCase<HeatAdjustCase>('case-heat-adjust-very-hot');
  const result = adjustForHeat(testCase.input);
  assertNumber(result.heatScore, testCase.expected.heatScore, true);
  assertNumber(result.adjustedPaceLowSeconds, testCase.expected.adjustedPaceLowSeconds, false);
  assertNumber(result.adjustedPaceHighSeconds, testCase.expected.adjustedPaceHighSeconds, false);
  assert.equal(result.band, testCase.expected.band);
});

test('heat adjust boundary case keeps a score of 24.0 in the very-hot band', () => {
  const testCase = readCase<HeatAdjustCase>('case-heat-adjust-boundary');
  const result = adjustForHeat(testCase.input);
  assertNumber(result.heatScore, testCase.expected.heatScore, true);
  assertNumber(result.adjustedPaceLowSeconds, testCase.expected.adjustedPaceLowSeconds, false);
  assertNumber(result.adjustedPaceHighSeconds, testCase.expected.adjustedPaceHighSeconds, false);
  assert.equal(result.band, testCase.expected.band);
});

test('heat adjust rejects temperature and humidity outside the declared range', () => {
  const testCase = readCase<HeatAdjustCase>('case-heat-adjust-very-hot');
  assert.throws(
    () => adjustForHeat({ ...testCase.input, temperatureC: 60 }),
    (error: unknown) => error instanceof HeatAdjustInputError && error.field === 'temperature',
  );
  assert.throws(
    () => adjustForHeat({ ...testCase.input, relativeHumidityPercent: 101 }),
    (error: unknown) => error instanceof HeatAdjustInputError && error.field === 'humidity',
  );
});

interface InjuryRiskCase {
  input: {
    painDuringRun: boolean;
    painAtRestOrWalking: boolean;
    swelling: boolean;
    nightOrMorningPain: boolean;
    weeklyVolumeChangePercent: number;
    sleepHours: number;
    priorInjurySameArea: boolean;
  };
  expected: {
    score: number;
    band: string;
    redFlags: boolean;
  };
}

test('injury risk normal case matches the low-band case', () => {
  const testCase = readCase<InjuryRiskCase>('case-injury-risk-low');
  const result = checkInjuryRisk(testCase.input);
  assertNumber(result.score, testCase.expected.score, false);
  assert.equal(result.band, testCase.expected.band);
  assert.equal(result.redFlags, testCase.expected.redFlags);
  assert.ok(result.message.includes('not a diagnosis'));
});

test('injury risk boundary case matches the moderate-band case and flags rest pain', () => {
  const testCase = readCase<InjuryRiskCase>('case-injury-risk-moderate');
  const result = checkInjuryRisk(testCase.input);
  assertNumber(result.score, testCase.expected.score, false);
  assert.equal(result.band, testCase.expected.band);
  assert.equal(result.redFlags, testCase.expected.redFlags);

  const flagged = checkInjuryRisk({ ...testCase.input, painAtRestOrWalking: true });
  assert.equal(flagged.redFlags, true);
  assert.ok(flagged.message.startsWith('Seek assessment'));
});

interface GradeAdjustedCase {
  input: { actualPaceSecondsPerKm: number; gradientPercent: number };
  expected: {
    costJoulesPerKgPerM: number;
    costRatio: number;
    flatEquivalentPaceSeconds: number;
    direction: string;
  };
}

test('grade-adjusted pace matches the published uphill case', () => {
  const testCase = readCase<GradeAdjustedCase>('case-grade-adjusted-pace-uphill');
  const result = gradeAdjustedPace(testCase.input);
  assertNumber(result.costJoulesPerKgPerM, testCase.expected.costJoulesPerKgPerM, true);
  assertNumber(result.costRatio, testCase.expected.costRatio, true);
  assertNumber(result.flatEquivalentPaceSeconds, testCase.expected.flatEquivalentPaceSeconds, false);
  assert.equal(result.direction, testCase.expected.direction);
  assert.ok(result.note.includes('faster than the actual pace'));
});

test('grade-adjusted pace matches the published downhill case', () => {
  const testCase = readCase<GradeAdjustedCase>('case-grade-adjusted-pace-downhill');
  const result = gradeAdjustedPace(testCase.input);
  assertNumber(result.costJoulesPerKgPerM, testCase.expected.costJoulesPerKgPerM, true);
  assertNumber(result.costRatio, testCase.expected.costRatio, true);
  assertNumber(result.flatEquivalentPaceSeconds, testCase.expected.flatEquivalentPaceSeconds, false);
  assert.equal(result.direction, testCase.expected.direction);
  assert.ok(result.note.includes('cheaper per metre'));
});

test('grade-adjusted pace treats zero gradient as neutral and rejects out-of-range input', () => {
  const flat = gradeAdjustedPace({ actualPaceSecondsPerKm: 300, gradientPercent: 0 });
  assertNumber(flat.costJoulesPerKgPerM, 3.6, true);
  assertNumber(flat.costRatio, 1, true);
  assertNumber(flat.flatEquivalentPaceSeconds, 300, false);
  assert.equal(flat.direction, 'flat');

  const steep = gradeAdjustedPace({ actualPaceSecondsPerKm: 300, gradientPercent: -30 });
  assert.ok(steep.note.includes('Steep descent'));

  assert.throws(
    () => gradeAdjustedPace({ actualPaceSecondsPerKm: 300, gradientPercent: 46 }),
    (error: unknown) => error instanceof GradeAdjustedPaceInputError && error.field === 'gradient',
  );
  assert.throws(
    () => gradeAdjustedPace({ actualPaceSecondsPerKm: 0, gradientPercent: 5 }),
    (error: unknown) => error instanceof GradeAdjustedPaceInputError && error.field === 'pace',
  );
  assert.throws(
    () => gradeAdjustedPace({ actualPaceSecondsPerKm: Number.NaN, gradientPercent: 5 }),
    (error: unknown) => error instanceof GradeAdjustedPaceInputError && error.code === 'not-finite',
  );
});

test('injury risk rejects sleep hours outside the declared range', () => {
  const testCase = readCase<InjuryRiskCase>('case-injury-risk-low');
  assert.throws(
    () => checkInjuryRisk({ ...testCase.input, sleepHours: 25 }),
    (error: unknown) => error instanceof InjuryRiskInputError && error.field === 'sleep',
  );
  assert.throws(
    () => checkInjuryRisk({ ...testCase.input, weeklyVolumeChangePercent: Number.NaN }),
    (error: unknown) => error instanceof InjuryRiskInputError && error.field === 'volume',
  );
});

test('carb-load planner matches the published marathon case', () => {
  const testCase = readCase<{
    input: {
      bodyMassKg: number;
      eventDurationMinutes: number;
      loadWindowHours: number;
    };
    expected: {
      indicated: boolean;
      dailyLowGrams: number;
      dailyHighGrams: number;
      windowTotalLowGrams: number;
      windowTotalHighGrams: number;
    };
  }>('case-carb-load-planner-marathon');
  const result = planCarbLoad(testCase.input);
  assert.equal(result.indicated, testCase.expected.indicated);
  assertNumber(result.dailyLowGrams, testCase.expected.dailyLowGrams, false);
  assertNumber(result.dailyHighGrams, testCase.expected.dailyHighGrams, false);
  assertNumber(result.windowTotalLowGrams, testCase.expected.windowTotalLowGrams, false);
  assertNumber(result.windowTotalHighGrams, testCase.expected.windowTotalHighGrams, false);
  assert.ok(result.note.includes('indicated'));
});

test('carb-load planner flags a short race as not indicated', () => {
  const testCase = readCase<{
    input: {
      bodyMassKg: number;
      eventDurationMinutes: number;
      loadWindowHours: number;
    };
    expected: {
      indicated: boolean;
      dailyLowGrams: number;
      dailyHighGrams: number;
      windowTotalLowGrams: number;
      windowTotalHighGrams: number;
    };
  }>('case-carb-load-planner-short-race');
  const result = planCarbLoad(testCase.input);
  assert.equal(result.indicated, testCase.expected.indicated);
  assertNumber(result.windowTotalLowGrams, testCase.expected.windowTotalLowGrams, false);
  assertNumber(result.windowTotalHighGrams, testCase.expected.windowTotalHighGrams, false);
  assert.ok(result.note.includes('not indicated'));
});

test('carb-load planner treats exactly 90 minutes as not indicated and rejects out-of-range input', () => {
  const boundary = planCarbLoad({
    bodyMassKg: 70,
    eventDurationMinutes: 90,
    loadWindowHours: 36,
  });
  assert.equal(boundary.indicated, false);

  assert.throws(
    () => planCarbLoad({ bodyMassKg: 29, eventDurationMinutes: 240, loadWindowHours: 48 }),
    (error: unknown) => error instanceof CarbLoadPlannerInputError && error.field === 'mass',
  );
  assert.throws(
    () => planCarbLoad({ bodyMassKg: 70, eventDurationMinutes: 240, loadWindowHours: 35 }),
    (error: unknown) => error instanceof CarbLoadPlannerInputError && error.field === 'window',
  );
  assert.throws(
    () => planCarbLoad({
      bodyMassKg: 70,
      eventDurationMinutes: Number.NaN,
      loadWindowHours: 48,
    }),
    (error: unknown) => error instanceof CarbLoadPlannerInputError && error.code === 'not-finite',
  );
});

test('sweat-rate estimate matches the one-hour case', () => {
  const testCase = readCase<{
    input: {
      preWeightKg: number;
      postWeightKg: number;
      fluidIntakeLiters: number;
      durationMinutes: number;
    };
    expected: {
      netLossLiters: number;
      sweatRateLitersPerHour: number;
      bodyMassLossPercent: number;
      aboveTwoPercent: boolean;
    };
  }>('case-sweat-rate-hour-run');
  const result = estimateSweatRate(testCase.input);
  assertNumber(result.netLossLiters, testCase.expected.netLossLiters, false);
  assertNumber(result.sweatRateLitersPerHour, testCase.expected.sweatRateLitersPerHour, false);
  assertNumber(result.bodyMassLossPercent, testCase.expected.bodyMassLossPercent, false);
  assert.equal(result.aboveTwoPercent, testCase.expected.aboveTwoPercent);
});

test('sweat-rate estimate matches the ninety-minute case', () => {
  const testCase = readCase<{
    input: {
      preWeightKg: number;
      postWeightKg: number;
      fluidIntakeLiters: number;
      durationMinutes: number;
    };
    expected: {
      netLossLiters: number;
      sweatRateLitersPerHour: number;
      bodyMassLossPercent: number;
      aboveTwoPercent: boolean;
    };
  }>('case-sweat-rate-ninety-minutes');
  const result = estimateSweatRate(testCase.input);
  assertNumber(result.netLossLiters, testCase.expected.netLossLiters, false);
  assertNumber(result.sweatRateLitersPerHour, testCase.expected.sweatRateLitersPerHour, false);
  assertNumber(result.bodyMassLossPercent, testCase.expected.bodyMassLossPercent, false);
  assert.equal(result.aboveTwoPercent, testCase.expected.aboveTwoPercent);
});

test('sweat-rate keeps exactly 2% below the flag and rejects inconsistent or out-of-range input', () => {
  const boundary = estimateSweatRate({
    preWeightKg: 70,
    postWeightKg: 68.6,
    fluidIntakeLiters: 0,
    durationMinutes: 60,
  });
  assertNumber(boundary.netLossLiters, 1.4, false);
  assertNumber(boundary.sweatRateLitersPerHour, 1.4, false);
  assertNumber(boundary.bodyMassLossPercent, 2, false);
  assert.equal(boundary.aboveTwoPercent, false);

  const above = estimateSweatRate({
    preWeightKg: 70,
    postWeightKg: 68.4,
    fluidIntakeLiters: 0.2,
    durationMinutes: 60,
  });
  assertNumber(above.netLossLiters, 1.8, false);
  assert.equal(above.aboveTwoPercent, true);

  assert.throws(
    () => estimateSweatRate({
      preWeightKg: 70,
      postWeightKg: 71,
      fluidIntakeLiters: 0,
      durationMinutes: 60,
    }),
    (error: unknown) => error instanceof SweatRateInputError && error.code === 'inconsistent',
  );
  assert.throws(
    () => estimateSweatRate({
      preWeightKg: 29,
      postWeightKg: 28.5,
      fluidIntakeLiters: 0,
      durationMinutes: 60,
    }),
    (error: unknown) => error instanceof SweatRateInputError && error.field === 'weights',
  );
  assert.throws(
    () => estimateSweatRate({
      preWeightKg: 70,
      postWeightKg: 69.2,
      fluidIntakeLiters: 11,
      durationMinutes: 60,
    }),
    (error: unknown) => error instanceof SweatRateInputError && error.field === 'intake',
  );
  assert.throws(
    () => estimateSweatRate({
      preWeightKg: 70,
      postWeightKg: 69.2,
      fluidIntakeLiters: 0.5,
      durationMinutes: 0,
    }),
    (error: unknown) => error instanceof SweatRateInputError && error.field === 'duration',
  );
  assert.throws(
    () => estimateSweatRate({
      preWeightKg: 70,
      postWeightKg: 69.2,
      fluidIntakeLiters: 0.5,
      durationMinutes: Number.NaN,
    }),
    (error: unknown) => error instanceof SweatRateInputError && error.code === 'not-finite',
  );
});
