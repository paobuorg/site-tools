export type InjuryRiskBand = 'low' | 'moderate' | 'high';

export interface InjuryRiskInput {
  painDuringRun: boolean;
  painAtRestOrWalking: boolean;
  swelling: boolean;
  nightOrMorningPain: boolean;
  weeklyVolumeChangePercent: number;
  sleepHours: number;
  priorInjurySameArea: boolean;
}

export interface InjuryRiskResult {
  score: number;
  band: InjuryRiskBand;
  redFlags: boolean;
  message: string;
}

export class InjuryRiskInputError extends Error {
  field:
    | 'painDuringRun'
    | 'painAtRest'
    | 'swelling'
    | 'nightPain'
    | 'volume'
    | 'sleep'
    | 'priorInjury';
  code: 'range' | 'not-finite' | 'not-boolean';

  constructor(
    field: InjuryRiskInputError['field'],
    code: InjuryRiskInputError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'InjuryRiskInputError';
    this.field = field;
    this.code = code;
  }
}

function assertBoolean(value: boolean, field: InjuryRiskInputError['field'], label: string): void {
  if (typeof value !== 'boolean') {
    throw new InjuryRiskInputError(field, 'not-boolean', `${label} must be true or false.`);
  }
}

function messageFor(band: InjuryRiskBand, redFlags: boolean): string {
  if (redFlags) {
    return 'Seek assessment: pain at rest or while walking, or swelling, is a reason to stop running and get medical or physiotherapy advice. This self-check is not a diagnosis and cannot rule out injury.';
  }
  if (band === 'high') {
    return 'High score: several factors are present. Reduce load and seek medical or physiotherapy advice if symptoms persist. This self-check is not a diagnosis and cannot rule out injury.';
  }
  if (band === 'moderate') {
    return 'Moderate score: monitor symptoms and consider reducing load. If pain is severe, persistent or comes with swelling, seek medical or physiotherapy advice. This self-check is not a diagnosis and cannot rule out injury.';
  }
  return 'Low score: no red flags were reported. Keep monitoring; this self-check is not a diagnosis and cannot rule out injury.';
}

export function checkInjuryRisk(input: InjuryRiskInput): InjuryRiskResult {
  assertBoolean(input.painDuringRun, 'painDuringRun', 'Pain during running');
  assertBoolean(input.painAtRestOrWalking, 'painAtRest', 'Pain at rest or walking');
  assertBoolean(input.swelling, 'swelling', 'Swelling');
  assertBoolean(input.nightOrMorningPain, 'nightPain', 'Night or morning pain');
  assertBoolean(input.priorInjurySameArea, 'priorInjury', 'Prior injury in the same area');

  if (!Number.isFinite(input.weeklyVolumeChangePercent)) {
    throw new InjuryRiskInputError(
      'volume',
      'not-finite',
      'Weekly volume change must be finite.',
    );
  }
  if (!Number.isFinite(input.sleepHours)) {
    throw new InjuryRiskInputError('sleep', 'not-finite', 'Sleep hours must be finite.');
  }
  if (input.sleepHours < 0 || input.sleepHours > 24) {
    throw new InjuryRiskInputError('sleep', 'range', 'Sleep hours must be between 0 and 24.');
  }

  let score = 0;
  if (input.painDuringRun) score += 1;
  if (input.painAtRestOrWalking) score += 2;
  if (input.swelling) score += 2;
  if (input.nightOrMorningPain) score += 1;
  if (input.weeklyVolumeChangePercent > 10) score += 1;
  if (input.sleepHours < 7) score += 1;
  if (input.priorInjurySameArea) score += 1;

  const redFlags = input.painAtRestOrWalking || input.swelling;
  const band: InjuryRiskBand = score >= 5 ? 'high' : score >= 3 ? 'moderate' : 'low';

  return {
    score,
    band,
    redFlags,
    message: messageFor(band, redFlags),
  };
}
