import { estimateSweatRate, SweatRateInputError } from '../lib/sweat-rate';

interface SweatRateStrings {
  above: string;
  below: string;
  note: string;
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

export function initSweatRate(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('[data-sw-form]');
  const preInput = root.querySelector<HTMLInputElement>('[data-sw-pre]');
  const postInput = root.querySelector<HTMLInputElement>('[data-sw-post]');
  const intakeInput = root.querySelector<HTMLInputElement>('[data-sw-intake]');
  const durationInput = root.querySelector<HTMLInputElement>('[data-sw-duration]');
  const result = root.querySelector<HTMLElement>('[data-sw-result]');
  const loss = root.querySelector<HTMLElement>('[data-sw-loss]');
  const rate = root.querySelector<HTMLElement>('[data-sw-rate]');
  const percent = root.querySelector<HTMLElement>('[data-sw-percent]');
  const flag = root.querySelector<HTMLElement>('[data-sw-flag]');
  const note = root.querySelector<HTMLElement>('[data-sw-note]');
  const strings = readStrings<SweatRateStrings>(root, 'strings', ['above', 'below', 'note']);
  const errors: Record<SweatRateInputError['field'], HTMLElement | null> = {
    weights: root.querySelector<HTMLElement>('[data-error="weights"]'),
    intake: root.querySelector<HTMLElement>('[data-error="intake"]'),
    duration: root.querySelector<HTMLElement>('[data-error="duration"]'),
  };
  if (!form || !preInput || !postInput || !intakeInput || !durationInput || !result) {
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
      const estimate = estimateSweatRate({
        preWeightKg: preInput.valueAsNumber,
        postWeightKg: postInput.valueAsNumber,
        fluidIntakeLiters: intakeInput.valueAsNumber,
        durationMinutes: durationInput.valueAsNumber,
      });
      if (loss) {
        loss.textContent = `${estimate.netLossLiters.toFixed(2)} L`;
      }
      if (rate) {
        rate.textContent = `${estimate.sweatRateLitersPerHour.toFixed(2)} L/h`;
      }
      if (percent) {
        percent.textContent = `${estimate.bodyMassLossPercent.toFixed(2)}%`;
      }
      if (flag && strings) {
        flag.textContent = estimate.aboveTwoPercent ? strings.above : strings.below;
      }
      if (note && strings) {
        note.textContent = `${estimate.note} ${strings.note}`;
      }
      result.hidden = false;
    } catch (error) {
      if (error instanceof SweatRateInputError) {
        const element = errors[error.field];
        if (element) {
          element.textContent = error.message;
          element.hidden = false;
        }
      } else {
        const element = errors.weights;
        if (element) {
          element.textContent = 'Unable to calculate.';
          element.hidden = false;
        }
      }
      result.hidden = true;
    }
  });
}
