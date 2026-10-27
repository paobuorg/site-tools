export type ComparisonKey = 'distance' | 'elevation' | 'surface' | 'technicality';

export interface ComparableRoute {
  routeId: string;
  distanceMeters: number | null;
  elevationGainMeters: number | null;
  surface: string | null;
  technicality: string | null;
}

export interface ComparisonRow {
  key: ComparisonKey;
  values: Array<number | string | null>;
}

export interface RouteComparison {
  routeCount: number;
  rows: ComparisonRow[];
  missingValues: Array<{ key: ComparisonKey; values: boolean[] }>;
}

function knownText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function compareRoutes(routes: ComparableRoute[]): RouteComparison {
  if (routes.length < 2 || routes.length > 4) throw new Error('routeCount');
  if (new Set(routes.map((route) => route.routeId)).size !== routes.length) {
    throw new Error('duplicateRoute');
  }
  const rows: ComparisonRow[] = [
    { key: 'distance', values: routes.map((route) => route.distanceMeters) },
    { key: 'elevation', values: routes.map((route) => route.elevationGainMeters) },
    { key: 'surface', values: routes.map((route) => knownText(route.surface)) },
    { key: 'technicality', values: routes.map((route) => knownText(route.technicality)) },
  ];
  return {
    routeCount: routes.length,
    rows,
    missingValues: rows.map((row) => ({
      key: row.key,
      values: row.values.map((value) => value === null),
    })),
  };
}
