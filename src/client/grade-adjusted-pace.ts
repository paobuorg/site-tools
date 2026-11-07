import {
  gradeAdjustedPace,
  GradeAdjustedPaceInputError,
  type GradientDirection,
} from '../lib/grade-adjusted-pace';

interface GradeAdjustedStrings {
  uphill: string;
  downhill: string;
  'steep-downhill': string;
  flat: string;
}

function readStrings<T>(root: HTMLElement, attribute: string, keys: string[]): T | null {
  try {
    const parsed = JSON.parse(root.dataset[attribute] ?? '{}') as Record<string, unknown>;
    if (!keys.every((key) => typeof parsed[key] === 'string')) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

function formatSeconds(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function initGradeAdjustedPace(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('[data-gap-form]');
  const paceInput = root.querySelector<HTMLInputElement>('[data-gap-pace]');
  const gradientInput = root.querySelector<HTMLInputElement>('[data-gap-gradient]');
  const result = root.querySelector<HTMLElement>('[data-gap-result]');
  const cost = root.querySelector<HTMLElement>('[data-gap-cost]');
  const ratio = root.querySelector<HTMLElement>('[data-gap-ratio]');
  const pace = root.querySelector<HTMLElement>('[data-gap-flat-pace]');
  const note = root.querySelector<HTMLElement>('[data-gap-note]');
  const strings = readStrings<GradeAdjustedStrings>(root, 'strings', [
    'uphill',
    'downhill',
    'steep-downhill',
    'flat',
  ]);
  const errors: Record<GradeAdjustedPaceInputError['field'], HTMLElement | null> = {
    pace: root.querySelector<HTMLElement>('[data-error="pace"]'),
    gradient: root.querySelector<HTMLElement>('[data-error="gradient"]'),
  };
  if (!form || !paceInput || !gradientInput || !result) {
    return;
  }

  const clearErrors = () => {
    for (const element of Object.values(errors)) {
      if (!element) continue;
      element.textContent = '';
      element.hidden = true;
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearErrors();
    try {
      const adjustment = gradeAdjustedPace({
        actualPaceSecondsPerKm: paceInput.valueAsNumber,
        gradientPercent: gradientInput.valueAsNumber,
      });
      if (cost) cost.textContent = `${adjustment.costJoulesPerKgPerM.toFixed(3)} J/kg/m`;
      if (ratio) ratio.textContent = `${adjustment.costRatio.toFixed(3)}×`;
      if (pace) {
        pace.textContent = `${formatSeconds(adjustment.flatEquivalentPaceSeconds)} /km (${adjustment.flatEquivalentPaceSeconds} s/km)`;
      }
      if (note && strings) {
        const key: keyof GradeAdjustedStrings | null =
          adjustment.direction === 'uphill'
            ? 'uphill'
            : adjustment.direction === 'flat'
              ? 'flat'
              : gradientInput.valueAsNumber < -25
                ? 'steep-downhill'
                : 'downhill';
        const directionLabels: Record<GradientDirection, string> = {
          uphill: 'uphill',
          downhill: 'downhill',
          flat: 'flat',
        };
        note.textContent = key ? strings[key] : directionLabels[adjustment.direction];
      }
      result.hidden = false;
    } catch (error) {
      if (error instanceof GradeAdjustedPaceInputError) {
        const element = errors[error.field];
        if (element) {
          element.textContent = error.message;
          element.hidden = false;
        }
      } else {
        const element = errors.pace;
        if (element) {
          element.textContent = 'Unable to calculate.';
          element.hidden = false;
        }
      }
      result.hidden = true;
    }
  });
}
