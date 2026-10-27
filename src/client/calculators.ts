import { formatDuration, parseDuration } from '@paobu/core/geo';
import {
  calculateDistanceFromPace,
  calculatePace,
  calculatePaceFromPace,
  calculateRunWalk,
  calculateSplits,
  predictRaceTime,
  unitToMeters,
  type DistanceUnit,
  type RunWalkMode,
  type SplitStrategy,
} from '../lib/calculators';
import { trackMimeType, trackOutputFileName } from '../lib/serialize-track';
import type { TrackFormat } from '../lib/parse-track';
import { compareRoutes, type ComparableRoute, type ComparisonKey } from '../lib/route-compare';

type Locale = 'zh-CN' | 'en';
type PaceMode = 'distance-time' | 'distance-pace' | 'time-pace';

function readStrings(root: HTMLElement): Record<string, string> {
  try {
    return JSON.parse(root.dataset.strings ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function setError(field: HTMLElement | null, message: string | null) {
  if (!field) return;
  if (message) {
    field.textContent = message;
    field.hidden = false;
  } else {
    field.textContent = '';
    field.hidden = true;
  }
}

function updateUrl(values: Record<string, string>) {
  try {
    const url = new URL(location.href);
    for (const [key, value] of Object.entries(values)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    history.replaceState(null, '', url.toString());
  } catch {
    /* URL updates are optional */
  }
}

function readUnit(root: HTMLElement): DistanceUnit {
  const checked = root.querySelector<HTMLInputElement>('input[name="unit"]:checked');
  return checked?.value === 'mi' ? 'mi' : 'km';
}

function setUnit(root: HTMLElement, unit: string) {
  const input = root.querySelector<HTMLInputElement>(`input[name="unit"][value="${unit === 'mi' ? 'mi' : 'km'}"]`);
  if (input) input.checked = true;
}

function formatNumber(value: number, locale: Locale, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

function initPace(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('[data-pace-form]');
  if (!form) return;
  const locale = (root.dataset.locale as Locale) ?? 'zh-CN';
  const strings = readStrings(root);
  const modeInputs = [...root.querySelectorAll<HTMLInputElement>('input[name="pace-mode"]')];
  const distanceField = root.querySelector<HTMLElement>('[data-mode-field="distance"]');
  const durationField = root.querySelector<HTMLElement>('[data-mode-field="duration"]');
  const paceField = root.querySelector<HTMLElement>('[data-mode-field="pace"]');
  const distanceInput = root.querySelector<HTMLInputElement>('[data-distance]');
  const durationInput = root.querySelector<HTMLInputElement>('[data-duration]');
  const paceInput = root.querySelector<HTMLInputElement>('[data-pace-value]');
  const distanceError = root.querySelector<HTMLElement>('[data-error="distance"]');
  const durationError = root.querySelector<HTMLElement>('[data-error="duration"]');
  const paceError = root.querySelector<HTMLElement>('[data-error="pace"]');
  const result = root.querySelector<HTMLElement>('[data-pace-result]');
  const paceKm = root.querySelector<HTMLElement>('[data-pace-km]');
  const paceMi = root.querySelector<HTMLElement>('[data-pace-mi]');
  const speed = root.querySelector<HTMLElement>('[data-pace-speed]');
  const totalTime = root.querySelector<HTMLElement>('[data-pace-duration]');
  const distanceUsed = root.querySelector<HTMLElement>('[data-distance-used]');
  const splitsLink = root.querySelector<HTMLAnchorElement>('[data-splits-link]');
  let mode: PaceMode = 'distance-time';

  const clearResult = () => {
    if (result) result.hidden = true;
  };

  const setMode = (next: PaceMode) => {
    mode = next;
    for (const input of modeInputs) input.checked = input.value === next;
    if (distanceField) distanceField.hidden = next === 'time-pace';
    if (durationField) durationField.hidden = next === 'distance-pace';
    if (paceField) paceField.hidden = next === 'distance-time';
    clearResult();
  };

  const params = new URLSearchParams(location.search);
  const requestedMode = params.get('mode');
  if (requestedMode === 'distance-pace' || requestedMode === 'time-pace' || requestedMode === 'distance-time') {
    mode = requestedMode;
  }
  if (params.get('distance')) distanceInput!.value = params.get('distance')!;
  if (params.get('duration')) durationInput!.value = params.get('duration')!;
  if (params.get('pace')) {
    const rawPace = params.get('pace')!;
    const seconds = rawPace.includes(':') ? null : Number(rawPace);
    paceInput!.value = rawPace.includes(':')
      ? rawPace
      : seconds !== null && Number.isFinite(seconds)
        ? formatDuration(seconds)
        : rawPace;
  }
  setUnit(root, params.get('unit') ?? 'km');
  setMode(mode);

  distanceInput?.addEventListener('input', clearResult);
  durationInput?.addEventListener('input', clearResult);
  paceInput?.addEventListener('input', clearResult);
  for (const radio of modeInputs) {
    radio.addEventListener('change', () => {
      const next = radio.value;
      if (next === 'distance-time' || next === 'distance-pace' || next === 'time-pace') setMode(next);
    });
  }
  for (const radio of root.querySelectorAll<HTMLInputElement>('input[name="unit"]')) {
    radio.addEventListener('change', clearResult);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    for (const input of [distanceInput, durationInput, paceInput]) input?.removeAttribute('aria-invalid');
    setError(distanceError, null);
    setError(durationError, null);
    setError(paceError, null);

    const unit = readUnit(root);
    const distance = Number(distanceInput?.value);
    const durationSeconds = parseDuration(durationInput?.value ?? '');
    const paceSeconds = parseDuration(paceInput?.value ?? '');
    let invalid = false;
    if (mode !== 'time-pace' && (!Number.isFinite(distance) || distance <= 0)) {
      setError(distanceError, strings.distanceError ?? 'Enter a distance greater than zero.');
      distanceInput?.setAttribute('aria-invalid', 'true');
      invalid = true;
    }
    if (mode !== 'distance-pace' && (durationSeconds === null || durationSeconds <= 0)) {
      setError(durationError, strings.durationError ?? 'Enter a time as hh:mm:ss or mm:ss.');
      durationInput?.setAttribute('aria-invalid', 'true');
      invalid = true;
    }
    if (mode !== 'distance-time' && (paceSeconds === null || paceSeconds <= 0)) {
      setError(paceError, strings.paceError ?? 'Enter a pace greater than zero, for example 05:00.');
      paceInput?.setAttribute('aria-invalid', 'true');
      invalid = true;
    }
    if (invalid) {
      clearResult();
      return;
    }

    const value =
      mode === 'distance-time'
        ? calculatePace({ distance, distanceUnit: unit, durationSeconds: durationSeconds! })
        : mode === 'distance-pace'
          ? calculatePaceFromPace({
              distance,
              distanceUnit: unit,
              paceSeconds: paceSeconds!,
              paceUnit: unit,
            })
          : calculateDistanceFromPace({
              durationSeconds: durationSeconds!,
              paceSeconds: paceSeconds!,
              paceUnit: unit,
              distanceUnit: unit,
            });

    if (paceKm) paceKm.textContent = formatDuration(value.displayPacePerKm);
    if (paceMi) paceMi.textContent = formatDuration(value.displayPacePerMile);
    if (speed) speed.textContent = value.displaySpeedKmh.toFixed(2);
    if (totalTime) totalTime.textContent = formatDuration(value.displayDuration);
    if (distanceUsed) {
      distanceUsed.textContent = `${formatNumber(value.displayDistance, locale, 3)} ${unit}`;
    }
    if (splitsLink) {
      const resolvedDistance = Number(value.distance.toFixed(3));
      splitsLink.href = `/${locale}/tools/splits/?distance=${encodeURIComponent(String(resolvedDistance))}&unit=${unit}&duration=${encodeURIComponent(formatDuration(value.displayDuration))}&split=1`;
    }
    if (result) result.hidden = false;
    updateUrl({
      mode,
      distance: mode === 'time-pace' ? '' : String(distance),
      unit,
      duration: mode === 'distance-pace' ? '' : (durationInput?.value.trim() ?? ''),
      pace: mode === 'distance-time' ? '' : (paceInput?.value.trim() ?? ''),
    });
  });
}

function initSplits(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('[data-splits-form]');
  if (!form) return;
  const locale = (root.dataset.locale as Locale) ?? 'zh-CN';
  const strings = readStrings(root);
  const distanceInput = root.querySelector<HTMLInputElement>('[data-distance]');
  const durationInput = root.querySelector<HTMLInputElement>('[data-duration]');
  const splitInput = root.querySelector<HTMLInputElement>('[data-split-distance]');
  const strategyInputs = [...root.querySelectorAll<HTMLInputElement>('input[name="split-strategy"]')];
  const deltaField = root.querySelector<HTMLElement>('[data-split-delta-field]');
  const deltaInput = root.querySelector<HTMLInputElement>('[data-split-delta]');
  const distanceError = root.querySelector<HTMLElement>('[data-error="distance"]');
  const durationError = root.querySelector<HTMLElement>('[data-error="duration"]');
  const splitError = root.querySelector<HTMLElement>('[data-error="split"]');
  const deltaError = root.querySelector<HTMLElement>('[data-error="delta"]');
  const result = root.querySelector<HTMLElement>('[data-splits-result]');
  const summary = root.querySelector<HTMLElement>('[data-splits-summary]');
  const tbody = root.querySelector<HTMLTableSectionElement>('[data-splits-body]');
  const printButton = root.querySelector<HTMLButtonElement>('[data-print-splits]');

  const params = new URLSearchParams(location.search);
  if (params.get('distance')) distanceInput!.value = params.get('distance')!;
  if (params.get('duration')) durationInput!.value = params.get('duration')!;
  if (params.get('split')) splitInput!.value = params.get('split')!;
  if (params.get('delta')) deltaInput!.value = params.get('delta')!;
  setUnit(root, params.get('unit') ?? 'km');

  const clearResult = () => {
    if (result) result.hidden = true;
  };

  const readStrategy = (): SplitStrategy =>
    root.querySelector<HTMLInputElement>('input[name="split-strategy"]:checked')?.value === 'negative'
      ? 'negative'
      : 'even';

  const setStrategy = (strategy: SplitStrategy) => {
    for (const input of strategyInputs) input.checked = input.value === strategy;
    if (deltaField) deltaField.hidden = strategy !== 'negative';
    clearResult();
  };

  const requestedStrategy = params.get('strategy');
  setStrategy(requestedStrategy === 'negative' ? 'negative' : 'even');

  for (const input of [distanceInput, durationInput, splitInput, deltaInput]) {
    input?.addEventListener('input', clearResult);
  }
  for (const radio of strategyInputs) {
    radio.addEventListener('change', () => setStrategy(readStrategy()));
  }
  for (const radio of root.querySelectorAll<HTMLInputElement>('input[name="unit"]')) {
    radio.addEventListener('change', clearResult);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    for (const input of [distanceInput, durationInput, splitInput, deltaInput]) input?.removeAttribute('aria-invalid');
    setError(distanceError, null);
    setError(durationError, null);
    setError(splitError, null);
    setError(deltaError, null);

    const distance = Number(distanceInput?.value);
    const unit = readUnit(root);
    const durationSeconds = parseDuration(durationInput?.value ?? '');
    const splitDistance = Number(splitInput?.value);
    const strategy = readStrategy();
    const delta = Number(deltaInput?.value);
    let invalid = false;
    if (!Number.isFinite(distance) || distance <= 0) {
      setError(distanceError, strings.distanceError ?? 'Enter a distance greater than zero.');
      distanceInput?.setAttribute('aria-invalid', 'true');
      invalid = true;
    }
    if (durationSeconds === null || durationSeconds <= 0) {
      setError(durationError, strings.durationError ?? 'Enter a time as hh:mm:ss or mm:ss.');
      durationInput?.setAttribute('aria-invalid', 'true');
      invalid = true;
    }
    if (!Number.isFinite(splitDistance) || splitDistance <= 0) {
      setError(splitError, strings.splitError ?? 'Enter a split distance greater than zero.');
      splitInput?.setAttribute('aria-invalid', 'true');
      invalid = true;
    }
    if (strategy === 'negative' && (!Number.isFinite(delta) || delta < 0 || delta > 0.1)) {
      setError(deltaError, strings.deltaError ?? 'The negative-split difference must be between 0 and 0.10.');
      deltaInput?.setAttribute('aria-invalid', 'true');
      invalid = true;
    }
    if (invalid) {
      clearResult();
      return;
    }

    let value;
    try {
      value = calculateSplits(distance, unit, durationSeconds!, splitDistance, strategy, delta);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'tooManySplits') {
        setError(splitError, strings.tooManySplits ?? 'Too many splits.');
      } else if (code === 'delta') {
        setError(deltaError, strings.deltaError ?? 'The negative-split difference must be between 0 and 0.10.');
      } else {
        setError(splitError, strings.splitError ?? 'Check the values.');
      }
      clearResult();
      return;
    }

    if (tbody) tbody.textContent = '';
    for (const row of value.rows) {
      const tr = document.createElement('tr');
      const cells = [
        String(row.index),
        `${formatNumber(row.distance, locale, 3)} ${unit}`,
        formatDuration(row.cumulativeSeconds),
        formatDuration(row.splitSeconds),
      ];
      for (const cell of cells) {
        const td = document.createElement('td');
        td.textContent = cell;
        tr.appendChild(td);
      }
      tbody?.appendChild(tr);
    }
    if (summary) {
      summary.textContent = (strings.splitSummary ?? '{count} splits of {distance} · {strategy}')
        .replace('{count}', String(value.splitCount))
        .replace('{distance}', `${formatNumber(value.splitDistance, locale, 3)} ${unit}`)
        .replace(
          '{strategy}',
          strategy === 'negative'
            ? strings.strategyNegative ?? 'Negative split'
            : strings.strategyEven ?? 'Even',
        );
    }
    if (result) result.hidden = false;
    updateUrl({
      distance: String(distance),
      unit,
      duration: durationInput?.value.trim() ?? '',
      split: String(splitDistance),
      strategy,
      delta: strategy === 'negative' ? String(delta) : '',
    });
  });

  printButton?.addEventListener('click', () => window.print());
}

function initRunWalk(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('[data-run-walk-form]');
  if (!form) return;
  const locale = (root.dataset.locale as Locale) ?? 'zh-CN';
  const strings = readStrings(root);
  const modeInputs = [...root.querySelectorAll<HTMLInputElement>('input[name="run-walk-mode"]')];
  const runInput = root.querySelector<HTMLInputElement>('[data-run-duration]');
  const walkInput = root.querySelector<HTMLInputElement>('[data-walk-duration]');
  const cyclesInput = root.querySelector<HTMLInputElement>('[data-cycles]');
  const totalInput = root.querySelector<HTMLInputElement>('[data-total-duration]');
  const cyclesField = root.querySelector<HTMLElement>('[data-run-walk-field="cycles"]');
  const totalField = root.querySelector<HTMLElement>('[data-run-walk-field="duration"]');
  const runError = root.querySelector<HTMLElement>('[data-error="run"]');
  const walkError = root.querySelector<HTMLElement>('[data-error="walk"]');
  const cyclesError = root.querySelector<HTMLElement>('[data-error="cycles"]');
  const totalError = root.querySelector<HTMLElement>('[data-error="total"]');
  const result = root.querySelector<HTMLElement>('[data-run-walk-result]');
  const tbody = root.querySelector<HTMLTableSectionElement>('[data-rw-body]');
  const status = root.querySelector<HTMLElement>('[data-rw-status]');
  let mode: RunWalkMode = 'cycles';

  const params = new URLSearchParams(location.search);
  if (params.get('run')) runInput!.value = params.get('run')!;
  if (params.get('walk')) walkInput!.value = params.get('walk')!;
  if (params.get('cycles')) cyclesInput!.value = params.get('cycles')!;
  if (params.get('total')) totalInput!.value = params.get('total')!;

  const clearResult = () => {
    if (result) result.hidden = true;
  };

  const setMode = (next: RunWalkMode) => {
    mode = next;
    for (const input of modeInputs) input.checked = input.value === next;
    if (cyclesField) cyclesField.hidden = next !== 'cycles';
    if (totalField) totalField.hidden = next !== 'duration';
    clearResult();
  };

  setMode(params.get('mode') === 'duration' ? 'duration' : 'cycles');

  for (const input of [runInput, walkInput, cyclesInput, totalInput]) {
    input?.addEventListener('input', clearResult);
  }
  for (const radio of modeInputs) {
    radio.addEventListener('change', () => {
      setMode(radio.value === 'duration' ? 'duration' : 'cycles');
    });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    for (const input of [runInput, walkInput, cyclesInput, totalInput]) input?.removeAttribute('aria-invalid');
    setError(runError, null);
    setError(walkError, null);
    setError(cyclesError, null);
    setError(totalError, null);

    const runSeconds = parseDuration(runInput?.value ?? '');
    const walkSeconds = parseDuration(walkInput?.value ?? '');
    const cycles = Number(cyclesInput?.value);
    const totalSeconds = parseDuration(totalInput?.value ?? '');
    let invalid = false;
    if (runSeconds === null || !Number.isInteger(runSeconds) || runSeconds <= 0) {
      setError(runError, strings.runError ?? 'Enter a run duration greater than zero.');
      runInput?.setAttribute('aria-invalid', 'true');
      invalid = true;
    }
    if (walkSeconds === null || !Number.isInteger(walkSeconds) || walkSeconds < 0) {
      setError(walkError, strings.walkError ?? 'Walk time may be 00:00 or a larger whole number of seconds.');
      walkInput?.setAttribute('aria-invalid', 'true');
      invalid = true;
    }
    if (mode === 'cycles' && (!Number.isInteger(cycles) || cycles < 1 || cycles > 1000)) {
      setError(cyclesError, strings.cyclesError ?? 'Cycles must be a whole number from 1 to 1000.');
      cyclesInput?.setAttribute('aria-invalid', 'true');
      invalid = true;
    }
    if (
      mode === 'duration' &&
      (totalSeconds === null || !Number.isInteger(totalSeconds) || totalSeconds <= 0 || totalSeconds > 604800)
    ) {
      setError(totalError, strings.totalError ?? 'Total time must be a whole number of seconds up to 7 days.');
      totalInput?.setAttribute('aria-invalid', 'true');
      invalid = true;
    }
    if (invalid) {
      clearResult();
      return;
    }

    let value;
    try {
      value = calculateRunWalk({
        mode,
        runSeconds: runSeconds!,
        walkSeconds: walkSeconds!,
        cycles: mode === 'cycles' ? cycles : undefined,
        totalSeconds: mode === 'duration' ? totalSeconds! : undefined,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'run') setError(runError, strings.runError ?? 'Check the run duration.');
      else if (code === 'walk') setError(walkError, strings.walkError ?? 'Check the walk duration.');
      else if (code === 'cycles') setError(cyclesError, strings.cyclesError ?? 'Check the number of cycles.');
      else if (code === 'tooManySegments') {
        setError(totalError, strings.tooManySegments ?? 'Too many segments.');
      } else {
        setError(totalError, strings.totalError ?? 'Check the total time.');
      }
      clearResult();
      return;
    }

    const set = (selector: string, text: string) => {
      const element = root.querySelector<HTMLElement>(selector);
      if (element) element.textContent = text;
    };
    set('[data-rw-scheduled]', formatDuration(value.scheduledSeconds));
    set('[data-rw-requested]', formatDuration(value.requestedSeconds));
    set('[data-rw-run]', formatDuration(value.runSecondsTotal));
    set('[data-rw-walk]', formatDuration(value.walkSecondsTotal));
    set('[data-rw-cycles]', formatNumber(value.fullCycles, locale, 0));
    if (status) {
      status.textContent = value.truncated
        ? strings.rwTruncated ?? 'The final segment is cut at the requested total.'
        : strings.rwComplete ?? 'Every segment is complete.';
    }
    if (tbody) {
      tbody.textContent = '';
      for (const segment of value.segments) {
        const tr = document.createElement('tr');
        const cells = [
          String(segment.cycle),
          segment.kind === 'run' ? strings.rwRun ?? 'Run' : strings.rwWalk ?? 'Walk',
          formatDuration(segment.seconds),
          segment.partial ? strings.rwPartial ?? 'Partial' : strings.rwFull ?? 'Complete',
        ];
        for (const cell of cells) {
          const td = document.createElement('td');
          td.textContent = cell;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
    }
    if (result) result.hidden = false;
    updateUrl({
      mode,
      run: runInput?.value.trim() ?? '',
      walk: walkInput?.value.trim() ?? '',
      cycles: mode === 'cycles' ? String(cycles) : '',
      total: mode === 'duration' ? (totalInput?.value.trim() ?? '') : '',
    });
  });
}

function initRacePredict(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('[data-race-form]');
  if (!form) return;
  const locale = (root.dataset.locale as Locale) ?? 'zh-CN';
  const strings = readStrings(root);
  const knownDistanceInput = root.querySelector<HTMLInputElement>('[data-known-distance]');
  const knownTimeInput = root.querySelector<HTMLInputElement>('[data-known-time]');
  const targetDistanceInput = root.querySelector<HTMLInputElement>('[data-target-distance]');
  const knownDistanceError = root.querySelector<HTMLElement>('[data-error="knownDistance"]');
  const knownTimeError = root.querySelector<HTMLElement>('[data-error="knownTime"]');
  const targetDistanceError = root.querySelector<HTMLElement>('[data-error="targetDistance"]');
  const result = root.querySelector<HTMLElement>('[data-race-result]');

  const params = new URLSearchParams(location.search);
  if (params.get('known')) knownDistanceInput!.value = params.get('known')!;
  if (params.get('time')) knownTimeInput!.value = params.get('time')!;
  if (params.get('target')) targetDistanceInput!.value = params.get('target')!;
  setUnit(root, params.get('unit') ?? 'km');

  const clearResult = () => {
    if (result) result.hidden = true;
  };
  for (const input of [knownDistanceInput, knownTimeInput, targetDistanceInput]) {
    input?.addEventListener('input', clearResult);
  }
  for (const radio of root.querySelectorAll<HTMLInputElement>('input[name="unit"]')) {
    radio.addEventListener('change', clearResult);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    for (const input of [knownDistanceInput, knownTimeInput, targetDistanceInput]) {
      input?.removeAttribute('aria-invalid');
    }
    setError(knownDistanceError, null);
    setError(knownTimeError, null);
    setError(targetDistanceError, null);

    const unit = readUnit(root);
    const factor = unitToMeters(unit);
    const knownDistance = Number(knownDistanceInput?.value);
    const targetDistance = Number(targetDistanceInput?.value);
    const knownTimeSeconds = parseDuration(knownTimeInput?.value ?? '');
    const knownMeters = knownDistance * factor;
    const targetMeters = targetDistance * factor;
    const distanceMessage =
      strings.raceDistanceError ?? 'Distance must be between 5 km and 42.195 km (or the equivalent in miles).';
    let invalid = false;
    if (!Number.isFinite(knownMeters) || knownMeters < 5000 || knownMeters > 42195) {
      setError(knownDistanceError, distanceMessage);
      knownDistanceInput?.setAttribute('aria-invalid', 'true');
      invalid = true;
    }
    if (knownTimeSeconds === null || knownTimeSeconds <= 0) {
      setError(knownTimeError, strings.raceTimeError ?? 'Enter a finish time greater than zero.');
      knownTimeInput?.setAttribute('aria-invalid', 'true');
      invalid = true;
    }
    if (!Number.isFinite(targetMeters) || targetMeters < 5000 || targetMeters > 42195) {
      setError(targetDistanceError, distanceMessage);
      targetDistanceInput?.setAttribute('aria-invalid', 'true');
      invalid = true;
    }
    if (invalid) {
      clearResult();
      return;
    }

    let value;
    try {
      value = predictRaceTime({
        knownDistanceMeters: knownMeters,
        knownTimeSeconds: knownTimeSeconds!,
        targetDistanceMeters: targetMeters,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'knownDistance') setError(knownDistanceError, distanceMessage);
      else if (code === 'targetDistance') setError(targetDistanceError, distanceMessage);
      else setError(knownTimeError, strings.raceTimeError ?? 'Check the finish time.');
      clearResult();
      return;
    }

    const set = (selector: string, text: string) => {
      const element = root.querySelector<HTMLElement>(selector);
      if (element) element.textContent = text;
    };
    set('[data-race-time]', formatDuration(value.displayPredictedSeconds));
    set('[data-race-pace-km]', formatDuration(value.displayPacePerKm));
    set('[data-race-pace-mi]', formatDuration(value.displayPacePerMile));
    set('[data-race-speed]', value.displaySpeedKmh.toFixed(2));
    set('[data-race-ratio]', formatNumber(value.ratio, locale, 6));
    if (result) result.hidden = false;
    updateUrl({
      known: String(knownDistance),
      time: knownTimeInput?.value.trim() ?? '',
      target: String(targetDistance),
      unit,
    });
  });
}

interface TrackSummaryMessage {
  distanceMeters: number;
  pointCount: number;
  segmentCount: number;
  elevationGainMeters: number | null;
  start: { lon: number; lat: number; elevation: number | null };
  end: { lon: number; lat: number; elevation: number | null };
  warnings: Array<{ code: string; count?: number }>;
}

interface SegmentSimplifyPayload {
  originalPointCount: number;
  simplifiedPointCount: number;
  distanceBeforeMeters: number;
  distanceAfterMeters: number;
  segmentStats: Array<{
    index: number;
    originalPointCount: number;
    simplifiedPointCount: number;
    originalDistanceMeters: number;
    simplifiedDistanceMeters: number;
  }>;
}

interface ConvertedMessage {
  content: string;
  format: TrackFormat;
  sourceFormat: TrackFormat;
  summary: TrackSummaryMessage;
}

interface SimplifiedMessage {
  content: string;
  format: TrackFormat;
  toleranceMeters: number;
  result: SegmentSimplifyPayload;
}

function formatBytes(bytes: number, locale: Locale): string {
  if (bytes < 1000) return `${formatNumber(bytes, locale, 0)} B`;
  if (bytes < 1_000_000) return `${formatNumber(bytes / 1000, locale, 1)} KB`;
  return `${formatNumber(bytes / 1_000_000, locale, 1)} MB`;
}

function initTrackTransform(root: HTMLElement) {
  const kind = root.dataset.tool === 'track-simplify' ? 'simplify' : 'convert';
  const input = root.querySelector<HTMLInputElement>('[data-transform-file]');
  const startButton = root.querySelector<HTMLButtonElement>('[data-transform-run]');
  const cancelButton = root.querySelector<HTMLButtonElement>('[data-transform-cancel]');
  const status = root.querySelector<HTMLElement>('[data-transform-status]');
  const progress = root.querySelector<HTMLProgressElement>('[data-transform-progress]');
  const errorBox = root.querySelector<HTMLElement>('[data-transform-error]');
  const errorText = root.querySelector<HTMLElement>('[data-transform-error-text]');
  const convertResult = root.querySelector<HTMLElement>('[data-convert-result]');
  const simplifyResult = root.querySelector<HTMLElement>('[data-simplify-result]');
  const toleranceInput = root.querySelector<HTMLInputElement>('[data-simplify-tolerance]');
  const toleranceError = root.querySelector<HTMLElement>('[data-error="tolerance"]');
  const download = root.querySelector<HTMLAnchorElement>(
    kind === 'convert' ? '[data-convert-download]' : '[data-simplify-download]',
  );
  const maxFileBytes = Number(root.dataset.maxFileBytes ?? '20000000');
  if (!input || !startButton) return;
  const locale = (root.dataset.locale as Locale) ?? 'zh-CN';
  const strings = readStrings(root);
  let worker: Worker | null = null;
  let jobId = 0;
  let timeout = 0;
  let slowTimer = 0;

  const clearDownload = () => {
    if (!download) return;
    if (download.dataset.url) URL.revokeObjectURL(download.dataset.url);
    delete download.dataset.url;
    download.href = '#';
    download.hidden = true;
  };

  const resetOutput = () => {
    if (errorBox) errorBox.hidden = true;
    if (convertResult) convertResult.hidden = true;
    if (simplifyResult) simplifyResult.hidden = true;
    if (progress) {
      progress.hidden = true;
      progress.value = 0;
    }
    clearDownload();
  };

  const finish = (message: string) => {
    window.clearTimeout(timeout);
    window.clearTimeout(slowTimer);
    if (status) status.textContent = message;
    if (progress) progress.hidden = true;
    if (cancelButton) cancelButton.hidden = true;
    if (startButton) startButton.disabled = false;
  };

  const showError = (message: string) => {
    if (convertResult) convertResult.hidden = true;
    if (simplifyResult) simplifyResult.hidden = true;
    if (errorText) errorText.textContent = message;
    if (errorBox) errorBox.hidden = false;
  };

  const errorFor = (code: string, segmentIndex?: number): string => {
    const map: Record<string, string> = {
      'too-large': strings.tooLarge ?? 'File is too large.',
      'unsafe-xml': strings.unsafeXml ?? 'DTD and entity declarations are not allowed.',
      'invalid-xml': strings.invalidXml ?? 'The GPX file is not well-formed XML.',
      'unsupported-format': strings.unsupported ?? 'Only GPX and GeoJSON files are supported.',
      'invalid-json': strings.invalidJson ?? 'The GeoJSON file is not valid JSON.',
      'no-points': strings.noPoints ?? 'No track points were found.',
      'invalid-coordinate': strings.invalidCoordinate ?? 'The file contains an invalid coordinate.',
      'too-many-points': strings.tooManyPoints ?? 'The file contains too many points.',
      'empty-geometry': strings.emptyGeometry ?? 'The file contains no usable line geometry.',
      'simplify-tolerance': strings.simplifyToleranceError ?? 'Tolerance must be between 1 and 100 metres.',
      'simplify-latitude': strings.simplifyLatitudeError ?? 'A segment lies beyond 85 degrees latitude.',
      'simplify-dateline': strings.simplifyDatelineError ?? 'A segment crosses the antimeridian.',
      'simplify-range': strings.simplifyRangeError ?? 'A segment spans more than 500 km.',
      unknown: strings.unknownError ?? 'The file could not be read.',
    };
    const message = map[code] ?? map.unknown!;
    return message.replace('{segment}', String(segmentIndex ?? ''));
  };

  const updateDownload = (content: string, fileName: string, format: TrackFormat) => {
    if (!download) return;
    if (download.dataset.url) URL.revokeObjectURL(download.dataset.url);
    const url = URL.createObjectURL(new Blob([content], { type: trackMimeType(format) }));
    download.dataset.url = url;
    download.href = url;
    download.download = fileName;
    download.hidden = false;
  };

  input.addEventListener('change', () => {
    resetOutput();
    if (status) status.textContent = '';
    startButton.disabled = !input.files || input.files.length === 0;
    if (cancelButton) cancelButton.hidden = true;
    if (kind === 'convert') {
      const name = input.files?.[0]?.name.toLowerCase() ?? '';
      const target = name.endsWith('.gpx') ? 'geojson' : 'gpx';
      const radio = root.querySelector<HTMLInputElement>(`input[name="convert-format"][value="${target}"]`);
      if (radio) radio.checked = true;
    }
  });

  toleranceInput?.addEventListener('input', () => {
    resetOutput();
    setError(toleranceError, null);
  });

  startButton.addEventListener('click', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > maxFileBytes) {
      resetOutput();
      finish(strings.failed ?? 'Processing failed.');
      showError(strings.tooLarge ?? 'File is too large.');
      return;
    }
    let toleranceMeters = 10;
    if (kind === 'simplify') {
      toleranceMeters = Number(toleranceInput?.value);
      if (
        !Number.isFinite(toleranceMeters) ||
        toleranceMeters < 1 ||
        toleranceMeters > 100
      ) {
        setError(toleranceError, strings.simplifyToleranceError ?? 'Tolerance must be between 1 and 100 metres.');
        toleranceInput?.setAttribute('aria-invalid', 'true');
        resetOutput();
        return;
      }
      toleranceInput?.removeAttribute('aria-invalid');
      setError(toleranceError, null);
    }

    jobId += 1;
    const current = jobId;
    resetOutput();
    startButton.disabled = true;
    if (cancelButton) cancelButton.hidden = false;
    if (progress) {
      progress.hidden = false;
      progress.value = 0.05;
    }
    if (status) status.textContent = strings.processing ?? 'Reading the file locally…';

    let text: string;
    try {
      text = await file.text();
    } catch {
      finish(strings.failed ?? 'Processing failed.');
      showError(strings.unknownError ?? 'The file could not be read.');
      return;
    }
    if (current !== jobId) return;

    const format = kind === 'convert'
      ? (root.querySelector<HTMLInputElement>('input[name="convert-format"]:checked')?.value === 'gpx'
          ? 'gpx'
          : 'geojson')
      : undefined;

    worker = new Worker(new URL('../workers/transform.worker.ts', import.meta.url), { type: 'module' });
    slowTimer = window.setTimeout(() => {
      if (status) status.textContent = strings.slowHint ?? 'The file is still being processed locally.';
    }, 10000);
    timeout = window.setTimeout(() => {
      worker?.terminate();
      worker = null;
      finish(strings.timeout ?? 'Processing took too long.');
      showError(strings.timeout ?? 'Processing took too long. Try a smaller file.');
    }, 30000);

    worker.onmessage = (
      event: MessageEvent<{
        id: number;
        type: string;
        value?: number;
        code?: string;
        segmentIndex?: number;
        content?: string;
        format?: TrackFormat;
        sourceFormat?: TrackFormat;
        summary?: TrackSummaryMessage;
        toleranceMeters?: number;
        result?: SegmentSimplifyPayload;
      }>,
    ) => {
      const data = event.data;
      if (!data || data.id !== current) return;
      if (data.type === 'progress') {
        if (progress && typeof data.value === 'number') progress.value = data.value;
        return;
      }
      window.clearTimeout(timeout);
      window.clearTimeout(slowTimer);
      if (data.type === 'converted' && data.content && data.format && data.summary) {
        renderConverted({
          content: data.content,
          format: data.format,
          sourceFormat: data.sourceFormat ?? 'geojson',
          summary: data.summary,
        });
        finish(strings.done ?? 'Done.');
      } else if (data.type === 'simplified' && data.content && data.format && data.result) {
        renderSimplified({
          content: data.content,
          format: data.format,
          toleranceMeters: data.toleranceMeters ?? toleranceMeters,
          result: data.result,
        });
        finish(strings.done ?? 'Done.');
      } else if (data.type === 'error') {
        finish(strings.failed ?? 'Processing failed.');
        showError(errorFor(data.code ?? 'unknown', data.segmentIndex));
      }
      worker?.terminate();
      worker = null;
    };
    worker.onerror = () => {
      finish(strings.failed ?? 'Processing failed.');
      showError(strings.unknownError ?? 'The file could not be read.');
      worker?.terminate();
      worker = null;
    };
    worker.postMessage({
      id: current,
      operation: kind,
      text,
      fileName: file.name,
      byteLength: file.size,
      format,
      toleranceMeters,
    });
  });

  cancelButton?.addEventListener('click', () => {
    jobId += 1;
    window.clearTimeout(timeout);
    window.clearTimeout(slowTimer);
    worker?.terminate();
    worker = null;
    finish(strings.cancelled ?? 'Processing cancelled.');
  });

  const setText = (selector: string, text: string) => {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) element.textContent = text;
  };

  function renderConverted(message: ConvertedMessage) {
    const fileName = trackOutputFileName(message.format, 'converted');
    setText('[data-convert-source]', message.sourceFormat.toUpperCase());
    setText('[data-convert-format]', message.format.toUpperCase());
    setText('[data-convert-points]', formatNumber(message.summary.pointCount, locale, 0));
    setText('[data-convert-segments]', formatNumber(message.summary.segmentCount, locale, 0));
    setText('[data-convert-distance]', `${formatNumber(message.summary.distanceMeters, locale, 0)} m`);
    setText('[data-convert-size]', formatBytes(new Blob([message.content]).size, locale));
    setText('[data-convert-file-name]', fileName);
    updateDownload(message.content, fileName, message.format);
    if (convertResult) convertResult.hidden = false;
  }

  function renderSimplified(message: SimplifiedMessage) {
    const fileName = trackOutputFileName(message.format, 'simplified');
    const result = message.result;
    const retained = result.originalPointCount === 0
      ? 0
      : (result.simplifiedPointCount / result.originalPointCount) * 100;
    const delta = result.distanceAfterMeters - result.distanceBeforeMeters;
    setText('[data-simplify-original]', formatNumber(result.originalPointCount, locale, 0));
    setText('[data-simplify-simplified]', formatNumber(result.simplifiedPointCount, locale, 0));
    setText('[data-simplify-retained]', `${formatNumber(retained, locale, 1)}%`);
    setText('[data-simplify-tolerance-used]', `${formatNumber(message.toleranceMeters, locale, 1)} m`);
    setText('[data-simplify-distance-before]', `${formatNumber(result.distanceBeforeMeters, locale, 0)} m`);
    setText('[data-simplify-distance-after]', `${formatNumber(result.distanceAfterMeters, locale, 0)} m`);
    setText(
      '[data-simplify-distance-delta]',
      `${delta > 0 ? '+' : ''}${formatNumber(delta, locale, 0)} m`,
    );
    setText('[data-simplify-file-name]', fileName);
    const tbody = root.querySelector<HTMLTableSectionElement>('[data-simplify-body]');
    if (tbody) {
      tbody.textContent = '';
      for (const segment of result.segmentStats) {
        const tr = document.createElement('tr');
        const cells = [
          String(segment.index),
          formatNumber(segment.originalPointCount, locale, 0),
          formatNumber(segment.simplifiedPointCount, locale, 0),
          `${formatNumber(segment.originalDistanceMeters, locale, 0)} m`,
          `${formatNumber(segment.simplifiedDistanceMeters, locale, 0)} m`,
        ];
        for (const cell of cells) {
          const td = document.createElement('td');
          td.textContent = cell;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
    }
    updateDownload(message.content, fileName, message.format);
    if (simplifyResult) simplifyResult.hidden = false;
  }
}

function initTrackView(root: HTMLElement) {
  const input = root.querySelector<HTMLInputElement>('[data-track-file]');
  const startButton = root.querySelector<HTMLButtonElement>('[data-track-run]');
  const cancelButton = root.querySelector<HTMLButtonElement>('[data-track-cancel]');
  const status = root.querySelector<HTMLElement>('[data-track-status]');
  const progress = root.querySelector<HTMLProgressElement>('[data-track-progress]');
  const errorBox = root.querySelector<HTMLElement>('[data-track-error]');
  const errorText = root.querySelector<HTMLElement>('[data-track-error-text]');
  const result = root.querySelector<HTMLElement>('[data-track-result]');
  const warningsBox = root.querySelector<HTMLElement>('[data-track-warnings]');
  const warningsBlock = root.querySelector<HTMLElement>('[data-track-warnings-block]');
  const maxFileBytes = Number(root.dataset.maxFileBytes ?? '20000000');
  if (!input || !startButton) return;
  const locale = (root.dataset.locale as Locale) ?? 'zh-CN';
  const strings = readStrings(root);
  let worker: Worker | null = null;
  let jobId = 0;
  let timeout = 0;
  let slowTimer = 0;

  const resetOutput = () => {
    if (errorBox) errorBox.hidden = true;
    if (result) result.hidden = true;
    if (warningsBox) warningsBox.textContent = '';
    if (warningsBlock) warningsBlock.hidden = true;
    if (progress) {
      progress.hidden = true;
      progress.value = 0;
    }
  };

  const finish = (message: string) => {
    window.clearTimeout(slowTimer);
    if (status) status.textContent = message;
    if (progress) progress.hidden = true;
    if (cancelButton) cancelButton.hidden = true;
    if (startButton) startButton.disabled = false;
  };

  const showError = (message: string) => {
    result && (result.hidden = true);
    if (errorText) errorText.textContent = message;
    if (errorBox) errorBox.hidden = false;
  };

  const errorFor = (code: string): string => {
    const map: Record<string, string> = {
      'too-large': strings.tooLarge ?? 'File is too large.',
      'unsafe-xml': strings.unsafeXml ?? 'DTD and entity declarations are not allowed.',
      'invalid-xml': strings.invalidXml ?? 'The GPX file is not well-formed XML.',
      'unsupported-format': strings.unsupported ?? 'Only GPX and GeoJSON files are supported.',
      'invalid-json': strings.invalidJson ?? 'The GeoJSON file is not valid JSON.',
      'no-points': strings.noPoints ?? 'No track points were found.',
      'invalid-coordinate': strings.invalidCoordinate ?? 'The file contains an invalid coordinate.',
      'too-many-points': strings.tooManyPoints ?? 'The file contains too many points.',
      'empty-geometry': strings.emptyGeometry ?? 'The file contains no usable line geometry.',
      unknown: strings.unknownError ?? 'The file could not be read.',
    };
    return map[code] ?? map.unknown!;
  };

  input.addEventListener('change', () => {
    resetOutput();
    if (status) status.textContent = '';
    startButton.disabled = !input.files || input.files.length === 0;
    if (cancelButton) cancelButton.hidden = true;
  });

  startButton.addEventListener('click', async () => {
    const file = input.files?.[0];
    if (!file) return;
    jobId += 1;
    const current = jobId;
    resetOutput();
    if (file.size > maxFileBytes) {
      finish(strings.failed ?? 'Processing failed.');
      showError(strings.tooLarge ?? 'File is too large.');
      return;
    }
    startButton.disabled = true;
    if (cancelButton) cancelButton.hidden = false;
    if (progress) {
      progress.hidden = false;
      progress.value = 0.05;
    }
    if (status) status.textContent = strings.processing ?? 'Reading the file locally…';

    let text: string;
    try {
      text = await file.text();
    } catch {
      finish(strings.failed ?? 'Processing failed.');
      showError(strings.unknownError ?? 'The file could not be read.');
      return;
    }
    if (current !== jobId) return;

    worker = new Worker(new URL('../workers/track.worker.ts', import.meta.url), { type: 'module' });
    slowTimer = window.setTimeout(() => {
      if (status) status.textContent = strings.slowHint ?? 'The file is still being processed locally.';
    }, 10000);
    timeout = window.setTimeout(() => {
      worker?.terminate();
      worker = null;
      finish(strings.timeout ?? 'Processing took too long.');
      showError(strings.timeout ?? 'Processing took too long. Try a smaller file or simplify the track.');
    }, 30000);

    worker.onmessage = (event: MessageEvent<{ id: number; type: string; value?: number; result?: TrackSummaryMessage; code?: string }>) => {
      const data = event.data;
      if (!data || data.id !== current) return;
      if (data.type === 'progress') {
        if (progress && typeof data.value === 'number') progress.value = data.value;
        return;
      }
      window.clearTimeout(timeout);
      window.clearTimeout(slowTimer);
      if (data.type === 'result' && data.result) {
        renderTrack(data.result);
        finish(strings.done ?? 'Done.');
      } else if (data.type === 'error') {
        finish(strings.failed ?? 'Processing failed.');
        showError(errorFor(data.code ?? 'unknown'));
      }
      worker?.terminate();
      worker = null;
    };
    worker.onerror = () => {
      window.clearTimeout(timeout);
      window.clearTimeout(slowTimer);
      finish(strings.failed ?? 'Processing failed.');
      showError(strings.unknownError ?? 'The file could not be read.');
      worker?.terminate();
      worker = null;
    };
    worker.postMessage({ id: current, text, fileName: file.name, byteLength: file.size });
  });

  cancelButton?.addEventListener('click', () => {
    jobId += 1;
    window.clearTimeout(timeout);
    window.clearTimeout(slowTimer);
    worker?.terminate();
    worker = null;
    finish(strings.cancelled ?? 'Processing cancelled.');
    if (status) status.textContent = strings.cancelled ?? 'Processing cancelled.';
  });

  function renderTrack(value: TrackSummaryMessage) {
    const set = (selector: string, text: string) => {
      const element = root.querySelector<HTMLElement>(selector);
      if (element) element.textContent = text;
    };
    set('[data-track-distance]', `${formatNumber(value.distanceMeters, locale, 0)} m`);
    set('[data-track-points]', formatNumber(value.pointCount, locale, 0));
    set('[data-track-segments]', formatNumber(value.segmentCount, locale, 0));
    set(
      '[data-track-elevation]',
      value.elevationGainMeters === null ? strings.unknown ?? 'Unknown' : `${formatNumber(value.elevationGainMeters, locale, 0)} m`,
    );
    set('[data-track-start]', `${value.start.lat.toFixed(5)}, ${value.start.lon.toFixed(5)}`);
    set('[data-track-end]', `${value.end.lat.toFixed(5)}, ${value.end.lon.toFixed(5)}`);
    set('[data-track-file-name]', input?.files?.[0]?.name ?? '');
    const warningCopy: Record<string, string> = {
      'elevation-missing': strings.elevationMissing ?? 'The file has no elevation values; elevation gain is unknown.',
      'elevation-partial': strings.elevationPartial ?? 'Some points lack elevation; gain is reported as unknown to avoid undercounting.',
      'suspicious-jumps': strings.suspiciousJumps ?? 'One or more consecutive points are more than 10 km apart.',
      'multiple-segments': strings.multipleSegments ?? 'The file contains multiple segments; distances are summed without joining their endpoints.',
    };
    if (warningsBox) {
      warningsBox.textContent = '';
      for (const warning of value.warnings) {
        const item = document.createElement('li');
        item.textContent = (warningCopy[warning.code] ?? warning.code).replace('{count}', String(warning.count ?? ''));
        warningsBox.appendChild(item);
      }
      warningsBox.hidden = value.warnings.length === 0;
    }
    if (warningsBlock) warningsBlock.hidden = value.warnings.length === 0;
    if (result) result.hidden = false;
  }
}

interface RouteOption {
  id: string;
  label: string;
  version: string;
  raceType: 'road-marathon' | 'trail-ultra';
  distanceMeters: number;
  distanceMethod: string;
  elevationGainMeters: number | null;
  elevationMethod: string | null;
  surface: string | null;
  technicality: string | null;
  geometryAccess: 'redistributable' | 'official-link' | 'unavailable';
  geometryUrl: string | null;
}

function initRouteCompare(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('[data-route-form]');
  const result = root.querySelector<HTMLElement>('[data-route-result]');
  const head = root.querySelector<HTMLTableSectionElement>('[data-route-head]');
  const body = root.querySelector<HTMLTableSectionElement>('[data-route-body]');
  if (!form || !result || !head || !body) return;
  const locale = (root.dataset.locale as Locale) ?? 'zh-CN';
  const strings = readStrings(root);
  let options: RouteOption[] = [];
  try {
    options = JSON.parse(root.dataset.routes ?? '[]') as RouteOption[];
  } catch {
    options = [];
  }
  const boxes = [...root.querySelectorAll<HTMLInputElement>('[data-route-option]')];
  const error = root.querySelector<HTMLElement>('[data-error="routes"]');

  const requested = new Set(
    (new URLSearchParams(location.search).get('routes') ?? '').split(',').filter(Boolean),
  );
  let checked = 0;
  for (const box of boxes) {
    box.checked = requested.has(box.value) && checked < 4;
    if (box.checked) checked += 1;
  }

  const syncSelection = () => {
    const selected = boxes.filter((box) => box.checked).length;
    for (const box of boxes) box.disabled = !box.checked && selected >= 4;
    result.hidden = true;
  };
  syncSelection();

  for (const box of boxes) {
    box.addEventListener('change', () => {
      setError(error, null);
      syncSelection();
    });
  }

  const fieldLabels: Record<ComparisonKey, string> = {
    distance: strings.routeDistance ?? 'Distance',
    elevation: strings.routeElevation ?? 'Elevation gain',
    surface: strings.routeSurface ?? 'Surface',
    technicality: strings.routeTechnicality ?? 'Technicality',
  };
  const geometryLabels: Record<string, string> = {
    redistributable: strings.routeGeometryRedistributable ?? 'Redistributable',
    'official-link': strings.routeGeometryOfficial ?? 'Official link',
    unavailable: strings.routeGeometryUnavailable ?? 'No public geometry',
  };
  const unknown = strings.routeUnknown ?? 'Unknown';

  const addMeta = (parent: HTMLElement, text: string | null | undefined) => {
    if (!text) return;
    const small = document.createElement('small');
    small.className = 'route-meta';
    small.textContent = text;
    parent.appendChild(small);
  };

  const render = (rows: ReturnType<typeof compareRoutes>['rows'], routes: RouteOption[]) => {
    head.textContent = '';
    body.textContent = '';
    const headRow = document.createElement('tr');
    const fieldHead = document.createElement('th');
    fieldHead.scope = 'col';
    fieldHead.textContent = strings.routeField ?? 'Field';
    headRow.appendChild(fieldHead);
    for (const route of routes) {
      const th = document.createElement('th');
      th.scope = 'col';
      const title = document.createElement('strong');
      title.textContent = route.label;
      th.appendChild(title);
      addMeta(
        th,
        `${strings.routeVersion ?? 'Version'}: ${route.version} · ${
          route.raceType === 'road-marathon'
            ? strings.routeTypeRoad ?? 'Road marathon'
            : strings.routeTypeTrail ?? 'Trail ultramarathon'
        }`,
      );
      headRow.appendChild(th);
    }
    head.appendChild(headRow);

    for (const row of rows) {
      const tr = document.createElement('tr');
      const label = document.createElement('th');
      label.scope = 'row';
      label.textContent = fieldLabels[row.key];
      tr.appendChild(label);
      row.values.forEach((value, index) => {
        const td = document.createElement('td');
        const route = routes[index];
        if (row.key === 'distance' && typeof value === 'number') {
          td.textContent = `${formatNumber(value / 1000, locale, 3)} km`;
          addMeta(td, route?.distanceMethod);
        } else if (row.key === 'elevation' && typeof value === 'number') {
          td.textContent = `${formatNumber(value, locale, 0)} m`;
          addMeta(td, route?.elevationMethod);
        } else if ((row.key === 'surface' || row.key === 'technicality') && typeof value === 'string') {
          td.textContent = value;
        } else {
          td.textContent = unknown;
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    }

    const geometryRow = document.createElement('tr');
    const geometryLabel = document.createElement('th');
    geometryLabel.scope = 'row';
    geometryLabel.textContent = strings.routeOfficialGeometry ?? 'Official track';
    geometryRow.appendChild(geometryLabel);
    for (const route of routes) {
      const td = document.createElement('td');
      const access = geometryLabels[route.geometryAccess] ?? geometryLabels.unavailable ?? unknown;
      if (route.geometryUrl) {
        const link = document.createElement('a');
        link.href = route.geometryUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = access;
        td.appendChild(link);
      } else {
        td.textContent = access;
      }
      geometryRow.appendChild(td);
    }
    body.appendChild(geometryRow);
    result.hidden = false;
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const chosen = boxes.filter((box) => box.checked).map((box) => box.value);
    if (chosen.length < 2 || chosen.length > 4) {
      setError(error, strings.routeErrorCount ?? 'Choose 2 to 4 published route versions.');
      result.hidden = true;
      return;
    }
    setError(error, null);
    const routes = chosen
      .map((id) => options.find((option) => option.id === id))
      .filter((option): option is RouteOption => Boolean(option));
    if (routes.length < 2) {
      setError(error, strings.routeErrorCount ?? 'Choose 2 to 4 published route versions.');
      result.hidden = true;
      return;
    }
    const comparable: ComparableRoute[] = routes.map((route) => ({
      routeId: route.id,
      distanceMeters: route.distanceMeters,
      elevationGainMeters: route.elevationGainMeters,
      surface: route.surface,
      technicality: route.technicality,
    }));
    const comparison = compareRoutes(comparable);
    render(comparison.rows, routes);
    updateUrl({ routes: chosen.join(',') });
  });
}

export function initCalculators() {
  const pace = document.querySelector<HTMLElement>('[data-tool="pace"]');
  if (pace) initPace(pace);
  const splits = document.querySelector<HTMLElement>('[data-tool="splits"]');
  if (splits) initSplits(splits);
  const runWalk = document.querySelector<HTMLElement>('[data-tool="run-walk"]');
  if (runWalk) initRunWalk(runWalk);
  const racePredict = document.querySelector<HTMLElement>('[data-tool="race-predict"]');
  if (racePredict) initRacePredict(racePredict);
  const track = document.querySelector<HTMLElement>('[data-tool="track-view"]');
  if (track) initTrackView(track);
  const convert = document.querySelector<HTMLElement>('[data-tool="track-convert"]');
  if (convert) initTrackTransform(convert);
  const simplify = document.querySelector<HTMLElement>('[data-tool="track-simplify"]');
  if (simplify) initTrackTransform(simplify);
  const routeCompare = document.querySelector<HTMLElement>('[data-tool="route-compare"]');
  if (routeCompare) initRouteCompare(routeCompare);
}
