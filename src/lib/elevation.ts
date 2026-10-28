import { distanceMeters, type Coordinate } from '@paobu/core/geo';
import type { ParsedTrack } from './parse-track';

export interface ElevationPoint {
  distanceMeters: number;
  elevationMeters: number;
}

export type ElevationWarningCode = 'elevation-missing' | 'elevation-partial';

export interface ElevationAnalysis {
  distanceMeters: number;
  pointCount: number;
  segmentCount: number;
  gainMeters: number | null;
  lossMeters: number | null;
  minElevationMeters: number | null;
  maxElevationMeters: number | null;
  maxGradePercent: number | null;
  profile: ElevationPoint[];
  warnings: Array<{ code: ElevationWarningCode }>;
}

const MIN_GRADE_DISTANCE_METERS = 5;
const MAX_PROFILE_POINTS = 160;

function hasElevation(point: Coordinate): point is Coordinate & { elevation: number } {
  return typeof point.elevation === 'number' && Number.isFinite(point.elevation);
}

function downsample(points: ElevationPoint[]): ElevationPoint[] {
  if (points.length <= MAX_PROFILE_POINTS) return points;
  const lastIndex = points.length - 1;
  const sampled: ElevationPoint[] = [];
  for (let index = 0; index < MAX_PROFILE_POINTS; index += 1) {
    const sourceIndex = Math.round((index / (MAX_PROFILE_POINTS - 1)) * lastIndex);
    const point = points[sourceIndex];
    if (point) sampled.push(point);
  }
  return sampled;
}

export function analyzeElevation(track: ParsedTrack): ElevationAnalysis {
  const segments = track.segments.filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    throw new Error('Track has no points.');
  }

  let totalDistance = 0;
  let pointCount = 0;
  let missingElevation = 0;
  let hasAnyElevation = false;
  for (const segment of segments) {
    pointCount += segment.length;
    for (const point of segment) {
      if (hasElevation(point)) hasAnyElevation = true;
      else missingElevation += 1;
    }
    for (let index = 1; index < segment.length; index += 1) {
      const previous = segment[index - 1];
      const current = segment[index];
      if (!previous || !current) continue;
      totalDistance += distanceMeters(previous, current);
    }
  }

  if (!hasAnyElevation) {
    return {
      distanceMeters: Math.round(totalDistance),
      pointCount,
      segmentCount: segments.length,
      gainMeters: null,
      lossMeters: null,
      minElevationMeters: null,
      maxElevationMeters: null,
      maxGradePercent: null,
      profile: [],
      warnings: [{ code: 'elevation-missing' }],
    };
  }

  if (missingElevation > 0) {
    return {
      distanceMeters: Math.round(totalDistance),
      pointCount,
      segmentCount: segments.length,
      gainMeters: null,
      lossMeters: null,
      minElevationMeters: null,
      maxElevationMeters: null,
      maxGradePercent: null,
      profile: [],
      warnings: [{ code: 'elevation-partial' }],
    };
  }

  let gain = 0;
  let loss = 0;
  let minElevation = Number.POSITIVE_INFINITY;
  let maxElevation = Number.NEGATIVE_INFINITY;
  let maxGrade = 0;
  const rawProfile: ElevationPoint[] = [];
  let cumulative = 0;

  for (const segment of segments) {
    for (let index = 0; index < segment.length; index += 1) {
      const point = segment[index];
      if (!point || !hasElevation(point)) continue;
      if (index > 0) {
        const previous = segment[index - 1];
        if (previous) {
          const horizontal = distanceMeters(previous, point);
          cumulative += horizontal;
          if (hasElevation(previous) && horizontal >= MIN_GRADE_DISTANCE_METERS) {
            const difference = point.elevation - previous.elevation;
            const grade = (difference / horizontal) * 100;
            if (Math.abs(grade) > Math.abs(maxGrade)) maxGrade = grade;
          }
        }
      }
      const previous = segment[index - 1];
      if (index > 0 && previous && hasElevation(previous)) {
        const difference = point.elevation - previous.elevation;
        if (difference > 0) gain += difference;
        else loss += Math.abs(difference);
      }
      minElevation = Math.min(minElevation, point.elevation);
      maxElevation = Math.max(maxElevation, point.elevation);
      rawProfile.push({
        distanceMeters: Math.round(cumulative),
        elevationMeters: Number(point.elevation.toFixed(2)),
      });
    }
  }

  return {
    distanceMeters: Math.round(totalDistance),
    pointCount,
    segmentCount: segments.length,
    gainMeters: Math.round(gain),
    lossMeters: Math.round(loss),
    minElevationMeters: Number(minElevation.toFixed(1)),
    maxElevationMeters: Number(maxElevation.toFixed(1)),
    maxGradePercent: Number(maxGrade.toFixed(1)),
    profile: downsample(rawProfile),
    warnings: [],
  };
}
