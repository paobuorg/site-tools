import { parseTrackFile, TrackParseError, type TrackFormat } from '../lib/parse-track';
import { serializeTrack } from '../lib/serialize-track';
import { summarizeTrack } from '../lib/track';
import { simplifyTrack, TrackSimplifyError } from '../lib/simplify-track';

interface TransformRequest {
  id: number;
  operation: 'convert' | 'simplify';
  text: string;
  fileName: string;
  byteLength: number;
  format?: TrackFormat;
  toleranceMeters?: number;
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<TransformRequest>) => void) | null;
  postMessage(message: unknown): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const { id, operation, text, fileName, byteLength, format, toleranceMeters } = event.data;
  scope.postMessage({ id, type: 'progress', value: 0.1 });
  setTimeout(() => {
    try {
      const parsed = parseTrackFile(fileName, text, byteLength);
      scope.postMessage({ id, type: 'progress', value: 0.55 });
      if (operation === 'convert') {
        const targetFormat: TrackFormat = format === 'gpx' ? 'gpx' : 'geojson';
        const content = serializeTrack(parsed.segments, targetFormat);
        const summary = summarizeTrack(parsed);
        scope.postMessage({
          id,
          type: 'converted',
          content,
          format: targetFormat,
          sourceFormat: parsed.format,
          summary,
        });
        return;
      }
      if (operation === 'simplify') {
        const result = simplifyTrack(parsed.segments, toleranceMeters ?? 10);
        const content = serializeTrack(result.segments, parsed.format);
        scope.postMessage({
          id,
          type: 'simplified',
          content,
          format: parsed.format,
          toleranceMeters: toleranceMeters ?? 10,
          summary: summarizeTrack(parsed),
          result: {
            originalPointCount: result.originalPointCount,
            simplifiedPointCount: result.simplifiedPointCount,
            distanceBeforeMeters: result.distanceBeforeMeters,
            distanceAfterMeters: result.distanceAfterMeters,
            segmentStats: result.segmentStats,
          },
        });
        return;
      }
      scope.postMessage({ id, type: 'error', code: 'unsupported-operation' });
    } catch (error) {
      if (error instanceof TrackParseError) {
        scope.postMessage({ id, type: 'error', code: error.code, message: error.message });
      } else if (error instanceof TrackSimplifyError) {
        scope.postMessage({
          id,
          type: 'error',
          code: `simplify-${error.code}`,
          segmentIndex: error.segmentIndex,
          message: error.message,
        });
      } else {
        scope.postMessage({
          id,
          type: 'error',
          code: 'unknown',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }, 0);
};
