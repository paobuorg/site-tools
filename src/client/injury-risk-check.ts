import {
  checkInjuryRisk,
  InjuryRiskInputError,
  type InjuryRiskBand,
} from '../lib/injury-risk-check';

interface InjuryRiskStrings {
  low: string;
  moderate: string;
  high: string;
  seek: string;
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

function readBoolean(root: HTMLElement, selector: string): boolean {
  const input = root.querySelector<HTMLInputElement>(selector);
  return Boolean(input?.checked);
}

export function initInjuryRiskCheck(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('[data-ir-form]');
  const volumeInput = root.querySelector<HTMLInputElement>('[data-ir-volume]');
  const sleepInput = root.querySelector<HTMLInputElement>('[data-ir-sleep]');
  const result = root.querySelector<HTMLElement>('[data-ir-result]');
  const score = root.querySelector<HTMLElement>('[data-ir-score]');
  const band = root.querySelector<HTMLElement>('[data-ir-band]');
  const message = root.querySelector<HTMLElement>('[data-ir-message]');
  const strings = readStrings<InjuryRiskStrings>(root, 'strings', [
    'low',
    'moderate',
    'high',
    'seek',
  ]);
  const labels = readStrings<Record<InjuryRiskBand, string>>(root, 'labels', [
    'low',
    'moderate',
    'high',
  ]);
  const errors: Record<InjuryRiskInputError['field'], HTMLElement | null> = {
    painDuringRun: root.querySelector<HTMLElement>('[data-error="painDuringRun"]'),
    painAtRest: root.querySelector<HTMLElement>('[data-error="painAtRest"]'),
    swelling: root.querySelector<HTMLElement>('[data-error="swelling"]'),
    nightPain: root.querySelector<HTMLElement>('[data-error="nightPain"]'),
    volume: root.querySelector<HTMLElement>('[data-error="volume"]'),
    sleep: root.querySelector<HTMLElement>('[data-error="sleep"]'),
    priorInjury: root.querySelector<HTMLElement>('[data-error="priorInjury"]'),
  };
  if (!form || !volumeInput || !sleepInput || !result) return;

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
      const check = checkInjuryRisk({
        painDuringRun: readBoolean(root, '[data-ir-pain-run]'),
        painAtRestOrWalking: readBoolean(root, '[data-ir-pain-rest]'),
        swelling: readBoolean(root, '[data-ir-swelling]'),
        nightOrMorningPain: readBoolean(root, '[data-ir-night]'),
        weeklyVolumeChangePercent: volumeInput.valueAsNumber,
        sleepHours: sleepInput.valueAsNumber,
        priorInjurySameArea: readBoolean(root, '[data-ir-prior]'),
      });
      const bandLabels: Record<InjuryRiskBand, string> = labels ?? {
        low: 'low',
        moderate: 'moderate',
        high: 'high',
      };
      if (score) score.textContent = String(check.score);
      if (band) band.textContent = bandLabels[check.band];
      if (message && strings) message.textContent = check.redFlags ? strings.seek : strings[check.band];
      result.hidden = false;
    } catch (error) {
      if (error instanceof InjuryRiskInputError) {
        const element = errors[error.field];
        if (element) {
          element.textContent = error.message;
          element.hidden = false;
        }
      } else {
        const element = errors.sleep;
        if (element) {
          element.textContent = 'Unable to calculate.';
          element.hidden = false;
        }
      }
      result.hidden = true;
    }
  });
}
