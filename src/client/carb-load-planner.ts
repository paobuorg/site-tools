import {
  planCarbLoad,
  CarbLoadPlannerInputError,
} from '../lib/carb-load-planner';

interface CarbLoadStrings {
  indicated: string;
  'not-indicated': string;
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

export function initCarbLoadPlanner(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('[data-cl-form]');
  const massInput = root.querySelector<HTMLInputElement>('[data-cl-mass]');
  const durationInput = root.querySelector<HTMLInputElement>('[data-cl-duration]');
  const windowInput = root.querySelector<HTMLInputElement>('[data-cl-window]');
  const result = root.querySelector<HTMLElement>('[data-cl-result]');
  const status = root.querySelector<HTMLElement>('[data-cl-status]');
  const daily = root.querySelector<HTMLElement>('[data-cl-daily]');
  const total = root.querySelector<HTMLElement>('[data-cl-total]');
  const note = root.querySelector<HTMLElement>('[data-cl-note]');
  const strings = readStrings<CarbLoadStrings>(root, 'strings', [
    'indicated',
    'not-indicated',
    'note',
  ]);
  const errors: Record<CarbLoadPlannerInputError['field'], HTMLElement | null> = {
    mass: root.querySelector<HTMLElement>('[data-error="mass"]'),
    duration: root.querySelector<HTMLElement>('[data-error="duration"]'),
    window: root.querySelector<HTMLElement>('[data-error="window"]'),
  };
  if (!form || !massInput || !durationInput || !windowInput || !result) {
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
      const plan = planCarbLoad({
        bodyMassKg: massInput.valueAsNumber,
        eventDurationMinutes: durationInput.valueAsNumber,
        loadWindowHours: windowInput.valueAsNumber,
      });
      if (status && strings) {
        status.textContent = plan.indicated
          ? strings.indicated
          : strings['not-indicated'];
      }
      if (daily) {
        daily.textContent = `${plan.dailyLowGrams}–${plan.dailyHighGrams} g/day`;
      }
      if (total) {
        total.textContent = `${plan.windowTotalLowGrams}–${plan.windowTotalHighGrams} g`;
      }
      if (note && strings) {
        note.textContent = `${plan.note} ${strings.note}`;
      }
      result.hidden = false;
    } catch (error) {
      if (error instanceof CarbLoadPlannerInputError) {
        const element = errors[error.field];
        if (element) {
          element.textContent = error.message;
          element.hidden = false;
        }
      } else {
        const element = errors.mass;
        if (element) {
          element.textContent = 'Unable to calculate.';
          element.hidden = false;
        }
      }
      result.hidden = true;
    }
  });
}
