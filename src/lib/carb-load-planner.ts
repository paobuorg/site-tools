export const CARB_LOAD_MIN_DURATION_MINUTES = 90;
export const CARB_LOAD_MIN_WINDOW_HOURS = 36;
export const CARB_LOAD_MAX_WINDOW_HOURS = 48;
export const CARB_LOAD_MIN_BODY_MASS_KG = 30;
export const CARB_LOAD_MAX_BODY_MASS_KG = 200;

export interface CarbLoadPlannerInput {
  bodyMassKg: number;
  eventDurationMinutes: number;
  loadWindowHours: number;
}

export interface CarbLoadPlannerResult {
  indicated: boolean;
  dailyLowGrams: number;
  dailyHighGrams: number;
  windowTotalLowGrams: number;
  windowTotalHighGrams: number;
  note: string;
}

export class CarbLoadPlannerInputError extends Error {
  field: 'mass' | 'duration' | 'window';
  code: 'range' | 'not-finite';

  constructor(
    field: CarbLoadPlannerInputError['field'],
    code: CarbLoadPlannerInputError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'CarbLoadPlannerInputError';
    this.field = field;
    this.code = code;
  }
}

function assertFinite(
  value: number,
  field: CarbLoadPlannerInputError['field'],
  label: string,
): void {
  if (!Number.isFinite(value)) {
    throw new CarbLoadPlannerInputError(field, 'not-finite', `${label} must be finite.`);
  }
}

function noteFor(indicated: boolean): string {
  if (indicated) {
    return 'Loading is indicated for events longer than 90 minutes. Split the daily total across several meals and practise the foods before race week. The range is a planning band, not a prescription.';
  }
  return 'Loading is not indicated for events of 90 minutes or less. A normal high-carbohydrate intake in the 24 hours before exercise is the more relevant target; see the carb-loading article.';
}

export function planCarbLoad(input: CarbLoadPlannerInput): CarbLoadPlannerResult {
  assertFinite(input.bodyMassKg, 'mass', 'Body mass');
  assertFinite(input.eventDurationMinutes, 'duration', 'Event duration');
  assertFinite(input.loadWindowHours, 'window', 'Loading window');

  if (
    input.bodyMassKg < CARB_LOAD_MIN_BODY_MASS_KG ||
    input.bodyMassKg > CARB_LOAD_MAX_BODY_MASS_KG
  ) {
    throw new CarbLoadPlannerInputError(
      'mass',
      'range',
      `Body mass must be between ${CARB_LOAD_MIN_BODY_MASS_KG} and ${CARB_LOAD_MAX_BODY_MASS_KG} kilograms.`,
    );
  }
  if (input.eventDurationMinutes < 1 || input.eventDurationMinutes > 1440) {
    throw new CarbLoadPlannerInputError(
      'duration',
      'range',
      'Event duration must be between 1 and 1440 minutes.',
    );
  }
  if (
    input.loadWindowHours < CARB_LOAD_MIN_WINDOW_HOURS ||
    input.loadWindowHours > CARB_LOAD_MAX_WINDOW_HOURS
  ) {
    throw new CarbLoadPlannerInputError(
      'window',
      'range',
      `Loading window must be between ${CARB_LOAD_MIN_WINDOW_HOURS} and ${CARB_LOAD_MAX_WINDOW_HOURS} hours.`,
    );
  }

  const dailyLowGrams = Math.round(input.bodyMassKg * 10);
  const dailyHighGrams = Math.round(input.bodyMassKg * 12);
  const windowTotalLowGrams = Math.round(
    (input.bodyMassKg * 10 * input.loadWindowHours) / 24,
  );
  const windowTotalHighGrams = Math.round(
    (input.bodyMassKg * 12 * input.loadWindowHours) / 24,
  );

  return {
    indicated: input.eventDurationMinutes > CARB_LOAD_MIN_DURATION_MINUTES,
    dailyLowGrams,
    dailyHighGrams,
    windowTotalLowGrams,
    windowTotalHighGrams,
    note: noteFor(input.eventDurationMinutes > CARB_LOAD_MIN_DURATION_MINUTES),
  };
}
