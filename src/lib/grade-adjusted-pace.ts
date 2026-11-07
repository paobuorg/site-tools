export const GAP_MIN_GRADIENT_PERCENT = -45;
export const GAP_MAX_GRADIENT_PERCENT = 45;

export interface GradeAdjustedPaceInput {
  actualPaceSecondsPerKm: number;
  gradientPercent: number;
}

export type GradientDirection = 'uphill' | 'downhill' | 'flat';

export interface GradeAdjustedPaceResult {
  costJoulesPerKgPerM: number;
  costRatio: number;
  flatEquivalentPaceSeconds: number;
  direction: GradientDirection;
  note: string;
}

export class GradeAdjustedPaceInputError extends Error {
  field: 'pace' | 'gradient';
  code: 'range' | 'not-finite';

  constructor(
    field: GradeAdjustedPaceInputError['field'],
    code: GradeAdjustedPaceInputError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'GradeAdjustedPaceInputError';
    this.field = field;
    this.code = code;
  }
}

function assertFinite(
  value: number,
  field: GradeAdjustedPaceInputError['field'],
  label: string,
): void {
  if (!Number.isFinite(value)) {
    throw new GradeAdjustedPaceInputError(field, 'not-finite', `${label} must be finite.`);
  }
}

// Minetti et al. (2002) fifth-order polynomial for the metabolic cost of running
// on a treadmill gradient, in joules per kilogram per metre.
export function runningCostJoulesPerKgPerM(gradientPercent: number): number {
  const i = gradientPercent / 100;
  return (
    155.4 * i ** 5 -
    30.4 * i ** 4 -
    43.3 * i ** 3 +
    46.3 * i ** 2 +
    19.5 * i +
    3.6
  );
}

const FLAT_COST = 3.6;

function directionFor(gradientPercent: number): GradientDirection {
  if (gradientPercent > 0) return 'uphill';
  if (gradientPercent < 0) return 'downhill';
  return 'flat';
}

function noteFor(gradientPercent: number, direction: GradientDirection): string {
  if (direction === 'flat') {
    return 'Flat gradient: the flat-equivalent pace equals the actual pace.';
  }
  if (direction === 'uphill') {
    return 'Uphill running costs more per metre, so the flat-equivalent pace is faster than the actual pace. It estimates equal metabolic cost, not a pace you could necessarily hold on the flat.';
  }
  if (gradientPercent < -25) {
    return 'Steep descent: in this model the cost stops falling below roughly -20% to -25% and rises again on very steep slopes. The model does not include braking, eccentric muscle damage or technical terrain, so treat the steep-downhill output as a lower bound on effort rather than permission to run fast.';
  }
  return 'Moderate descent: this model treats downhill running as cheaper per metre, so the flat-equivalent pace is slower than the actual pace. The model does not capture braking or eccentric muscle damage, which rise on steeper descents.';
}

export function gradeAdjustedPace(input: GradeAdjustedPaceInput): GradeAdjustedPaceResult {
  assertFinite(input.actualPaceSecondsPerKm, 'pace', 'Actual pace');
  assertFinite(input.gradientPercent, 'gradient', 'Gradient');

  if (input.actualPaceSecondsPerKm <= 0) {
    throw new GradeAdjustedPaceInputError(
      'pace',
      'range',
      'Actual pace must be greater than zero seconds per kilometre.',
    );
  }
  if (
    input.gradientPercent < GAP_MIN_GRADIENT_PERCENT ||
    input.gradientPercent > GAP_MAX_GRADIENT_PERCENT
  ) {
    throw new GradeAdjustedPaceInputError(
      'gradient',
      'range',
      `Gradient must be between ${GAP_MIN_GRADIENT_PERCENT} and ${GAP_MAX_GRADIENT_PERCENT} percent.`,
    );
  }

  const costJoulesPerKgPerM = runningCostJoulesPerKgPerM(input.gradientPercent);
  const costRatio = costJoulesPerKgPerM / FLAT_COST;
  const flatEquivalentPaceSeconds = Math.round(input.actualPaceSecondsPerKm / costRatio);
  const direction = directionFor(input.gradientPercent);

  return {
    costJoulesPerKgPerM: Number(costJoulesPerKgPerM.toFixed(3)),
    costRatio: Number(costRatio.toFixed(3)),
    flatEquivalentPaceSeconds,
    direction,
    note: noteFor(input.gradientPercent, direction),
  };
}
