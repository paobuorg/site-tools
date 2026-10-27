import type { Coordinate } from '@paobu/core/geo';
import { segmentStats } from '@paobu/core/geo';
import type { ParsedTrack } from './parse-track';

export type TrackWarningCode =
  | 'elevation-missing'
  | 'elevation-partial'
  | 'suspicious-jumps'
  | 'multiple-segments';

export interface TrackWarning {
  code: TrackWarningCode;
  count?: number;
}

export interface TrackSummary {
  format: ParsedTrack['format'];
  fileName: string;
  distanceMeters: number;
  pointCount: number;
  segmentCount: number;
  start: { lon: number; lat: number; elevation: number | null };
  end: { lon: number; lat: number; elevation: number | null };
  elevationGainMeters: number | null;
  suspiciousJumps: number;
  warnings: TrackWarning[];
}

function elevationGain(segments: Coordinate[][]): { gain: number | null; warning: TrackWarningCode | null } {
  let measured = 0;
  let missing = 0;
  let gain = 0;
  for (const segment of segments) {
    for (let index = 0; index < segment.length; index += 1) {
      const point = segment[index]!;
      measured += 1;
      if (point.elevation === null || point.elevation === undefined) {
        missing += 1;
        continue;
      }
      const previous = segment[index - 1];
      if (index > 0 && previous && previous.elevation !== null && previous.elevation !== undefined) {
        const difference = point.elevation - previous.elevation;
        if (difference > 0) gain += difference;
      }
    }
  }
  if (measured === 0 || missing === measured) return { gain: null, warning: 'elevation-missing' };
  if (missing > 0) return { gain: null, warning: 'elevation-partial' };
  return { gain: Math.round(gain), warning: null };
}

export function summarizeTrack(track: ParsedTrack): TrackSummary {
  const nonEmpty = track.segments.filter((segment) => segment.length > 0);
  if (nonEmpty.length === 0) {
    throw new Error('Track has no points.');
  }
  let distanceMeters = 0;
  let pointCount = 0;
  let suspiciousJumps = 0;
  for (const segment of nonEmpty) {
    const stats = segmentStats(segment);
    distanceMeters += stats.meters;
    pointCount += stats.points;
    suspiciousJumps += stats.suspiciousJumps;
  }
  const first = nonEmpty[0]![0]!;
  const lastSegment = nonEmpty[nonEmpty.length - 1]!;
  const last = lastSegment[lastSegment.length - 1]!;
  const elevation = elevationGain(nonEmpty);
  const warnings: TrackWarning[] = [];
  if (elevation.warning) warnings.push({ code: elevation.warning });
  if (suspiciousJumps > 0) warnings.push({ code: 'suspicious-jumps', count: suspiciousJumps });
  if (nonEmpty.length > 1) warnings.push({ code: 'multiple-segments', count: nonEmpty.length });

  return {
    format: track.format,
    fileName: track.fileName,
    distanceMeters: Math.round(distanceMeters),
    pointCount,
    segmentCount: nonEmpty.length,
    start: { lon: first.lon, lat: first.lat, elevation: first.elevation ?? null },
    end: { lon: last.lon, lat: last.lat, elevation: last.elevation ?? null },
    elevationGainMeters: elevation.gain,
    suspiciousJumps,
    warnings,
  };
}
