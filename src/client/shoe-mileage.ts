import {
  summarizeShoe,
  validateShoe,
  validateRun,
  ShoeInputError,
  type ShoeRecord,
  type ShoeRunRecord,
} from '../lib/shoe-mileage';

interface ShoeStore {
  shoes: ShoeRecord[];
  runs: ShoeRunRecord[];
}

interface ShoeStrings {
  total: string;
  runs: string;
  remaining: string;
  progress: string;
  lastRun: string;
  deleteShoe: string;
  empty: string;
  overReminder: string;
  confirmDelete: string;
  confirmClear: string;
}

const STORAGE_KEY = 'paobu_shoe_log_v1';

function readStore(): ShoeStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { shoes: [], runs: [] };
    const parsed = JSON.parse(raw) as Partial<ShoeStore>;
    return {
      shoes: Array.isArray(parsed.shoes) ? parsed.shoes : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
    };
  } catch {
    return { shoes: [], runs: [] };
  }
}

function writeStore(store: ShoeStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function initShoeMileage(root: HTMLElement): void {
  const shoeForm = root.querySelector<HTMLFormElement>('[data-shoe-form]');
  const nameInput = root.querySelector<HTMLInputElement>('[data-shoe-name]');
  const initialInput = root.querySelector<HTMLInputElement>('[data-shoe-initial]');
  const reminderInput = root.querySelector<HTMLInputElement>('[data-shoe-reminder]');
  const runForm = root.querySelector<HTMLFormElement>('[data-run-form]');
  const shoeSelect = root.querySelector<HTMLSelectElement>('[data-run-shoe]');
  const dateInput = root.querySelector<HTMLInputElement>('[data-run-date]');
  const distanceInput = root.querySelector<HTMLInputElement>('[data-run-distance]');
  const list = root.querySelector<HTMLElement>('[data-shoe-list]');
  const empty = root.querySelector<HTMLElement>('[data-shoe-empty]');
  const clearButton = root.querySelector<HTMLButtonElement>('[data-shoe-clear]');
  const shoeError = root.querySelector<HTMLElement>('[data-shoe-error]');
  const runError = root.querySelector<HTMLElement>('[data-run-error]');
  if (!shoeForm || !runForm || !list || !shoeSelect) return;

  const locale = root.dataset.locale ?? 'zh-CN';
  const strings = JSON.parse(root.dataset.strings ?? '{}') as ShoeStrings;
  const number = (value: number) =>
    new Intl.NumberFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  let store = readStore();

  const setError = (element: HTMLElement | null, message: string | null) => {
    if (!element) return;
    element.textContent = message ?? '';
    element.hidden = !message;
  };

  const render = () => {
    list.textContent = '';
    shoeSelect.textContent = '';
    for (const shoe of store.shoes) {
      const option = document.createElement('option');
      option.value = shoe.id;
      option.textContent = shoe.name;
      shoeSelect.appendChild(option);
    }
    runForm.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled = store.shoes.length === 0;
    if (empty) empty.hidden = store.shoes.length > 0;
    for (const shoe of store.shoes) {
      const summary = summarizeShoe(shoe, store.runs);
      const card = document.createElement('article');
      card.className = 'shoe-card';
      const header = document.createElement('div');
      header.className = 'shoe-card-head';
      const title = document.createElement('h3');
      title.textContent = shoe.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button ghost small';
      remove.textContent = strings.deleteShoe;
      remove.addEventListener('click', () => {
        if (!window.confirm(strings.confirmDelete)) return;
        store.shoes = store.shoes.filter((item) => item.id !== shoe.id);
        store.runs = store.runs.filter((item) => item.shoeId !== shoe.id);
        writeStore(store);
        render();
      });
      header.append(title, remove);
      const stats = document.createElement('dl');
      stats.className = 'shoe-stats';
      const rows: Array<[string, string]> = [
        [strings.total, `${number(summary.totalKm)} km`],
        [strings.runs, String(summary.runCount)],
        [strings.remaining, `${number(summary.remainingKm)} km`],
        [strings.lastRun, summary.lastRunDate ?? '—'],
      ];
      for (const [label, value] of rows) {
        const row = document.createElement('div');
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        row.append(dt, dd);
        stats.appendChild(row);
      }
      const progress = document.createElement('progress');
      progress.max = shoe.reminderKm;
      progress.value = Math.min(summary.totalKm, shoe.reminderKm);
      progress.setAttribute('aria-label', strings.progress);
      const progressText = document.createElement('p');
      progressText.className = 'shoe-progress-text';
      progressText.textContent = summary.remainingKm === 0
        ? strings.overReminder
        : `${strings.progress} ${Math.min(100, summary.percentOfReminder)}%`;
      card.append(header, stats, progress, progressText);
      list.appendChild(card);
    }
  };

  shoeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    setError(shoeError, null);
    try {
      const shoe = validateShoe({
        name: nameInput?.value ?? '',
        initialKm: initialInput?.valueAsNumber ?? 0,
        reminderKm: reminderInput?.valueAsNumber ?? 0,
      });
      store.shoes.push(shoe);
      writeStore(store);
      shoeForm.reset();
      if (initialInput) initialInput.value = '0';
      if (reminderInput) reminderInput.value = '600';
      render();
    } catch (error) {
      setError(shoeError, error instanceof ShoeInputError ? error.message : 'Could not add the shoe.');
    }
  });

  runForm.addEventListener('submit', (event) => {
    event.preventDefault();
    setError(runError, null);
    try {
      const run = validateRun({
        shoeId: shoeSelect.value,
        date: dateInput?.value ?? '',
        distanceKm: distanceInput?.valueAsNumber ?? 0,
      });
      store.runs.push(run);
      writeStore(store);
      if (distanceInput) distanceInput.value = '';
      render();
    } catch (error) {
      setError(runError, error instanceof ShoeInputError ? error.message : 'Could not add the run.');
    }
  });

  clearButton?.addEventListener('click', () => {
    if (!window.confirm(strings.confirmClear)) return;
    store = { shoes: [], runs: [] };
    writeStore(store);
    render();
  });

  if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
  render();
}
