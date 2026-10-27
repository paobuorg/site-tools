import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Coordinate } from '@paobu/core/geo';
import { parseTrackFile } from '../src/lib/parse-track';
import { serializeTrack, trackOutputFileName } from '../src/lib/serialize-track';
import { simplifyTrack, TrackSimplifyError } from '../src/lib/simplify-track';
import { compareRoutes } from '../src/lib/route-compare';

const toolsRoot = process.env.TOOLS_CONTENT_DIR
  ? path.resolve(process.env.TOOLS_CONTENT_DIR)
  : process.env.PAOBU_REPOS_DIR
    ? path.join(process.env.PAOBU_REPOS_DIR, 'running-tools')
    : path.resolve(import.meta.dirname, '../../running-tools');

const track: Coordinate[][] = [
  [
    { lon: 0, lat: 0, elevation: 10 },
    { lon: 0.001, lat: 0, elevation: null },
    { lon: 0.002, lat: 0, elevation: 15 },
  ],
];

test('GeoJSON conversion round-trips coordinates and known elevation', () => {
  const text = serializeTrack(track, 'geojson');
  assert.ok(text.includes('"FeatureCollection"'));
  assert.ok(text.includes('"LineString"'));
  assert.ok(!/time|metadata|creator/i.test(text));
  const parsed = parseTrackFile('converted.geojson', text, new TextEncoder().encode(text).length);
  assert.equal(parsed.format, 'geojson');
  assert.equal(parsed.segments.length, 1);
  assert.deepEqual(parsed.segments[0], track[0]);
});

test('GPX conversion round-trips coordinates, segments and elevation', () => {
  const text = serializeTrack(track, 'gpx');
  assert.ok(text.includes('<trkseg>'));
  assert.equal((text.match(/<ele>/g) ?? []).length, 2);
  assert.ok(!/metadata|<time>|name=/i.test(text));
  const parsed = parseTrackFile('converted.gpx', text, new TextEncoder().encode(text).length);
  assert.equal(parsed.format, 'gpx');
  assert.equal(parsed.segments.length, 1);
  assert.deepEqual(parsed.segments[0], track[0]);
});

test('conversion keeps separate segments separate', () => {
  const segments: Coordinate[][] = [
    [
      { lon: 0, lat: 0, elevation: null },
      { lon: 0.001, lat: 0, elevation: null },
    ],
    [
      { lon: 1, lat: 1, elevation: 5 },
      { lon: 1.001, lat: 1, elevation: 6 },
    ],
  ];
  const geojson = parseTrackFile('two.geojson', serializeTrack(segments, 'geojson'), 100);
  const gpx = parseTrackFile('two.gpx', serializeTrack(segments, 'gpx'), 100);
  assert.equal(geojson.segments.length, 2);
  assert.equal(gpx.segments.length, 2);
});

test('output file names are sanitized and carry the requested extension', () => {
  assert.equal(trackOutputFileName('geojson', 'converted'), 'track-converted.geojson');
  assert.equal(trackOutputFileName('gpx', 'simplified'), 'track-simplified.gpx');
});

test('simplification removes collinear points and keeps endpoints', () => {
  const segments: Coordinate[][] = [
    [
      { lon: 0, lat: 0, elevation: null },
      { lon: 0.001, lat: 0, elevation: null },
      { lon: 0.002, lat: 0, elevation: null },
    ],
  ];
  const result = simplifyTrack(segments, 10);
  assert.equal(result.originalPointCount, 3);
  assert.equal(result.simplifiedPointCount, 2);
  assert.deepEqual(result.segments[0], [segments[0]![0], segments[0]![2]]);
  assert.equal(result.segmentStats[0]!.originalPointCount, 3);
  assert.equal(result.segmentStats[0]!.simplifiedPointCount, 2);
});

test('projected tolerance decides whether a small deviation survives', () => {
  const segments: Coordinate[][] = [
    [
      { lon: 0, lat: 0, elevation: null },
      { lon: 0.001, lat: 0.00005, elevation: null },
      { lon: 0.002, lat: 0, elevation: null },
    ],
  ];
  const loose = simplifyTrack(segments, 10);
  const tight = simplifyTrack(segments, 1);
  assert.equal(loose.simplifiedPointCount, 2);
  assert.equal(tight.simplifiedPointCount, 3);
});

test('each segment is simplified independently without joining endpoints', () => {
  const segments: Coordinate[][] = [
    [
      { lon: 0, lat: 0, elevation: null },
      { lon: 0.001, lat: 0, elevation: null },
      { lon: 0.002, lat: 0, elevation: null },
    ],
    [
      { lon: 1, lat: 1, elevation: null },
      { lon: 1.001, lat: 1, elevation: null },
      { lon: 1.002, lat: 1, elevation: null },
    ],
  ];
  const result = simplifyTrack(segments, 10);
  assert.equal(result.segments.length, 2);
  assert.equal(result.simplifiedPointCount, 4);
  assert.equal(result.segmentStats.length, 2);
  assert.deepEqual(
    result.segmentStats.map((item) => [item.originalPointCount, item.simplifiedPointCount]),
    [
      [3, 2],
      [3, 2],
    ],
  );
});

test('simplification refuses unsupported tolerance, latitude, dateline and span', () => {
  const line: Coordinate[][] = [
    [
      { lon: 0, lat: 0, elevation: null },
      { lon: 0.001, lat: 0, elevation: null },
    ],
  ];
  const capture = (fn: () => unknown): string => {
    try {
      fn();
    } catch (error) {
      assert.ok(error instanceof TrackSimplifyError);
      return error.code;
    }
    return 'none';
  };
  assert.equal(capture(() => simplifyTrack(line, 0.5)), 'tolerance');
  assert.equal(capture(() => simplifyTrack(line, 101)), 'tolerance');
  assert.equal(
    capture(() =>
      simplifyTrack(
        [
          [
            { lon: 0, lat: 86, elevation: null },
            { lon: 0.001, lat: 86, elevation: null },
          ],
        ],
        10,
      ),
    ),
    'latitude',
  );
  assert.equal(
    capture(() =>
      simplifyTrack(
        [
          [
            { lon: -179, lat: 0, elevation: null },
            { lon: 179, lat: 0, elevation: null },
          ],
        ],
        10,
      ),
    ),
    'dateline',
  );
  assert.equal(
    capture(() =>
      simplifyTrack(
        [
          [
            { lon: 0, lat: 0, elevation: null },
            { lon: 5, lat: 0, elevation: null },
          ],
        ],
        10,
      ),
    ),
    'range',
  );
});

test('published track conversion and simplification cases match', () => {
  const casesDir = path.join(toolsRoot, 'data/cases');
  const convertCase = JSON.parse(
    fs.readFileSync(path.join(casesDir, 'case-track-convert-elevation.json'), 'utf8'),
  ) as {
    input: { coordinates: number[][] };
    expected: { segmentCount: number; pointCount: number; elevationPointCount: number };
  };
  const segment = convertCase.input.coordinates.map(([lon, lat, elevation]) => ({
    lon: lon!,
    lat: lat!,
    elevation: elevation ?? null,
  }));
  const summary = parseTrackFile('case.geojson', serializeTrack([segment], 'geojson'), 100);
  assert.equal(summary.segments.length, convertCase.expected.segmentCount);
  assert.equal(summary.segments[0]!.length, convertCase.expected.pointCount);
  assert.equal(
    summary.segments[0]!.filter((point) => point.elevation !== null).length,
    convertCase.expected.elevationPointCount,
  );

  const simplifyCase = JSON.parse(
    fs.readFileSync(path.join(casesDir, 'case-track-simplify-offset.json'), 'utf8'),
  ) as {
    input: { toleranceMeters: number; coordinates: number[][] };
    expected: { originalPointCount: number; simplifiedPointCount: number; segmentCount: number };
  };
  const simplified = simplifyTrack(
    [
      simplifyCase.input.coordinates.map(([lon, lat]) => ({
        lon: lon!,
        lat: lat!,
        elevation: null,
      })),
    ],
    simplifyCase.input.toleranceMeters,
  );
  assert.equal(simplified.originalPointCount, simplifyCase.expected.originalPointCount);
  assert.equal(simplified.simplifiedPointCount, simplifyCase.expected.simplifiedPointCount);
  assert.equal(simplified.segments.length, simplifyCase.expected.segmentCount);
});

test('route comparison keeps missing values unknown and produces no ranking', () => {
  const casesDir = path.join(toolsRoot, 'data/cases');
  const item = JSON.parse(
    fs.readFileSync(path.join(casesDir, 'case-route-compare-missing.json'), 'utf8'),
  ) as {
    input: {
      routes: Array<{
        routeId: string;
        distanceMeters: number | null;
        elevationGainMeters: number | null;
        surface: string | null;
        technicality: string | null;
      }>;
    };
    expected: {
      routeCount: number;
      rows: Array<{ key: string; values: Array<number | string | null> }>;
      rankingProduced: boolean;
    };
  };
  const result = compareRoutes(item.input.routes);
  assert.equal(result.routeCount, item.expected.routeCount);
  assert.deepEqual(result.rows, item.expected.rows);
  assert.equal('ranking' in result, false);
  assert.equal(item.expected.rankingProduced, false);
  assert.equal(result.rows.find((row) => row.key === 'elevation')!.values[1], null);
});

test('route comparison requires two to four distinct routes', () => {
  const base = {
    distanceMeters: 42195,
    elevationGainMeters: 300,
    surface: 'road',
    technicality: null,
  };
  assert.throws(() => compareRoutes([]), /routeCount/);
  assert.throws(() => compareRoutes([{ ...base, routeId: 'only' }]), /routeCount/);
  assert.throws(
    () =>
      compareRoutes([
        { ...base, routeId: 'a' },
        { ...base, routeId: 'b' },
        { ...base, routeId: 'c' },
        { ...base, routeId: 'd' },
        { ...base, routeId: 'e' },
      ]),
    /routeCount/,
  );
  assert.throws(
    () =>
      compareRoutes([
        { ...base, routeId: 'a' },
        { ...base, routeId: 'a' },
      ]),
    /duplicateRoute/,
  );
});
