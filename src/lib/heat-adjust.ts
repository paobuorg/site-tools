export const HEAT_MIN_TEMPERATURE_C = -20;
export const HEAT_MAX_TEMPERATURE_C = 50;
export const HEAT_MIN_HUMIDITY_PERCENT = 0;
export const HEAT_MAX_HUMIDITY_PERCENT = 100;

export type HeatBand = 'cool' | 'moderate' | 'hot' | 'very-hot' | 'extreme';

export interface HeatAdjustInput {
  temperatureC: number;
  relativeHumidityPercent: number;
  baselinePaceSecondsPerKm: number;
  durationMinutes: number;
}

export interface HeatAdjustResult {
  heatScore: number;
  adjustedPaceLowSeconds: number;
  adjustedPaceHighSeconds: number;
  band: HeatBand;
  note: string;
}

export class HeatAdjustInputError extends Error {
  field: 'temperature' | 'humidity' | 'pace' | 'duration';
  code: 'range' | 'not-finite';

  constructor(
    field: HeatAdjustInputError['field'],
    code: HeatAdjustInputError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'HeatAdjustInputError';
    this.field = field;
    this.code = code;
  }
}

function assertFinite(value: number, field: HeatAdjustInputError['field'], label: string): void {
  if (!Number.isFinite(value)) {
    throw new HeatAdjustInputError(field, 'not-finite', `${label} must be finite.`);
  }
}

const BAND_PERCENT: Record<HeatBand, { low: number; high: number }> = {
  cool: { low: 0, high: 2 },
  moderate: { low: 2, high: 5 },
  hot: { low: 5, high: 8 },
  'very-hot': { low: 7, high: 10 },
  extreme: { low: 10, high: 12 },
};

function bandFor(score: number): HeatBand {
  if (score < 10) return 'cool';
  if (score < 18) return 'moderate';
  if (score < 24) return 'hot';
  if (score < 30) return 'very-hot';
  return 'extreme';
}

function noteFor(band: HeatBand): string {
  const percent = BAND_PERCENT[band];
  return `The ${band} band adds an experience-based ${percent.low}-${percent.high}% to a flat-weather pace; this is not an official formula. Stop if heat-illness symptoms appear: heavy sweating with weakness, dizziness, nausea, headache or fainting can indicate heat exhaustion; confusion, slurred speech, very high body temperature, a rapid pulse or loss of consciousness are emergencies. Call emergency services first and cool the person while waiting.`;
}

export function adjustForHeat(input: HeatAdjustInput): HeatAdjustResult {
  assertFinite(input.temperatureC, 'temperature', 'Temperature');
  assertFinite(input.relativeHumidityPercent, 'humidity', 'Relative humidity');
  assertFinite(input.baselinePaceSecondsPerKm, 'pace', 'Baseline pace');
  assertFinite(input.durationMinutes, 'duration', 'Duration');

  if (
    input.temperatureC < HEAT_MIN_TEMPERATURE_C ||
    input.temperatureC > HEAT_MAX_TEMPERATURE_C
  ) {
    throw new HeatAdjustInputError(
      'temperature',
      'range',
      `Temperature must be between ${HEAT_MIN_TEMPERATURE_C} and ${HEAT_MAX_TEMPERATURE_C} degrees Celsius.`,
    );
  }
  if (
    input.relativeHumidityPercent < HEAT_MIN_HUMIDITY_PERCENT ||
    input.relativeHumidityPercent > HEAT_MAX_HUMIDITY_PERCENT
  ) {
    throw new HeatAdjustInputError(
      'humidity',
      'range',
      `Relative humidity must be between ${HEAT_MIN_HUMIDITY_PERCENT} and ${HEAT_MAX_HUMIDITY_PERCENT} percent.`,
    );
  }
  if (input.baselinePaceSecondsPerKm <= 0) {
    throw new HeatAdjustInputError('pace', 'range', 'Baseline pace must be greater than zero.');
  }
  if (input.durationMinutes <= 0) {
    throw new HeatAdjustInputError('duration', 'range', 'Duration must be greater than zero.');
  }

  const heatScore = Number((input.temperatureC + 0.04 * input.relativeHumidityPercent).toFixed(1));
  const band = bandFor(heatScore);
  const percent = BAND_PERCENT[band];
  const adjustedPaceLowSeconds = Math.round(
    input.baselinePaceSecondsPerKm * (1 + percent.low / 100),
  );
  const adjustedPaceHighSeconds = Math.round(
    input.baselinePaceSecondsPerKm * (1 + percent.high / 100),
  );

  return {
    heatScore,
    adjustedPaceLowSeconds,
    adjustedPaceHighSeconds,
    band,
    note: noteFor(band),
  };
}
