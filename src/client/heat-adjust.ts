import { adjustForHeat, HeatAdjustInputError, type HeatBand } from '../lib/heat-adjust';

interface HeatAdjustStrings {
  cool: string;
  moderate: string;
  hot: string;
  'very-hot': string;
  extreme: string;
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

export function formatSeconds(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function initHeatAdjust(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('[data-ha-form]');
  const temperatureInput = root.querySelector<HTMLInputElement>('[data-ha-temperature]');
  const humidityInput = root.querySelector<HTMLInputElement>('[data-ha-humidity]');
  const paceInput = root.querySelector<HTMLInputElement>('[data-ha-pace]');
  const durationInput = root.querySelector<HTMLInputElement>('[data-ha-duration]');
  const result = root.querySelector<HTMLElement>('[data-ha-result]');
  const score = root.querySelector<HTMLElement>('[data-ha-score]');
  const band = root.querySelector<HTMLElement>('[data-ha-band]');
  const range = root.querySelector<HTMLElement>('[data-ha-range]');
  const note = root.querySelector<HTMLElement>('[data-ha-note]');
  const strings = readStrings<HeatAdjustStrings>(root, 'strings', [
    'cool',
    'moderate',
    'hot',
    'very-hot',
    'extreme',
  ]);
  const labels = readStrings<Record<HeatBand, string>>(root, 'labels', [
    'cool',
    'moderate',
    'hot',
    'very-hot',
    'extreme',
  ]);
  const errors: Record<HeatAdjustInputError['field'], HTMLElement | null> = {
    temperature: root.querySelector<HTMLElement>('[data-error="temperature"]'),
    humidity: root.querySelector<HTMLElement>('[data-error="humidity"]'),
    pace: root.querySelector<HTMLElement>('[data-error="pace"]'),
    duration: root.querySelector<HTMLElement>('[data-error="duration"]'),
  };
  if (!form || !temperatureInput || !humidityInput || !paceInput || !durationInput || !result) {
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
      const adjustment = adjustForHeat({
        temperatureC: temperatureInput.valueAsNumber,
        relativeHumidityPercent: humidityInput.valueAsNumber,
        baselinePaceSecondsPerKm: paceInput.valueAsNumber,
        durationMinutes: durationInput.valueAsNumber,
      });
      const bandLabels: Record<HeatBand, string> = labels ?? {
        cool: 'cool',
        moderate: 'moderate',
        hot: 'hot',
        'very-hot': 'very hot',
        extreme: 'extreme',
      };
      if (score) score.textContent = adjustment.heatScore.toFixed(1);
      if (band) band.textContent = bandLabels[adjustment.band];
      if (range) {
        range.textContent = `${formatSeconds(adjustment.adjustedPaceLowSeconds)}–${formatSeconds(adjustment.adjustedPaceHighSeconds)} /km (${adjustment.adjustedPaceLowSeconds}–${adjustment.adjustedPaceHighSeconds} s/km)`;
      }
      if (note && strings) note.textContent = strings[adjustment.band];
      result.hidden = false;
    } catch (error) {
      if (error instanceof HeatAdjustInputError) {
        const element = errors[error.field];
        if (element) {
          element.textContent = error.message;
          element.hidden = false;
        }
      } else {
        const element = errors.temperature;
        if (element) {
          element.textContent = 'Unable to calculate.';
          element.hidden = false;
        }
      }
      result.hidden = true;
    }
  });
}
