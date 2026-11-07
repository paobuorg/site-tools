export const TRAINING_LOAD_MIN_SESSIONS = 1;
export const TRAINING_LOAD_MAX_SESSIONS = 14;
export const TRAINING_LOAD_MIN_RPE = 1;
export const TRAINING_LOAD_MAX_RPE = 10;

export type TrainingLoadBand = 'low' | 'typical' | 'elevated' | 'spike' | 'unknown';

export interface TrainingLoadInput {
  weeklyTrainingMinutes: number;
  sessionsPerWeek: number;
  averageRpe: number;
  acuteLoad: number;
  chronicLoad: number;
}

export interface TrainingLoadResult {
  acuteChronicRatio: number | null;
  weeklyRampPercent: number | null;
  band: TrainingLoadBand;
  note: string;
}

export class TrainingLoadInputError extends Error {
  field: 'weeklyMinutes' | 'sessions' | 'rpe' | 'acute' | 'chronic';
  code: 'range' | 'not-finite';

  constructor(
    field: TrainingLoadInputError['field'],
    code: TrainingLoadInputError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'TrainingLoadInputError';
    this.field = field;
    this.code = code;
  }
}

function assertFinite(value: number, field: TrainingLoadInputError['field'], label: string): void {
  if (!Number.isFinite(value)) {
    throw new TrainingLoadInputError(field, 'not-finite', `${label} must be finite.`);
  }
}

function bandFor(ratio: number): TrainingLoadBand {
  if (ratio < 0.8) return 'low';
  if (ratio <= 1.3) return 'typical';
  if (ratio <= 1.5) return 'elevated';
  return 'spike';
}

function noteFor(band: TrainingLoadBand): string {
  const explanation: Record<TrainingLoadBand, string> = {
    low: 'Recent load is well under the 28-day average. A planned recovery week or incomplete records can explain this; check that the last 28 days were logged.',
    typical: 'Recent load is close to the 28-day average, the band often described as typical.',
    elevated: 'Recent load rose faster than the 28-day average. Review sleep, pain and recovery, and consider holding volume rather than adding more.',
    spike: 'Recent load rose sharply against the 28-day average. Treat this as a prompt to review training and recovery, not as proof of a problem.',
    unknown: 'Chronic load is zero, so the ratio is undefined. Enter a 28-day average load before reading a band.',
  };
  return `${explanation[band]} This is an experience-based heuristic; evidence on training load and injury is conflicting, and this is not a diagnosis.`;
}

export function analyzeTrainingLoad(input: TrainingLoadInput): TrainingLoadResult {
  assertFinite(input.weeklyTrainingMinutes, 'weeklyMinutes', 'Weekly training minutes');
  assertFinite(input.sessionsPerWeek, 'sessions', 'Sessions per week');
  assertFinite(input.averageRpe, 'rpe', 'Average RPE');
  assertFinite(input.acuteLoad, 'acute', 'Acute load');
  assertFinite(input.chronicLoad, 'chronic', 'Chronic load');

  if (input.weeklyTrainingMinutes < 0) {
    throw new TrainingLoadInputError(
      'weeklyMinutes',
      'range',
      'Weekly training minutes must be zero or greater.',
    );
  }
  if (
    input.sessionsPerWeek < TRAINING_LOAD_MIN_SESSIONS ||
    input.sessionsPerWeek > TRAINING_LOAD_MAX_SESSIONS
  ) {
    throw new TrainingLoadInputError(
      'sessions',
      'range',
      `Sessions per week must be between ${TRAINING_LOAD_MIN_SESSIONS} and ${TRAINING_LOAD_MAX_SESSIONS}.`,
    );
  }
  if (input.averageRpe < TRAINING_LOAD_MIN_RPE || input.averageRpe > TRAINING_LOAD_MAX_RPE) {
    throw new TrainingLoadInputError(
      'rpe',
      'range',
      `Average RPE must be between ${TRAINING_LOAD_MIN_RPE} and ${TRAINING_LOAD_MAX_RPE}.`,
    );
  }
  if (input.acuteLoad < 0) {
    throw new TrainingLoadInputError('acute', 'range', 'Acute load must be zero or greater.');
  }
  if (input.chronicLoad < 0) {
    throw new TrainingLoadInputError('chronic', 'range', 'Chronic load must be zero or greater.');
  }

  if (input.chronicLoad === 0) {
    return {
      acuteChronicRatio: null,
      weeklyRampPercent: null,
      band: 'unknown',
      note: noteFor('unknown'),
    };
  }

  const ratio = Number((input.acuteLoad / input.chronicLoad).toFixed(2));
  const ramp = Number(
    (((input.acuteLoad - input.chronicLoad) / input.chronicLoad) * 100).toFixed(1),
  );
  const band = bandFor(ratio);

  return {
    acuteChronicRatio: ratio,
    weeklyRampPercent: ramp,
    band,
    note: noteFor(band),
  };
}
