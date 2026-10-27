import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MAX_FILE_BYTES, parseTrackFile, TrackParseError } from '../src/lib/parse-track';
import { summarizeTrack } from '../src/lib/track';

const casesDir = path.resolve(import.meta.dirname, '../../running-tools/data/cases');

function readCase<T>(caseId: string): T {
  return JSON.parse(fs.readFileSync(path.join(casesDir, `${caseId}.json`), 'utf8')) as T;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function geojson(coordinates: number[][]): string {
  return JSON.stringify({ type: 'LineString', coordinates });
}

function expectCode(action: () => void, code: string) {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof TrackParseError, `expected TrackParseError, got ${String(error)}`);
    assert.equal(error.code, code);
    return true;
  });
}

interface TrackCase {
  input: { format: 'geojson'; coordinates: number[][] };
  expected: {
    distanceMeters: number;
    pointCount: number;
    start: { longitude: number; latitude: number };
    end: { longitude: number; latitude: number };
    elevationGainMeters: number | null;
  };
}

test('published track cases match the implementation', () => {
  for (const caseId of ['case-track-view-equator', 'case-track-view-elevation']) {
    const item = readCase<TrackCase>(caseId);
    const text = geojson(item.input.coordinates);
    const parsed = parseTrackFile(`${caseId}.geojson`, text, byteLength(text));
    const summary = summarizeTrack(parsed);
    assert.equal(summary.distanceMeters, item.expected.distanceMeters, `${caseId} distance`);
    assert.equal(summary.pointCount, item.expected.pointCount, `${caseId} points`);
    assert.equal(summary.start.lon, item.expected.start.longitude, `${caseId} start lon`);
    assert.equal(summary.start.lat, item.expected.start.latitude, `${caseId} start lat`);
    assert.equal(summary.end.lon, item.expected.end.longitude, `${caseId} end lon`);
    assert.equal(summary.end.lat, item.expected.end.latitude, `${caseId} end lat`);
    assert.equal(summary.elevationGainMeters, item.expected.elevationGainMeters, `${caseId} gain`);
  }
});

test('GeoJSON coordinate order stays longitude, latitude', () => {
  const text = geojson([
    [6.8694, 45.9237],
    [6.87, 45.924],
  ]);
  const parsed = parseTrackFile('chamonix.geojson', text, byteLength(text));
  const summary = summarizeTrack(parsed);
  assert.equal(summary.start.lon, 6.8694);
  assert.equal(summary.start.lat, 45.9237);
  assert.equal(parsed.segments.length, 1);
});

test('multiple segments are summed without joining their endpoints', () => {
  const text = JSON.stringify({
    type: 'MultiLineString',
    coordinates: [
      [
        [0, 0],
        [0.01, 0],
      ],
      [
        [0, 1],
        [0.01, 1],
      ],
    ],
  });
  const summary = summarizeTrack(parseTrackFile('two-lines.geojson', text, byteLength(text)));
  assert.equal(summary.pointCount, 4);
  assert.equal(summary.segmentCount, 2);
  assert.equal(summary.distanceMeters, 2226);
  assert.equal(summary.start.lat, 0);
  assert.equal(summary.end.lat, 1);
  assert.equal(summary.end.lon, 0.01);
  assert.deepEqual(summary.warnings, [
    { code: 'elevation-missing' },
    { code: 'multiple-segments', count: 2 },
  ]);
});

test('GPX track segments and elevation are read in order', () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <trkseg>
      <trkpt lat="0" lon="0"><ele>5</ele></trkpt>
      <trkpt lat="0" lon="0.01"><ele>10</ele></trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="0" lon="1"><ele>10</ele></trkpt>
      <trkpt lat="0" lon="1.01"><ele>5</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;
  const summary = summarizeTrack(parseTrackFile('two-segments.gpx', text, byteLength(text)));
  assert.equal(summary.distanceMeters, 2226);
  assert.equal(summary.pointCount, 4);
  assert.equal(summary.segmentCount, 2);
  assert.equal(summary.elevationGainMeters, 5);
  assert.deepEqual(summary.warnings, [{ code: 'multiple-segments', count: 2 }]);
});

test('GPX routes and self-closing points are supported', () => {
  const text = `<gpx version="1.1"><rte><rtept lat="0" lon="0"/><rtept lat="0" lon="0.01"/></rte></gpx>`;
  const summary = summarizeTrack(parseTrackFile('route.gpx', text, byteLength(text)));
  assert.equal(summary.pointCount, 2);
  assert.equal(summary.distanceMeters, 1113);
  assert.equal(summary.elevationGainMeters, null);
  assert.deepEqual(summary.warnings, [{ code: 'elevation-missing' }]);
});

test('partial elevation stays unknown instead of undercounting', () => {
  const text = geojson([
    [0, 0, 10],
    [0, 0.01],
    [0, 0.02, 20],
  ]);
  const summary = summarizeTrack(parseTrackFile('partial.geojson', text, byteLength(text)));
  assert.equal(summary.elevationGainMeters, null);
  assert.deepEqual(summary.warnings, [{ code: 'elevation-partial' }]);
});

test('consecutive points more than 10 km apart are flagged', () => {
  const text = geojson([
    [0, 0],
    [0, 1],
  ]);
  const summary = summarizeTrack(parseTrackFile('jump.geojson', text, byteLength(text)));
  assert.equal(summary.suspiciousJumps, 1);
  assert.deepEqual(summary.warnings, [
    { code: 'elevation-missing' },
    { code: 'suspicious-jumps', count: 1 },
  ]);
});

test('unsafe, malformed and unsupported files are rejected with a code', () => {
  const unsafe = `<!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///etc/passwd">]><gpx>&x;</gpx>`;
  expectCode(() => parseTrackFile('unsafe.gpx', unsafe, byteLength(unsafe)), 'unsafe-xml');

  const malformed = `<gpx><trk></gpx>`;
  expectCode(() => parseTrackFile('bad.gpx', malformed, byteLength(malformed)), 'invalid-xml');

  const invalidJson = `{"type": "LineString", `;
  expectCode(() => parseTrackFile('bad.geojson', invalidJson, byteLength(invalidJson)), 'invalid-json');

  const point = JSON.stringify({ type: 'Point', coordinates: [0, 0] });
  expectCode(() => parseTrackFile('point.geojson', point, byteLength(point)), 'unsupported-format');

  const emptyLine = JSON.stringify({ type: 'LineString', coordinates: [] });
  expectCode(() => parseTrackFile('empty.geojson', emptyLine, byteLength(emptyLine)), 'empty-geometry');

  const invalidCoordinate = JSON.stringify({ type: 'LineString', coordinates: [[0, 91]] });
  expectCode(
    () => parseTrackFile('invalid.geojson', invalidCoordinate, byteLength(invalidCoordinate)),
    'invalid-coordinate',
  );

  const noPoints = `<gpx version="1.1"></gpx>`;
  expectCode(() => parseTrackFile('empty.gpx', noPoints, byteLength(noPoints)), 'no-points');

  const unknown = `<kml></kml>`;
  expectCode(() => parseTrackFile('track.kml', unknown, byteLength(unknown)), 'unsupported-format');

  const empty = '';
  expectCode(() => parseTrackFile('empty.gpx', empty, 0), 'no-points');
  expectCode(() => parseTrackFile('huge.gpx', '<gpx/>', MAX_FILE_BYTES + 1), 'too-large');
});
