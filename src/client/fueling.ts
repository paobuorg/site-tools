import { planFueling, FuelingInputError } from '../lib/fueling';

export function initFueling(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('[data-fueling-form]');
  const durationInput = root.querySelector<HTMLInputElement>('[data-fueling-duration]');
  const productInput = root.querySelector<HTMLInputElement>('[data-fueling-product]');
  const result = root.querySelector<HTMLElement>('[data-fueling-result]');
  const range = root.querySelector<HTMLElement>('[data-fueling-range]');
  const rate = root.querySelector<HTMLElement>('[data-fueling-rate]');
  const total = root.querySelector<HTMLElement>('[data-fueling-total]');
  const servings = root.querySelector<HTMLElement>('[data-fueling-servings]');
  const shortNote = root.querySelector<HTMLElement>('[data-fueling-short]');
  const durationError = root.querySelector<HTMLElement>('[data-error="duration"]');
  const productError = root.querySelector<HTMLElement>('[data-error="product"]');
  if (!form || !durationInput || !productInput || !result) return;

  const setError = (element: HTMLElement | null, message: string | null) => {
    if (!element) return;
    element.textContent = message ?? '';
    element.hidden = !message;
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    setError(durationError, null);
    setError(productError, null);
    try {
      const plan = planFueling({
        durationMinutes: durationInput.valueAsNumber,
        productCarbsGrams: productInput.valueAsNumber,
      });
      if (range) range.textContent = `${plan.lowTotalGrams}–${plan.highTotalGrams} g`;
      if (rate) rate.textContent = `${plan.lowPerHour}–${plan.highPerHour} g/h`;
      if (total) total.textContent = `${plan.lowTotalGrams}–${plan.highTotalGrams} g`;
      if (servings) servings.textContent = `${plan.servingsLow}–${plan.servingsHigh}`;
      if (shortNote) shortNote.hidden = plan.needsFuel;
      result.hidden = false;
    } catch (error) {
      if (error instanceof FuelingInputError) {
        setError(error.field === 'duration' ? durationError : productError, error.message);
      } else {
        setError(durationError, 'Unable to calculate.');
      }
      result.hidden = true;
    }
  });
}
