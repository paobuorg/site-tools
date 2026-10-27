import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  calculateDistanceFromPace,
  calculatePace,
  calculatePaceFromPace,
  calculateRunWalk,
  calculateSplits,
  predictRaceTime,
  roundTo,
  type DistanceUnit,
  type RunWalkSegment,
  type SplitStrategy,
} from '../src/lib/calculators';

const casesDir = path.resolve(import.meta.dirname, '../../running-tools/data/cases');

function readCase<T>(caseId: string): T {
  return JSON.parse(fs.readFileSync(path.join(casesDir, `${caseId}.json`), 'utf8')) as T;
}

interface PaceCase {
  input: {
    mode: 'distance-time' | 'distance-pace' | 'time-pace';
    distance?: number;
    distanceUnit: DistanceUnit;
    durationSeconds?: number;
    paceSeconds?: number;
    paceUnit?: DistanceUnit;
  };
  expected: {
    distance?: number;
    distanceKm?: number;
    durationSeconds?: number;
    paceSecondsPerKm: number;
    paceSecondsPerMile: number;
    speedKmh: number;
  };
}

interface SplitsCase {
  input: {
    totalDistance: number;
    distanceUnit: DistanceUnit;
    totalSeconds: number;
    splitDistance: number;
    strategy?: SplitStrategy;
    delta?: number;
  };
  expected: {
    splitCount: number;
    splits: Array<{
      index: number;
      distance: number;
      cumulativeSeconds: number;
      splitSeconds: number;
    }>;
  };
}

test('published pace cases match the three calculation modes', () => {
  for (const caseId of [
    'case-pace-10k',
    'case-pace-5mi',
    'case-pace-distance-pace',
    'case-pace-time-pace',
  ]) {
    const item = readCase<PaceCase>(caseId);
    const input = item.input;
    const result =
      input.mode === 'distance-time'
        ? calculatePace({
            distance: input.distance!,
            distanceUnit: input.distanceUnit,
            durationSeconds: input.durationSeconds!,
          })
        : input.mode === 'distance-pace'
          ? calculatePaceFromPace({
              distance: input.distance!,
              distanceUnit: input.distanceUnit,
              paceSeconds: input.paceSeconds!,
              paceUnit: input.paceUnit!,
            })
          : calculateDistanceFromPace({
              durationSeconds: input.durationSeconds!,
              paceSeconds: input.paceSeconds!,
              paceUnit: input.paceUnit!,
              distanceUnit: input.distanceUnit,
            });

    assert.equal(result.displayPacePerKm, item.expected.paceSecondsPerKm, `${caseId} pace/km`);
    assert.equal(result.displayPacePerMile, item.expected.paceSecondsPerMile, `${caseId} pace/mi`);
    assert.equal(result.displaySpeedKmh, item.expected.speedKmh, `${caseId} speed`);
    if (item.expected.durationSeconds !== undefined) {
      assert.equal(result.displayDuration, item.expected.durationSeconds, `${caseId} duration`);
    }
    if (item.expected.distance !== undefined) {
      assert.equal(result.displayDistance, item.expected.distance, `${caseId} distance`);
    }
    if (item.expected.distanceKm !== undefined) {
      assert.equal(roundTo(result.distanceKm, 6), item.expected.distanceKm, `${caseId} distance km`);
    }
  }
});

test('pace rejects zero, negative and non-finite input in every mode', () => {
  for (const distance of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => calculatePace({ distance, distanceUnit: 'km', durationSeconds: 3000 }), /distance/);
    assert.throws(
      () => calculatePaceFromPace({ distance, distanceUnit: 'km', paceSeconds: 300, paceUnit: 'km' }),
      /distance/,
    );
  }
  for (const durationSeconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => calculatePace({ distance: 10, distanceUnit: 'km', durationSeconds }), /duration/);
    assert.throws(
      () =>
        calculateDistanceFromPace({
          durationSeconds,
          paceSeconds: 300,
          paceUnit: 'km',
          distanceUnit: 'km',
        }),
      /duration/,
    );
  }
  for (const paceSeconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => calculatePaceFromPace({ distance: 10, distanceUnit: 'km', paceSeconds, paceUnit: 'km' }),
      /pace/,
    );
    assert.throws(
      () =>
        calculateDistanceFromPace({
          durationSeconds: 3000,
          paceSeconds,
          paceUnit: 'km',
          distanceUnit: 'km',
        }),
      /pace/,
    );
  }
});

test('pace is unit-independent at the conversion boundary', () => {
  const metric = calculatePace({ distance: 5, distanceUnit: 'km', durationSeconds: 1500 });
  const imperial = calculatePace({ distance: 5 / 1.609344, distanceUnit: 'mi', durationSeconds: 1500 });
  assert.equal(metric.displayPacePerKm, imperial.displayPacePerKm);
  assert.equal(metric.displaySpeedKmh, imperial.displaySpeedKmh);
  const mixed = calculatePaceFromPace({
    distance: 5,
    distanceUnit: 'mi',
    paceSeconds: 300,
    paceUnit: 'km',
  });
  assert.equal(mixed.displayDuration, 2414);
  assert.equal(mixed.displayPacePerMile, 483);
});

test('published split cases match even and negative strategies', () => {
  for (const caseId of [
    'case-splits-10k',
    'case-splits-partial',
    'case-splits-mile',
    'case-splits-negative-crossing',
    'case-splits-negative-halves',
  ]) {
    const item = readCase<SplitsCase>(caseId);
    const result = calculateSplits(
      item.input.totalDistance,
      item.input.distanceUnit,
      item.input.totalSeconds,
      item.input.splitDistance,
      item.input.strategy ?? 'even',
      item.input.delta ?? 0.02,
    );
    assert.equal(result.splitCount, item.expected.splitCount, `${caseId} count`);
    assert.deepEqual(
      result.rows.map((row) => ({
        index: row.index,
        distance: row.distance,
        cumulativeSeconds: row.cumulativeSeconds,
        splitSeconds: row.splitSeconds,
      })),
      item.expected.splits,
      `${caseId} rows`,
    );
  }
});

test('largest-remainder allocation conserves the entered total', () => {
  const result = calculateSplits(10, 'km', 2999, 3);
  assert.equal(result.splitCount, 4);
  assert.deepEqual(
    result.rows.map((row) => row.splitSeconds),
    [900, 900, 899, 300],
  );
  assert.equal(
    result.rows.reduce((sum, row) => sum + row.splitSeconds, 0),
    2999,
  );
  assert.equal(result.rows.at(-1)?.cumulativeSeconds, 2999);
  assert.ok(result.rows.every((row) => row.splitSeconds >= 0));
});

test('zero delta makes a negative plan identical to an even plan', () => {
  const even = calculateSplits(10, 'km', 3000, 4);
  const negative = calculateSplits(10, 'km', 3000, 4, 'negative', 0);
  assert.deepEqual(negative.rows, even.rows);
});

test('splits reject invalid values, deltas and excessive split counts', () => {
  assert.throws(() => calculateSplits(0, 'km', 1500, 1), /totalDistance/);
  assert.throws(() => calculateSplits(5, 'km', 0, 1), /totalSeconds/);
  assert.throws(() => calculateSplits(5, 'km', 1500.5, 1), /totalSeconds/);
  assert.throws(() => calculateSplits(5, 'km', 1500, 0), /splitDistance/);
  assert.throws(() => calculateSplits(Number.NaN, 'km', 1500, 1), /totalDistance/);
  assert.throws(() => calculateSplits(10_001, 'km', 1500, 1), /tooManySplits/);
  assert.throws(() => calculateSplits(10, 'km', 3000, 4, 'surge' as SplitStrategy), /strategy/);
  assert.throws(() => calculateSplits(10, 'km', 3000, 4, 'negative', -0.01), /delta/);
  assert.throws(() => calculateSplits(10, 'km', 3000, 4, 'negative', 0.11), /delta/);
});

interface RunWalkCase {
  input: {
    mode: 'cycles' | 'duration';
    runSeconds: number;
    walkSeconds: number;
    cycles?: number;
    totalSeconds?: number;
  };
  expected: {
    requestedSeconds: number;
    scheduledSeconds: number;
    fullCycles: number;
    runSecondsTotal: number;
    walkSecondsTotal: number;
    truncated: boolean;
    segments: RunWalkSegment[];
  };
}

test('published run-walk cases match cycles and duration modes', () => {
  for (const caseId of [
    'case-run-walk-cycles',
    'case-run-walk-duration',
    'case-run-walk-zero-walk',
  ]) {
    const item = readCase<RunWalkCase>(caseId);
    const result = calculateRunWalk(item.input);
    assert.equal(result.requestedSeconds, item.expected.requestedSeconds, `${caseId} requested`);
    assert.equal(result.scheduledSeconds, item.expected.scheduledSeconds, `${caseId} scheduled`);
    assert.equal(result.fullCycles, item.expected.fullCycles, `${caseId} fullCycles`);
    assert.equal(result.runSecondsTotal, item.expected.runSecondsTotal, `${caseId} run total`);
    assert.equal(result.walkSecondsTotal, item.expected.walkSecondsTotal, `${caseId} walk total`);
    assert.equal(result.truncated, item.expected.truncated, `${caseId} truncated`);
    assert.deepEqual(result.segments, item.expected.segments, `${caseId} segments`);
  }
});

test('run-walk rejects invalid durations, cycles and segment explosions', () => {
  assert.throws(() => calculateRunWalk({ mode: 'cycles', runSeconds: 0, walkSeconds: 60, cycles: 2 }), /run/);
  assert.throws(() => calculateRunWalk({ mode: 'cycles', runSeconds: 60.5, walkSeconds: 30, cycles: 2 }), /run/);
  assert.throws(() => calculateRunWalk({ mode: 'cycles', runSeconds: 60, walkSeconds: -1, cycles: 2 }), /walk/);
  assert.throws(() => calculateRunWalk({ mode: 'cycles', runSeconds: 60, walkSeconds: 30.5, cycles: 2 }), /walk/);
  assert.throws(() => calculateRunWalk({ mode: 'cycles', runSeconds: 60, walkSeconds: 30 }), /cycles/);
  assert.throws(
    () => calculateRunWalk({ mode: 'cycles', runSeconds: 60, walkSeconds: 30, cycles: 0 }),
    /cycles/,
  );
  assert.throws(
    () => calculateRunWalk({ mode: 'cycles', runSeconds: 60, walkSeconds: 30, cycles: 1.5 }),
    /cycles/,
  );
  assert.throws(
    () => calculateRunWalk({ mode: 'cycles', runSeconds: 60, walkSeconds: 30, cycles: 1001 }),
    /cycles/,
  );
  assert.throws(
    () => calculateRunWalk({ mode: 'duration', runSeconds: 60, walkSeconds: 30, totalSeconds: 0 }),
    /totalSeconds/,
  );
  assert.throws(
    () =>
      calculateRunWalk({
        mode: 'duration',
        runSeconds: 60,
        walkSeconds: 30,
        totalSeconds: 7 * 24 * 3600 + 1,
      }),
    /totalSeconds/,
  );
  assert.throws(
    () => calculateRunWalk({ mode: 'duration', runSeconds: 1, walkSeconds: 0, totalSeconds: 4000 }),
    /tooManySegments/,
  );
  assert.throws(
    () => calculateRunWalk({ mode: 'interval' as 'cycles', runSeconds: 60, walkSeconds: 30, cycles: 2 }),
    /mode/,
  );
});

test('run-walk duration mode conserves the exact requested time', () => {
  for (const totalSeconds of [1, 59, 61, 180, 181, 401]) {
    const result = calculateRunWalk({ mode: 'duration', runSeconds: 120, walkSeconds: 60, totalSeconds });
    assert.equal(
      result.segments.reduce((sum, segment) => sum + segment.seconds, 0),
      totalSeconds,
      `total ${totalSeconds}`,
    );
    assert.equal(result.runSecondsTotal + result.walkSecondsTotal, totalSeconds);
    assert.ok(result.segments.every((segment) => segment.seconds > 0));
    assert.ok(result.segments.filter((segment) => segment.partial).length <= 1);
  }
});

interface RaceCase {
  input: {
    knownDistanceMeters: number;
    knownTimeSeconds: number;
    targetDistanceMeters: number;
  };
  expected: {
    predictedSeconds: number;
    ratio: number;
    paceSecondsPerKm: number;
    paceSecondsPerMile: number;
    speedKmh: number;
  };
}

test('published race prediction cases follow Riegel with exponent 1.06', () => {
  for (const caseId of [
    'case-race-predict-5k-10k',
    'case-race-predict-10k-half',
    'case-race-predict-half-marathon',
  ]) {
    const item = readCase<RaceCase>(caseId);
    const result = predictRaceTime(item.input);
    assert.equal(result.displayPredictedSeconds, item.expected.predictedSeconds, `${caseId} seconds`);
    assert.equal(roundTo(result.ratio, 6), item.expected.ratio, `${caseId} ratio`);
    assert.equal(result.displayPacePerKm, item.expected.paceSecondsPerKm, `${caseId} pace/km`);
    assert.equal(result.displayPacePerMile, item.expected.paceSecondsPerMile, `${caseId} pace/mi`);
    assert.equal(result.displaySpeedKmh, item.expected.speedKmh, `${caseId} speed`);
  }
});

test('race prediction rejects distances outside road races and invalid times', () => {
  assert.throws(
    () => predictRaceTime({ knownDistanceMeters: 4999, knownTimeSeconds: 1200, targetDistanceMeters: 10000 }),
    /knownDistance/,
  );
  assert.throws(
    () => predictRaceTime({ knownDistanceMeters: 5000, knownTimeSeconds: 1200, targetDistanceMeters: 42_196 }),
    /targetDistance/,
  );
  assert.throws(
    () => predictRaceTime({ knownDistanceMeters: 5000, knownTimeSeconds: 0, targetDistanceMeters: 10000 }),
    /knownTime/,
  );
  assert.throws(
    () =>
      predictRaceTime({
        knownDistanceMeters: Number.NaN,
        knownTimeSeconds: 1200,
        targetDistanceMeters: 10000,
      }),
    /knownDistance/,
  );
});
