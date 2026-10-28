import { parseTrackFile, TrackParseError } from '../lib/parse-track';
import { analyzeElevation } from '../lib/elevation';

interface ElevationRequest {
  id: number;
  text: string;
  fileName: string;
  byteLength: number;
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<ElevationRequest>) => void) | null;
  postMessage(message: unknown): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const { id, text, fileName, byteLength } = event.data;
  try {
    const parsed = parseTrackFile(fileName, text, byteLength);
    const result = analyzeElevation(parsed);
    scope.postMessage({ id, type: 'result', result });
  } catch (error) {
    const code = error instanceof TrackParseError ? error.code : 'unknown';
    const message = error instanceof Error ? error.message : String(error);
    scope.postMessage({ id, type: 'error', code, message });
  }
};
