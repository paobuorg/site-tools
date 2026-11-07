import {
  analyzeTrainingLoad,
  TrainingLoadInputError,
  type TrainingLoadBand,
} from '../lib/training-load';

interface TrainingLoadStrings {
  low: string;
  typical: string;
  elevated: string;
  spike: string;
  unknown: string;
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

export function initTrainingLoad(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('[data-tl-form]');
  const weeklyInput = root.querySelector<HTMLInputElement>('[data-tl-weekly]');
  const sessionsInput = root.querySelector<HTMLInputElement>('[data-tl-sessions]');
  const rpeInput = root.querySelector<HTMLInputElement>('[data-tl-rpe]');
  const acuteInput = root.querySelector<HTMLInputElement>('[data-tl-acute]');
  const chronicInput = root.querySelector<HTMLInputElement>('[data-tl-chronic]');
  const result = root.querySelector<HTMLElement>('[data-tl-result]');
  const ratio = root.querySelector<HTMLElement>('[data-tl-ratio]');
  const ramp = root.querySelector<HTMLElement>('[data-tl-ramp]');
  const band = root.querySelector<HTMLElement>('[data-tl-band]');
  const note = root.querySelector<HTMLElement>('[data-tl-note]');
  const strings = readStrings<TrainingLoadStrings>(root, 'strings', [
    'low',
    'typical',
    'elevated',
    'spike',
    'unknown',
  ]);
  const labels = readStrings<Record<TrainingLoadBand, string>>(root, 'labels', [
    'low',
    'typical',
    'elevated',
    'spike',
    'unknown',
  ]);
  const errors: Record<TrainingLoadInputError['field'], HTMLElement | null> = {
    weeklyMinutes: root.querySelector<HTMLElement>('[data-error="weeklyMinutes"]'),
    sessions: root.querySelector<HTMLElement>('[data-error="sessions"]'),
    rpe: root.querySelector<HTMLElement>('[data-error="rpe"]'),
    acute: root.querySelector<HTMLElement>('[data-error="acute"]'),
    chronic: root.querySelector<HTMLElement>('[data-error="chronic"]'),
  };
  if (
    !form ||
    !weeklyInput ||
    !sessionsInput ||
    !rpeInput ||
    !acuteInput ||
    !chronicInput ||
    !result
  ) {
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
      const analysis = analyzeTrainingLoad({
        weeklyTrainingMinutes: weeklyInput.valueAsNumber,
        sessionsPerWeek: sessionsInput.valueAsNumber,
        averageRpe: rpeInput.valueAsNumber,
        acuteLoad: acuteInput.valueAsNumber,
        chronicLoad: chronicInput.valueAsNumber,
      });
      const bandLabels: Record<TrainingLoadBand, string> = labels ?? {
        low: 'low',
        typical: 'typical',
        elevated: 'elevated',
        spike: 'spike',
        unknown: 'unknown',
      };
      if (ratio) {
        ratio.textContent =
          analysis.acuteChronicRatio === null ? '—' : analysis.acuteChronicRatio.toFixed(2);
      }
      if (ramp) {
        ramp.textContent =
          analysis.weeklyRampPercent === null
            ? '—'
            : `${analysis.weeklyRampPercent > 0 ? '+' : ''}${analysis.weeklyRampPercent.toFixed(1)}%`;
      }
      if (band) band.textContent = bandLabels[analysis.band];
      if (note && strings) note.textContent = strings[analysis.band];
      result.hidden = false;
    } catch (error) {
      if (error instanceof TrainingLoadInputError) {
        const element = errors[error.field];
        if (element) {
          element.textContent = error.message;
          element.hidden = false;
        }
      } else {
        const element = errors.acute;
        if (element) {
          element.textContent = 'Unable to calculate.';
          element.hidden = false;
        }
      }
      result.hidden = true;
    }
  });
}
