export type DistanceUnit = 'km' | 'mi';
export type SplitStrategy = 'even' | 'negative';
export type RunWalkMode = 'cycles' | 'duration';
export type RunWalkSegmentKind = 'run' | 'walk';

export const RIEGEL_EXPONENT = 1.06;
export const RACE_MIN_METERS = 5000;
export const RACE_MAX_METERS = 42195;
export const MAX_RUN_WALK_SECONDS = 7 * 24 * 3600;

export interface RunWalkInput {
  mode: RunWalkMode;
  runSeconds: number;
  walkSeconds: number;
  cycles?: number;
  totalSeconds?: number;
}

export interface RunWalkSegment {
  cycle: number;
  kind: RunWalkSegmentKind;
  seconds: number;
  partial: boolean;
}

export interface RunWalkResult {
  mode: RunWalkMode;
  requestedSeconds: number;
  scheduledSeconds: number;
  fullCycles: number;
  segments: RunWalkSegment[];
  runSecondsTotal: number;
  walkSecondsTotal: number;
  truncated: boolean;
}

export interface RacePredictInput {
  knownDistanceMeters: number;
  knownTimeSeconds: number;
  targetDistanceMeters: number;
}

export interface RacePredictResult {
  predictedSeconds: number;
  displayPredictedSeconds: number;
  ratio: number;
  paceSecondsPerKm: number;
  paceSecondsPerMile: number;
  speedKmh: number;
  displayPacePerKm: number;
  displayPacePerMile: number;
  displaySpeedKmh: number;
}

export interface PaceInput {
  distance: number;
  distanceUnit: DistanceUnit;
  durationSeconds: number;
}

export interface PaceFromPaceInput {
  distance: number;
  distanceUnit: DistanceUnit;
  paceSeconds: number;
  paceUnit: DistanceUnit;
}

export interface DistanceFromPaceInput {
  durationSeconds: number;
  paceSeconds: number;
  paceUnit: DistanceUnit;
  distanceUnit: DistanceUnit;
}

export interface PaceResult {
  distance: number;
  distanceKm: number;
  durationSeconds: number;
  paceSecondsPerKm: number;
  paceSecondsPerMile: number;
  speedKmh: number;
  displayDistance: number;
  displayDuration: number;
  displayPacePerKm: number;
  displayPacePerMile: number;
  displaySpeedKmh: number;
}

export interface SplitRow {
  index: number;
  distance: number;
  cumulativeSeconds: number;
  splitSeconds: number;
}

export interface SplitsResult {
  splitCount: number;
  splitDistance: number;
  rows: SplitRow[];
}

const MILE_METERS = 1609.344;

export function unitToMeters(unit: DistanceUnit): number {
  return unit === 'mi' ? MILE_METERS : 1000;
}

export function distanceToKm(distance: number, unit: DistanceUnit): number {
  return distance * (unitToMeters(unit) / 1000);
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function derivePace(
  distanceMeters: number,
  durationSeconds: number,
  displayUnit: DistanceUnit,
): PaceResult {
  const distanceKm = distanceMeters / 1000;
  const paceSecondsPerKm = durationSeconds / distanceKm;
  const paceSecondsPerMile = paceSecondsPerKm * (MILE_METERS / 1000);
  const speedKmh = distanceKm / (durationSeconds / 3600);
  return {
    distance: distanceMeters / unitToMeters(displayUnit),
    distanceKm,
    durationSeconds,
    paceSecondsPerKm,
    paceSecondsPerMile,
    speedKmh,
    displayDistance: roundTo(distanceMeters / unitToMeters(displayUnit), 3),
    displayDuration: Math.round(durationSeconds),
    displayPacePerKm: Math.round(paceSecondsPerKm),
    displayPacePerMile: Math.round(paceSecondsPerMile),
    displaySpeedKmh: roundTo(speedKmh, 2),
  };
}

export function calculatePace(input: PaceInput): PaceResult {
  const { distance, distanceUnit, durationSeconds } = input;
  if (!Number.isFinite(distance) || distance <= 0) {
    throw new Error('distance');
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error('duration');
  }
  return derivePace(distance * unitToMeters(distanceUnit), durationSeconds, distanceUnit);
}

export function calculatePaceFromPace(input: PaceFromPaceInput): PaceResult {
  const { distance, distanceUnit, paceSeconds, paceUnit } = input;
  if (!Number.isFinite(distance) || distance <= 0) throw new Error('distance');
  if (!Number.isFinite(paceSeconds) || paceSeconds <= 0) throw new Error('pace');
  const distanceMeters = distance * unitToMeters(distanceUnit);
  const durationSeconds = (paceSeconds * distanceMeters) / unitToMeters(paceUnit);
  return derivePace(distanceMeters, durationSeconds, distanceUnit);
}

export function calculateDistanceFromPace(input: DistanceFromPaceInput): PaceResult {
  const { durationSeconds, paceSeconds, paceUnit, distanceUnit } = input;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('duration');
  if (!Number.isFinite(paceSeconds) || paceSeconds <= 0) throw new Error('pace');
  const distanceMeters = (durationSeconds / paceSeconds) * unitToMeters(paceUnit);
  return derivePace(distanceMeters, durationSeconds, distanceUnit);
}

export function calculateSplits(
  totalDistance: number,
  distanceUnit: DistanceUnit,
  totalSeconds: number,
  splitDistance: number,
  strategy: SplitStrategy = 'even',
  delta = 0.02,
): SplitsResult {
  if (!Number.isFinite(totalDistance) || totalDistance <= 0) throw new Error('totalDistance');
  if (!Number.isInteger(totalSeconds) || totalSeconds <= 0) throw new Error('totalSeconds');
  if (!Number.isFinite(splitDistance) || splitDistance <= 0) throw new Error('splitDistance');
  if (strategy !== 'even' && strategy !== 'negative') throw new Error('strategy');
  if (strategy === 'negative' && (!Number.isFinite(delta) || delta < 0 || delta > 0.1)) {
    throw new Error('delta');
  }

  const totalMeters = totalDistance * unitToMeters(distanceUnit);
  const splitMeters = splitDistance * unitToMeters(distanceUnit);
  const count = Math.ceil(totalMeters / splitMeters);
  if (count > 10000) throw new Error('tooManySplits');
  const midpointMeters = totalMeters / 2;
  const firstHalfPace = strategy === 'negative' ? (totalSeconds * (1 + delta)) / totalMeters : totalSeconds / totalMeters;
  const secondHalfPace = strategy === 'negative' ? (totalSeconds * (1 - delta)) / totalMeters : totalSeconds / totalMeters;

  const exactSeconds: number[] = [];
  const rowDistances: number[] = [];
  for (let index = 1; index <= count; index += 1) {
    const startMeters = (index - 1) * splitMeters;
    const endMeters = Math.min(index * splitMeters, totalMeters);
    let seconds: number;
    if (strategy === 'even') {
      seconds = (endMeters - startMeters) * firstHalfPace;
    } else if (endMeters <= midpointMeters) {
      seconds = (endMeters - startMeters) * firstHalfPace;
    } else if (startMeters >= midpointMeters) {
      seconds = (endMeters - startMeters) * secondHalfPace;
    } else {
      seconds =
        (midpointMeters - startMeters) * firstHalfPace +
        (endMeters - midpointMeters) * secondHalfPace;
    }
    exactSeconds.push(seconds);
    rowDistances.push((endMeters - startMeters) / unitToMeters(distanceUnit));
  }

  const integerSeconds = exactSeconds.map((value) => Math.floor(value));
  let remaining = totalSeconds - integerSeconds.reduce((sum, value) => sum + value, 0);
  const order = exactSeconds
    .map((value, index) => ({
      index,
      remainder: Math.round((value - Math.floor(value)) * 1e9) / 1e9,
    }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let slot = 0; slot < order.length && remaining > 0; slot += 1) {
    integerSeconds[order[slot]!.index] += 1;
    remaining -= 1;
  }

  const rows: SplitRow[] = [];
  let cumulativeSeconds = 0;
  for (let index = 0; index < count; index += 1) {
    const splitSeconds = integerSeconds[index]!;
    cumulativeSeconds += splitSeconds;
    rows.push({
      index: index + 1,
      distance: rowDistances[index]!,
      cumulativeSeconds,
      splitSeconds,
    });
  }
  return { splitCount: count, splitDistance, rows };
}

export function calculateRunWalk(input: RunWalkInput): RunWalkResult {
  const { mode, runSeconds, walkSeconds } = input;
  if (!Number.isInteger(runSeconds) || runSeconds <= 0) throw new Error('run');
  if (!Number.isInteger(walkSeconds) || walkSeconds < 0) throw new Error('walk');

  const segments: RunWalkSegment[] = [];
  let cycleSeconds: number;
  let scheduledSeconds: number;
  let fullCycles: number;
  let requestedSeconds: number;
  let truncated = false;
  const pushSegment = (cycle: number, kind: RunWalkSegmentKind, seconds: number, partial: boolean) => {
    if (segments.length >= 3000) throw new Error('tooManySegments');
    segments.push({ cycle, kind, seconds, partial });
  };

  if (mode === 'cycles') {
    const cycles = input.cycles;
    if (cycles === undefined || !Number.isInteger(cycles) || cycles < 1 || cycles > 1000) {
      throw new Error('cycles');
    }
    cycleSeconds = runSeconds + walkSeconds;
    scheduledSeconds = cycleSeconds * cycles;
    if (scheduledSeconds > MAX_RUN_WALK_SECONDS) throw new Error('totalSeconds');
    for (let cycle = 1; cycle <= cycles; cycle += 1) {
      pushSegment(cycle, 'run', runSeconds, false);
      if (walkSeconds > 0) pushSegment(cycle, 'walk', walkSeconds, false);
    }
    fullCycles = cycles;
    requestedSeconds = scheduledSeconds;
  } else if (mode === 'duration') {
    const totalSeconds = input.totalSeconds;
    if (
      totalSeconds === undefined ||
      !Number.isInteger(totalSeconds) ||
      totalSeconds <= 0 ||
      totalSeconds > MAX_RUN_WALK_SECONDS
    ) {
      throw new Error('totalSeconds');
    }
    let remaining = totalSeconds;
    let cycle = 1;
    while (remaining > 0) {
      const runPart = Math.min(runSeconds, remaining);
      pushSegment(cycle, 'run', runPart, runPart < runSeconds);
      if (runPart < runSeconds) {
        truncated = true;
        remaining = 0;
        break;
      }
      remaining -= runPart;
      if (remaining <= 0) break;
      if (walkSeconds > 0) {
        const walkPart = Math.min(walkSeconds, remaining);
        pushSegment(cycle, 'walk', walkPart, walkPart < walkSeconds);
        if (walkPart < walkSeconds) {
          truncated = true;
          remaining = 0;
          break;
        }
        remaining -= walkPart;
      }
      cycle += 1;
    }
    cycleSeconds = runSeconds + walkSeconds;
    fullCycles = Math.floor(totalSeconds / cycleSeconds);
    requestedSeconds = totalSeconds;
    scheduledSeconds = totalSeconds;
  } else {
    throw new Error('mode');
  }

  const runSecondsTotal = segments
    .filter((segment) => segment.kind === 'run')
    .reduce((sum, segment) => sum + segment.seconds, 0);
  const walkSecondsTotal = segments
    .filter((segment) => segment.kind === 'walk')
    .reduce((sum, segment) => sum + segment.seconds, 0);

  return {
    mode,
    requestedSeconds,
    scheduledSeconds,
    fullCycles,
    segments,
    runSecondsTotal,
    walkSecondsTotal,
    truncated,
  };
}

export function predictRaceTime(input: RacePredictInput): RacePredictResult {
  const { knownDistanceMeters, knownTimeSeconds, targetDistanceMeters } = input;
  if (
    !Number.isFinite(knownDistanceMeters) ||
    knownDistanceMeters < RACE_MIN_METERS ||
    knownDistanceMeters > RACE_MAX_METERS
  ) {
    throw new Error('knownDistance');
  }
  if (!Number.isFinite(knownTimeSeconds) || knownTimeSeconds <= 0) throw new Error('knownTime');
  if (
    !Number.isFinite(targetDistanceMeters) ||
    targetDistanceMeters < RACE_MIN_METERS ||
    targetDistanceMeters > RACE_MAX_METERS
  ) {
    throw new Error('targetDistance');
  }
  const ratio = targetDistanceMeters / knownDistanceMeters;
  const predictedSeconds = knownTimeSeconds * ratio ** RIEGEL_EXPONENT;
  const targetKm = targetDistanceMeters / 1000;
  const paceSecondsPerKm = predictedSeconds / targetKm;
  const paceSecondsPerMile = paceSecondsPerKm * (MILE_METERS / 1000);
  const speedKmh = targetKm / (predictedSeconds / 3600);
  return {
    predictedSeconds,
    displayPredictedSeconds: Math.round(predictedSeconds),
    ratio,
    paceSecondsPerKm,
    paceSecondsPerMile,
    speedKmh,
    displayPacePerKm: Math.round(paceSecondsPerKm),
    displayPacePerMile: Math.round(paceSecondsPerMile),
    displaySpeedKmh: roundTo(speedKmh, 2),
  };
}
