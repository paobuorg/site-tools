export interface ShoeRecord {
  id: string;
  name: string;
  initialKm: number;
  reminderKm: number;
}

export interface ShoeRunRecord {
  id: string;
  shoeId: string;
  date: string;
  distanceKm: number;
}

export interface ShoeSummary {
  totalKm: number;
  runCount: number;
  remainingKm: number;
  percentOfReminder: number;
  lastRunDate: string | null;
}

export class ShoeInputError extends Error {
  field: 'name' | 'initial' | 'reminder' | 'distance' | 'date';

  constructor(field: ShoeInputError['field'], message: string) {
    super(message);
    this.name = 'ShoeInputError';
    this.field = field;
  }
}

export function validateShoe(input: { name: string; initialKm: number; reminderKm: number }): ShoeRecord {
  const name = input.name.trim();
  if (!name) throw new ShoeInputError('name', 'Give the shoe a name.');
  if (!Number.isFinite(input.initialKm) || input.initialKm < 0) {
    throw new ShoeInputError('initial', 'Initial distance must be zero or greater.');
  }
  if (!Number.isFinite(input.reminderKm) || input.reminderKm <= 0) {
    throw new ShoeInputError('reminder', 'Reminder distance must be greater than zero.');
  }
  return {
    id: `shoe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    initialKm: Number(input.initialKm.toFixed(1)),
    reminderKm: Number(input.reminderKm.toFixed(1)),
  };
}

export function validateRun(input: { shoeId: string; date: string; distanceKm: number }): ShoeRunRecord {
  if (!input.shoeId) throw new ShoeInputError('date', 'Choose a shoe.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new ShoeInputError('date', 'Use a date in YYYY-MM-DD format.');
  }
  if (!Number.isFinite(input.distanceKm) || input.distanceKm <= 0) {
    throw new ShoeInputError('distance', 'Distance must be greater than zero.');
  }
  return {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    shoeId: input.shoeId,
    date: input.date,
    distanceKm: Number(input.distanceKm.toFixed(1)),
  };
}

export function summarizeShoe(shoe: ShoeRecord, runs: ShoeRunRecord[]): ShoeSummary {
  const shoeRuns = runs.filter((run) => run.shoeId === shoe.id);
  const totalKm = Number(
    (shoe.initialKm + shoeRuns.reduce((sum, run) => sum + run.distanceKm, 0)).toFixed(1),
  );
  const remainingKm = Number(Math.max(0, shoe.reminderKm - totalKm).toFixed(1));
  const percentOfReminder = shoe.reminderKm > 0
    ? Number(((totalKm / shoe.reminderKm) * 100).toFixed(1))
    : 0;
  const lastRunDate = shoeRuns.length
    ? shoeRuns.map((run) => run.date).sort().at(-1) ?? null
    : null;
  return { totalKm, runCount: shoeRuns.length, remainingKm, percentOfReminder, lastRunDate };
}
