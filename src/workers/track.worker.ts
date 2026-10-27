import { parseTrackFile, TrackParseError } from '../lib/parse-track';
import { summarizeTrack } from '../lib/track';

interface ParseRequest {
  id: number;
  text: string;
  fileName: string;
  byteLength: number;
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<ParseRequest>) => void) | null;
  postMessage(message: unknown): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const { id, text, fileName, byteLength } = event.data;
  scope.postMessage({ id, type: 'progress', value: 0.1 });
  setTimeout(() => {
    try {
      const parsed = parseTrackFile(fileName, text, byteLength);
      scope.postMessage({ id, type: 'progress', value: 0.6 });
      const summary = summarizeTrack(parsed);
      scope.postMessage({ id, type: 'result', result: summary });
    } catch (error) {
      const code = error instanceof TrackParseError ? error.code : 'unknown';
      const message = error instanceof Error ? error.message : String(error);
      scope.postMessage({ id, type: 'error', code, message });
    }
  }, 0);
};
