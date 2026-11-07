export const SWEAT_RATE_MIN_BODY_MASS_KG = 30;
export const SWEAT_RATE_MAX_BODY_MASS_KG = 200;
export const SWEAT_RATE_MAX_INTAKE_LITERS = 10;
export const SWEAT_RATE_MAX_DURATION_MINUTES = 1440;
export const SWEAT_RATE_EXCESSIVE_LOSS_PERCENT = 2;

export interface SweatRateInput {
  preWeightKg: number;
  postWeightKg: number;
  fluidIntakeLiters: number;
  durationMinutes: number;
}

export interface SweatRateResult {
  netLossLiters: number;
  sweatRateLitersPerHour: number;
  bodyMassLossPercent: number;
  aboveTwoPercent: boolean;
  note: string;
}

export class SweatRateInputError extends Error {
  field: 'weights' | 'intake' | 'duration';
  code: 'range' | 'not-finite' | 'inconsistent';

  constructor(
    field: SweatRateInputError['field'],
    code: SweatRateInputError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'SweatRateInputError';
    this.field = field;
    this.code = code;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function assertFinite(
  value: number,
  field: SweatRateInputError['field'],
  label: string,
): void {
  if (!Number.isFinite(value)) {
    throw new SweatRateInputError(field, 'not-finite', `${label} must be finite.`);
  }
}

function assertBodyMass(value: number, label: string): void {
  if (value < SWEAT_RATE_MIN_BODY_MASS_KG || value > SWEAT_RATE_MAX_BODY_MASS_KG) {
    throw new SweatRateInputError(
      'weights',
      'range',
      `${label} must be between ${SWEAT_RATE_MIN_BODY_MASS_KG} and ${SWEAT_RATE_MAX_BODY_MASS_KG} kilograms.`,
    );
  }
}

function noteFor(aboveTwoPercent: boolean): string {
  if (aboveTwoPercent) {
    return 'Body mass loss exceeded 2%, the ACSM threshold for excessive dehydration in this session. Treat the result as a prompt to review fluid intake and conditions, not as a diagnosis.';
  }
  return 'Body mass loss stayed at or below 2% in this session. Repeat the measurement in different weather and intensities before treating it as your typical sweat rate.';
}

export function estimateSweatRate(input: SweatRateInput): SweatRateResult {
  assertFinite(input.preWeightKg, 'weights', 'Pre-exercise body mass');
  assertFinite(input.postWeightKg, 'weights', 'Post-exercise body mass');
  assertFinite(input.fluidIntakeLiters, 'intake', 'Fluid intake');
  assertFinite(input.durationMinutes, 'duration', 'Exercise duration');

  assertBodyMass(input.preWeightKg, 'Pre-exercise body mass');
  assertBodyMass(input.postWeightKg, 'Post-exercise body mass');

  if (input.fluidIntakeLiters < 0 || input.fluidIntakeLiters > SWEAT_RATE_MAX_INTAKE_LITERS) {
    throw new SweatRateInputError(
      'intake',
      'range',
      `Fluid intake must be between 0 and ${SWEAT_RATE_MAX_INTAKE_LITERS} litres.`,
    );
  }
  if (input.durationMinutes < 1 || input.durationMinutes > SWEAT_RATE_MAX_DURATION_MINUTES) {
    throw new SweatRateInputError(
      'duration',
      'range',
      `Exercise duration must be between 1 and ${SWEAT_RATE_MAX_DURATION_MINUTES} minutes.`,
    );
  }

  const netLoss = input.preWeightKg - input.postWeightKg + input.fluidIntakeLiters;
  if (netLoss < 0) {
    throw new SweatRateInputError(
      'weights',
      'inconsistent',
      'The entered fluid intake and body masses imply a net fluid gain. Check the intake volume and the two weighings.',
    );
  }

  const netLossLiters = round2(netLoss);
  const sweatRateLitersPerHour = round2(netLoss / (input.durationMinutes / 60));
  const bodyMassLossPercent = round2(
    ((input.preWeightKg - input.postWeightKg) / input.preWeightKg) * 100,
  );

  return {
    netLossLiters,
    sweatRateLitersPerHour,
    bodyMassLossPercent,
    aboveTwoPercent: bodyMassLossPercent > SWEAT_RATE_EXCESSIVE_LOSS_PERCENT,
    note: noteFor(bodyMassLossPercent > SWEAT_RATE_EXCESSIVE_LOSS_PERCENT),
  };
}
