import type { Coordinate } from '@paobu/core/geo';
import { isValidCoordinate } from '@paobu/core/geo';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

export const MAX_FILE_BYTES = 20_000_000;
export const MAX_POINTS = 200_000;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  processEntities: false,
  trimValues: true,
  allowBooleanAttributes: false,
});

export type TrackFormat = 'gpx' | 'geojson';

export interface ParsedTrack {
  format: TrackFormat;
  segments: Coordinate[][];
  fileName: string;
}

export type TrackParseErrorCode =
  | 'too-large'
  | 'unsafe-xml'
  | 'invalid-xml'
  | 'unsupported-format'
  | 'invalid-json'
  | 'no-points'
  | 'invalid-coordinate'
  | 'too-many-points'
  | 'empty-geometry';

export class TrackParseError extends Error {
  code: TrackParseErrorCode;

  constructor(code: TrackParseErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'TrackParseError';
    this.code = code;
  }
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function xmlRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pointFromXml(value: unknown, pointIndex: number): Coordinate {
  const node = xmlRecord(value);
  if (!node) {
    throw new TrackParseError('invalid-coordinate', `Point ${pointIndex} is not a coordinate element.`);
  }
  const lat = Number(node['@_lat']);
  const lon = Number(node['@_lon']);
  if (!isValidCoordinate(lon, lat)) {
    throw new TrackParseError('invalid-coordinate', `Point ${pointIndex} has an invalid latitude or longitude.`);
  }
  let elevation: number | null = null;
  const rawElevation = node.ele;
  if (typeof rawElevation === 'string' || typeof rawElevation === 'number') {
    const parsed = Number(rawElevation);
    if (Number.isFinite(parsed)) elevation = parsed;
  }
  return { lon, lat, elevation };
}

function parseGpx(text: string): Coordinate[][] {
  const validation = XMLValidator.validate(text);
  if (validation !== true) {
    throw new TrackParseError('invalid-xml', 'The GPX file is not well-formed XML.');
  }
  let root: Record<string, unknown>;
  try {
    root = xmlParser.parse(text) as Record<string, unknown>;
  } catch (error) {
    throw new TrackParseError('invalid-xml', (error as Error).message);
  }
  const gpx = xmlRecord(root.gpx);
  if (!gpx) {
    throw new TrackParseError('no-points', 'No GPX track or route points were found.');
  }

  const segments: Coordinate[][] = [];
  let pointIndex = 0;
  const collectPoints = (values: unknown[]): Coordinate[] => {
    const points: Coordinate[] = [];
    for (const value of values) {
      pointIndex += 1;
      if (pointIndex > MAX_POINTS) {
        throw new TrackParseError('too-many-points', `More than ${MAX_POINTS} points.`);
      }
      points.push(pointFromXml(value, pointIndex));
    }
    return points;
  };

  for (const trackValue of asArray(gpx.trk)) {
    const track = xmlRecord(trackValue);
    for (const segmentValue of asArray(track?.trkseg)) {
      const segment = xmlRecord(segmentValue);
      const points = collectPoints(asArray(segment?.trkpt));
      if (points.length > 0) segments.push(points);
    }
  }
  if (segments.length === 0) {
    for (const routeValue of asArray(gpx.rte)) {
      const route = xmlRecord(routeValue);
      const points = collectPoints(asArray(route?.rtept));
      if (points.length > 0) segments.push(points);
    }
  }

  if (segments.length === 0) {
    throw new TrackParseError('no-points', 'No GPX track or route points were found.');
  }
  return segments;
}

function lineFromCoordinates(value: unknown, pointCounter: { count: number }): Coordinate[] {
  if (!Array.isArray(value)) throw new TrackParseError('empty-geometry', 'A LineString has no coordinates array.');
  const points: Coordinate[] = [];
  for (const raw of value) {
    if (!Array.isArray(raw) || raw.length < 2) {
      throw new TrackParseError('invalid-coordinate', 'A coordinate is not a [longitude, latitude] pair.');
    }
    pointCounter.count += 1;
    if (pointCounter.count > MAX_POINTS) {
      throw new TrackParseError('too-many-points', `More than ${MAX_POINTS} points.`);
    }
    const lon = Number(raw[0]);
    const lat = Number(raw[1]);
    if (!isValidCoordinate(lon, lat)) {
      throw new TrackParseError('invalid-coordinate', 'A coordinate is outside valid longitude/latitude bounds.');
    }
    const rawElevation = raw.length > 2 ? Number(raw[2]) : null;
    points.push({
      lon,
      lat,
      elevation: rawElevation !== null && Number.isFinite(rawElevation) ? rawElevation : null,
    });
  }
  if (points.length < 1) throw new TrackParseError('empty-geometry', 'A LineString contains no coordinates.');
  return points;
}

function geometrySegments(value: unknown, segments: Coordinate[][], pointCounter: { count: number }): void {
  if (!value || typeof value !== 'object') {
    throw new TrackParseError('empty-geometry', 'The file contains an invalid geometry.');
  }
  const geometry = value as { type?: unknown; coordinates?: unknown; geometries?: unknown };
  const type = String(geometry.type ?? '');
  if (type === 'GeometryCollection') {
    if (!Array.isArray(geometry.geometries)) {
      throw new TrackParseError('empty-geometry', 'A GeometryCollection has no geometries.');
    }
    for (const child of geometry.geometries) geometrySegments(child, segments, pointCounter);
    return;
  }
  if (type === 'LineString') {
    segments.push(lineFromCoordinates(geometry.coordinates, pointCounter));
    return;
  }
  if (type === 'MultiLineString') {
    if (!Array.isArray(geometry.coordinates)) {
      throw new TrackParseError('empty-geometry', 'A MultiLineString has no coordinates.');
    }
    for (const line of geometry.coordinates) segments.push(lineFromCoordinates(line, pointCounter));
    return;
  }
  throw new TrackParseError('unsupported-format', `GeoJSON geometry type "${type}" is not supported.`);
}

function parseGeoJson(text: string): Coordinate[][] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new TrackParseError('invalid-json', (error as Error).message);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new TrackParseError('empty-geometry', 'The GeoJSON root is not an object.');
  }
  const root = parsed as { type?: unknown; features?: unknown };
  const segments: Coordinate[][] = [];
  const pointCounter = { count: 0 };
  if (root.type === 'FeatureCollection') {
    if (!Array.isArray(root.features)) throw new TrackParseError('empty-geometry', 'No GeoJSON features.');
    for (const feature of root.features) {
      if (!feature || typeof feature !== 'object') continue;
      const geometry = (feature as { geometry?: unknown }).geometry;
      if (geometry) geometrySegments(geometry, segments, pointCounter);
    }
  } else if (root.type === 'Feature') {
    const geometry = (root as { geometry?: unknown }).geometry;
    if (!geometry) throw new TrackParseError('empty-geometry', 'The GeoJSON feature has no geometry.');
    geometrySegments(geometry, segments, pointCounter);
  } else {
    geometrySegments(root, segments, pointCounter);
  }
  if (segments.length === 0) throw new TrackParseError('empty-geometry', 'No LineString geometry was found.');
  return segments;
}

export function parseTrackFile(fileName: string, text: string, byteLength: number): ParsedTrack {
  if (!Number.isFinite(byteLength) || byteLength <= 0) {
    throw new TrackParseError('no-points', 'The file is empty.');
  }
  if (byteLength > MAX_FILE_BYTES) {
    throw new TrackParseError('too-large', `Files larger than ${MAX_FILE_BYTES} bytes are rejected.`);
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw new TrackParseError('unsafe-xml', 'DTD and entity declarations are not allowed.');
  }
  const lowerName = fileName.toLowerCase();
  const trimmed = text.trim();
  const isGpx = lowerName.endsWith('.gpx') || /^<\?xml[^>]*\?>\s*<gpx\b/i.test(trimmed) || /^<gpx\b/i.test(trimmed);
  const isGeoJson = lowerName.endsWith('.geojson') || lowerName.endsWith('.json') || trimmed.startsWith('{');
  if (isGpx) {
    return { format: 'gpx', segments: parseGpx(text), fileName };
  }
  if (isGeoJson) {
    return { format: 'geojson', segments: parseGeoJson(text), fileName };
  }
  throw new TrackParseError('unsupported-format', 'Only GPX and GeoJSON files are supported.');
}
