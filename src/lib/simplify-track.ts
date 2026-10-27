import type { Coordinate } from '@paobu/core/geo';
import { segmentStats } from '@paobu/core/geo';

const EARTH_RADIUS_METERS = 6_371_008.8;
const DEG_TO_RAD = Math.PI / 180;
export const MAX_SIMPLIFY_TOLERANCE_METERS = 100;
export const MIN_SIMPLIFY_TOLERANCE_METERS = 1;
export const MAX_SEGMENT_SPAN_METERS = 500_000;

export type SimplifyErrorCode = 'tolerance' | 'latitude' | 'dateline' | 'range';

export class TrackSimplifyError extends Error {
  code: SimplifyErrorCode;
  segmentIndex: number;

  constructor(code: SimplifyErrorCode, segmentIndex: number, message?: string) {
    super(message ?? code);
    this.name = 'TrackSimplifyError';
    this.code = code;
    this.segmentIndex = segmentIndex;
  }
}

export interface SegmentSimplifyStats {
  index: number;
  originalPointCount: number;
  simplifiedPointCount: number;
  originalDistanceMeters: number;
  simplifiedDistanceMeters: number;
}

export interface TrackSimplifyResult {
  segments: Coordinate[][];
  originalPointCount: number;
  simplifiedPointCount: number;
  distanceBeforeMeters: number;
  distanceAfterMeters: number;
  segmentStats: SegmentSimplifyStats[];
}

interface ProjectedPoint {
  x: number;
  y: number;
}

function projectSegment(points: Coordinate[]): ProjectedPoint[] {
  const meanLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const lon0 = points[0]!.lon;
  const cosLat = Math.cos(meanLat * DEG_TO_RAD);
  return points.map((point) => ({
    x: EARTH_RADIUS_METERS * (point.lon - lon0) * DEG_TO_RAD * cosLat,
    y: EARTH_RADIUS_METERS * (point.lat - meanLat) * DEG_TO_RAD,
  }));
}

function distanceToSegmentSquared(point: ProjectedPoint, start: ProjectedPoint, end: ProjectedPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    const px = point.x - start.x;
    const py = point.y - start.y;
    return px * px + py * py;
  }
  let t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  const px = point.x - (start.x + t * dx);
  const py = point.y - (start.y + t * dy);
  return px * px + py * py;
}

function simplifyProjected(points: ProjectedPoint[], toleranceMeters: number): number[] {
  if (points.length <= 2) return points.map((_, index) => index);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const toleranceSquared = toleranceMeters * toleranceMeters;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let farthest = -1;
    let farthestDistance = toleranceSquared;
    for (let index = start + 1; index < end; index += 1) {
      const squared = distanceToSegmentSquared(points[index]!, points[start]!, points[end]!);
      if (squared > farthestDistance) {
        farthest = index;
        farthestDistance = squared;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([start, farthest], [farthest, end]);
    }
  }
  const indices: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    if (keep[index]) indices.push(index);
  }
  return indices;
}

function checkSegment(points: Coordinate[], segmentIndex: number): ProjectedPoint[] {
  for (const point of points) {
    if (Math.abs(point.lat) > 85) {
      throw new TrackSimplifyError(
        'latitude',
        segmentIndex,
        'Segments beyond 85 degrees latitude cannot be simplified in this version.',
      );
    }
  }
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (point.lon < minLon) minLon = point.lon;
    if (point.lon > maxLon) maxLon = point.lon;
  }
  if (maxLon - minLon > 180) {
    throw new TrackSimplifyError(
      'dateline',
      segmentIndex,
      'Segments crossing the antimeridian cannot be simplified in this version.',
    );
  }
  const projected = projectSegment(points);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of projected) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  if (Math.hypot(width, height) > MAX_SEGMENT_SPAN_METERS) {
    throw new TrackSimplifyError(
      'range',
      segmentIndex,
      'Segments spanning more than 500 km cannot be simplified in this version.',
    );
  }
  return projected;
}

export function simplifyTrack(segments: Coordinate[][], toleranceMeters: number): TrackSimplifyResult {
  if (
    !Number.isFinite(toleranceMeters) ||
    toleranceMeters < MIN_SIMPLIFY_TOLERANCE_METERS ||
    toleranceMeters > MAX_SIMPLIFY_TOLERANCE_METERS
  ) {
    throw new TrackSimplifyError('tolerance', 0, 'Tolerance must be between 1 and 100 metres.');
  }

  const simplifiedSegments: Coordinate[][] = [];
  const stats: SegmentSimplifyStats[] = [];
  let originalPointCount = 0;
  let simplifiedPointCount = 0;
  let distanceBeforeMeters = 0;
  let distanceAfterMeters = 0;

  segments.forEach((segment, index) => {
    if (segment.length === 0) return;
    const segmentNumber = index + 1;
    originalPointCount += segment.length;
    const projected = checkSegment(segment, segmentNumber);
    const keptIndices = simplifyProjected(projected, toleranceMeters);
    const simplified = keptIndices.map((pointIndex) => segment[pointIndex]!);
    simplifiedPointCount += simplified.length;
    simplifiedSegments.push(simplified);

    const before = segmentStats(segment).meters;
    const after = segmentStats(simplified).meters;
    distanceBeforeMeters += before;
    distanceAfterMeters += after;
    stats.push({
      index: segmentNumber,
      originalPointCount: segment.length,
      simplifiedPointCount: simplified.length,
      originalDistanceMeters: Math.round(before),
      simplifiedDistanceMeters: Math.round(after),
    });
  });

  if (simplifiedSegments.length === 0) {
    throw new TrackSimplifyError('range', 0, 'No non-empty segments were found.');
  }

  return {
    segments: simplifiedSegments,
    originalPointCount,
    simplifiedPointCount,
    distanceBeforeMeters: Math.round(distanceBeforeMeters),
    distanceAfterMeters: Math.round(distanceAfterMeters),
    segmentStats: stats,
  };
}
