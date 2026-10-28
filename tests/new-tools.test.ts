import test from 'node:test';
import assert from 'node:assert/strict';
import { planFueling, FuelingInputError } from '../src/lib/fueling';
import { analyzeElevation } from '../src/lib/elevation';
import { summarizeShoe, validateShoe, ShoeInputError } from '../src/lib/shoe-mileage';
import { buildChecklist } from '../src/lib/race-checklist';

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
