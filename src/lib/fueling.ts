export const FUELING_LOW_GRAMS_PER_HOUR = 30;
export const FUELING_HIGH_GRAMS_PER_HOUR = 60;
export const FUELING_MIN_DURATION_MINUTES = 10;
export const FUELING_MAX_DURATION_MINUTES = 24 * 60;
export const FUELING_MIN_PRODUCT_CARBS = 5;
export const FUELING_MAX_PRODUCT_CARBS = 100;

export interface FuelingInput {
  durationMinutes: number;
  productCarbsGrams: number;
}

export interface FuelingPlan {
  durationHours: number;
  needsFuel: boolean;
  lowPerHour: number;
  highPerHour: number;
  lowTotalGrams: number;
  highTotalGrams: number;
  servingsLow: number;
  servingsHigh: number;
  scheduleEveryMin: number;
  scheduleEveryMax: number;
}

export class FuelingInputError extends Error {
  field: 'duration' | 'product';
  code: 'range' | 'not-finite';

  constructor(field: FuelingInputError['field'], code: FuelingInputError['code'], message: string) {
    super(message);
    this.name = 'FuelingInputError';
    this.field = field;
    this.code = code;
  }
}

function assertFinite(value: number, field: FuelingInputError['field'], label: string): void {
  if (!Number.isFinite(value)) {
    throw new FuelingInputError(field, 'not-finite', `${label} must be finite.`);
  }
}

export function planFueling(input: FuelingInput): FuelingPlan {
  assertFinite(input.durationMinutes, 'duration', 'Duration');
  assertFinite(input.productCarbsGrams, 'product', 'Product carbohydrate');
  if (
    input.durationMinutes < FUELING_MIN_DURATION_MINUTES ||
    input.durationMinutes > FUELING_MAX_DURATION_MINUTES
  ) {
    throw new FuelingInputError(
      'duration',
      'range',
      `Duration must be between ${FUELING_MIN_DURATION_MINUTES} and ${FUELING_MAX_DURATION_MINUTES} minutes.`,
    );
  }
  if (
    input.productCarbsGrams < FUELING_MIN_PRODUCT_CARBS ||
    input.productCarbsGrams > FUELING_MAX_PRODUCT_CARBS
  ) {
    throw new FuelingInputError(
      'product',
      'range',
      `Product carbohydrate must be between ${FUELING_MIN_PRODUCT_CARBS} and ${FUELING_MAX_PRODUCT_CARBS} grams.`,
    );
  }

  const durationHours = input.durationMinutes / 60;
  const needsFuel = input.durationMinutes >= 60;
  const lowPerHour = needsFuel ? FUELING_LOW_GRAMS_PER_HOUR : 0;
  const highPerHour = needsFuel ? FUELING_HIGH_GRAMS_PER_HOUR : 0;
  const lowTotalGrams = Math.round(lowPerHour * durationHours);
  const highTotalGrams = Math.round(highPerHour * durationHours);
  const servingsLow = lowTotalGrams === 0 ? 0 : Math.ceil(lowTotalGrams / input.productCarbsGrams);
  const servingsHigh = highTotalGrams === 0 ? 0 : Math.ceil(highTotalGrams / input.productCarbsGrams);

  return {
    durationHours: Number(durationHours.toFixed(2)),
    needsFuel,
    lowPerHour,
    highPerHour,
    lowTotalGrams,
    highTotalGrams,
    servingsLow,
    servingsHigh,
    scheduleEveryMin: 20,
    scheduleEveryMax: 30,
  };
}
