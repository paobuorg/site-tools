import type { Coordinate } from '@paobu/core/geo';
import type { TrackFormat } from './parse-track';

function position(point: Coordinate): number[] {
  const values = [point.lon, point.lat];
  if (point.elevation !== null && point.elevation !== undefined) values.push(point.elevation);
  return values;
}

function serializeGeoJson(segments: Coordinate[][]): string {
  const features = segments
    .filter((segment) => segment.length > 0)
    .map((segment) => ({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: segment.map(position),
      },
    }));
  return `${JSON.stringify({ type: 'FeatureCollection', features }, null, 2)}\n`;
}

function serializeGpx(segments: Coordinate[][]): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="RunMap track tools" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <trk>',
  ];
  for (const segment of segments) {
    if (segment.length === 0) continue;
    lines.push('    <trkseg>');
    for (const point of segment) {
      const elevation =
        point.elevation !== null && point.elevation !== undefined
          ? `<ele>${point.elevation}</ele>`
          : '';
      lines.push(`      <trkpt lat="${point.lat}" lon="${point.lon}">${elevation}</trkpt>`);
    }
    lines.push('    </trkseg>');
  }
  lines.push('  </trk>', '</gpx>', '');
  return lines.join('\n');
}

export function serializeTrack(segments: Coordinate[][], format: TrackFormat): string {
  return format === 'gpx' ? serializeGpx(segments) : serializeGeoJson(segments);
}

export function trackOutputFileName(format: TrackFormat, suffix: string): string {
  return `track-${suffix}.${format === 'gpx' ? 'gpx' : 'geojson'}`;
}

export function trackMimeType(format: TrackFormat): string {
  return format === 'gpx' ? 'application/gpx+xml' : 'application/geo+json';
}
