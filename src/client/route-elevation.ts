import type { ElevationAnalysis } from '../lib/elevation';
import { MAX_FILE_BYTES } from '../lib/parse-track';

interface ElevationWorkerMessage {
  id: number;
  type: 'result' | 'error';
  result?: ElevationAnalysis;
  code?: string;
  message?: string;
}

export function initRouteElevation(root: HTMLElement): void {
  const input = root.querySelector<HTMLInputElement>('[data-elevation-file]');
  const runButton = root.querySelector<HTMLButtonElement>('[data-elevation-run]');
  const cancelButton = root.querySelector<HTMLButtonElement>('[data-elevation-cancel]');
  const status = root.querySelector<HTMLElement>('[data-elevation-status]');
  const errorBox = root.querySelector<HTMLElement>('[data-elevation-error]');
  const errorText = root.querySelector<HTMLElement>('[data-elevation-error-text]');
  const result = root.querySelector<HTMLElement>('[data-elevation-result]');
  const distance = root.querySelector<HTMLElement>('[data-elevation-distance]');
  const gain = root.querySelector<HTMLElement>('[data-elevation-gain]');
  const loss = root.querySelector<HTMLElement>('[data-elevation-loss]');
  const min = root.querySelector<HTMLElement>('[data-elevation-min]');
  const max = root.querySelector<HTMLElement>('[data-elevation-max]');
  const grade = root.querySelector<HTMLElement>('[data-elevation-grade]');
  const chart = root.querySelector<SVGSVGElement>('[data-elevation-chart]');
  const line = root.querySelector<SVGPolylineElement>('[data-elevation-line]');
  const warning = root.querySelector<HTMLElement>('[data-elevation-warning]');
  if (!input || !runButton || !result) return;

  const locale = root.dataset.locale ?? 'zh-CN';
  const maxFileBytes = Number(root.dataset.maxFileBytes ?? String(MAX_FILE_BYTES));
  const strings = {
    ready: root.dataset.statusReady ?? 'Choose a track file.',
    processing: root.dataset.statusProcessing ?? 'Reading the file locally…',
    done: root.dataset.statusDone ?? 'Done.',
    cancelled: root.dataset.statusCancelled ?? 'Cancelled.',
    genericError: root.dataset.errorGeneric ?? 'The file could not be processed.',
    tooLarge: root.dataset.errorTooLarge ?? 'The file is too large.',
    missing: root.dataset.warningMissing ?? 'No elevation values are present; gain, loss and profile are unknown.',
    partial: root.dataset.warningPartial ?? 'Some points lack elevation; gain, loss and profile are unknown.',
  };
  let worker: Worker | null = null;
  let jobId = 0;

  const setStatus = (message: string) => {
    if (status) status.textContent = message;
  };
  const setError = (message: string | null) => {
    if (errorText) errorText.textContent = message ?? '';
    if (errorBox) errorBox.hidden = !message;
  };
  const stopWorker = () => {
    worker?.terminate();
    worker = null;
    if (cancelButton) cancelButton.hidden = true;
    runButton.disabled = false;
  };
  const formatNumber = (value: number, decimals = 0) =>
    new Intl.NumberFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    }).format(value);
  const showResult = (analysis: ElevationAnalysis) => {
    if (distance) distance.textContent = `${formatNumber(analysis.distanceMeters)} m`;
    if (gain) gain.textContent = analysis.gainMeters === null ? '—' : `${formatNumber(analysis.gainMeters)} m`;
    if (loss) loss.textContent = analysis.lossMeters === null ? '—' : `${formatNumber(analysis.lossMeters)} m`;
    if (min) min.textContent = analysis.minElevationMeters === null ? '—' : `${formatNumber(analysis.minElevationMeters, 1)} m`;
    if (max) max.textContent = analysis.maxElevationMeters === null ? '—' : `${formatNumber(analysis.maxElevationMeters, 1)} m`;
    if (grade) grade.textContent = analysis.maxGradePercent === null ? '—' : `${formatNumber(analysis.maxGradePercent, 1)}%`;
    if (warning) {
      const code = analysis.warnings[0]?.code;
      warning.textContent = code === 'elevation-missing' ? strings.missing : code === 'elevation-partial' ? strings.partial : '';
      warning.hidden = !code;
    }
    if (chart && line) {
      if (analysis.profile.length < 2 || analysis.minElevationMeters === null || analysis.maxElevationMeters === null) {
        chart.toggleAttribute('hidden', true);
        line.setAttribute('points', '');
      } else {
        chart.toggleAttribute('hidden', false);
        const width = 600;
        const height = 180;
        const pad = 10;
        const span = Math.max(1, analysis.maxElevationMeters - analysis.minElevationMeters);
        const totalDistance = Math.max(1, analysis.distanceMeters);
        line.setAttribute(
          'points',
          analysis.profile
            .map((point) => {
              const x = pad + (point.distanceMeters / totalDistance) * (width - pad * 2);
              const y = height - pad - ((point.elevationMeters - analysis.minElevationMeters!) / span) * (height - pad * 2);
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' '),
        );
      }
    }
    result.hidden = false;
  };

  const analyze = async () => {
    const file = input.files?.[0];
    if (!file) {
      setError(strings.ready);
      return;
    }
    if (file.size > maxFileBytes) {
      setError(strings.tooLarge);
      return;
    }
    setError(null);
    result.hidden = true;
    runButton.disabled = true;
    if (cancelButton) cancelButton.hidden = false;
    setStatus(strings.processing);
    try {
      const text = await file.text();
      stopWorker();
      runButton.disabled = true;
      if (cancelButton) cancelButton.hidden = false;
      worker = new Worker(new URL('../workers/elevation.worker.ts', import.meta.url), { type: 'module' });
      const currentJob = ++jobId;
      worker.onmessage = (event: MessageEvent<ElevationWorkerMessage>) => {
        if (event.data.id !== currentJob) return;
        stopWorker();
        if (event.data.type === 'result' && event.data.result) {
          showResult(event.data.result);
          setStatus(strings.done);
        } else {
          setError(event.data.message ?? strings.genericError);
          setStatus(strings.genericError);
        }
      };
      worker.onerror = () => {
        stopWorker();
        setError(strings.genericError);
        setStatus(strings.genericError);
      };
      worker.postMessage({ id: currentJob, text, fileName: file.name, byteLength: file.size });
    } catch {
      stopWorker();
      setError(strings.genericError);
      setStatus(strings.genericError);
    }
  };

  runButton.addEventListener('click', () => void analyze());
  cancelButton?.addEventListener('click', () => {
    stopWorker();
    setStatus(strings.cancelled);
  });
  input.addEventListener('change', () => {
    result.hidden = true;
    setError(null);
    setStatus(strings.ready);
  });
}
