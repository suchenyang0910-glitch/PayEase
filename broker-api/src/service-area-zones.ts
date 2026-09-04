type Coordinate = readonly [number, number];

export type PolygonGeoJson = Readonly<{
  type: "Polygon";
  coordinates: readonly [readonly Coordinate[]];
}>;

export type Point = Readonly<{
  latitude: number;
  longitude: number;
}>;

export type LocationAssessmentResult =
  "MATCH" | "OUT_OF_ZONE" | "OUT_OF_COUNTRY" | "LOW_ACCURACY" | "UNAVAILABLE";

export type ParsedZonePolygon = Readonly<{
  geoJson: PolygonGeoJson;
  ring: readonly Coordinate[];
  bbox: Readonly<{
    minLongitude: number;
    maxLongitude: number;
    minLatitude: number;
    maxLatitude: number;
  }>;
}>;

const CAMBODIA_BOUNDARY: ParsedZonePolygon = parseZonePolygon({
  type: "Polygon",
  coordinates: [
    [
      [102.339996, 13.53167],
      [102.640099, 14.151905],
      [103.113998, 14.225722],
      [104.236992, 14.416743],
      [104.822571, 14.686579],
      [105.199915, 14.273212],
      [106.043946, 13.881091],
      [106.496373, 14.570584],
      [107.382729, 14.202441],
      [107.614548, 13.535531],
      [107.491403, 12.337206],
      [105.810524, 11.567615],
      [106.24967, 10.961812],
      [105.199915, 10.88931],
      [104.334335, 10.486544],
      [103.49728, 10.632555],
      [103.09069, 11.153661],
      [102.584933, 12.186595],
      [102.339996, 13.53167],
    ],
  ],
});

export function parseZonePolygon(input: unknown): ParsedZonePolygon {
  if (!input || typeof input !== "object") {
    throw new Error("Polygon GeoJSON is required.");
  }
  const candidate = input as {
    type?: unknown;
    coordinates?: unknown;
  };
  if (candidate.type !== "Polygon") {
    throw new Error("Only GeoJSON Polygon is supported.");
  }
  if (
    !Array.isArray(candidate.coordinates) ||
    candidate.coordinates.length !== 1 ||
    !Array.isArray(candidate.coordinates[0])
  ) {
    throw new Error("Exactly one polygon ring is required.");
  }
  const ring = candidate.coordinates[0].map((point) => {
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      typeof point[0] !== "number" ||
      typeof point[1] !== "number"
    ) {
      throw new Error("Each polygon point must be [longitude, latitude].");
    }
    const longitude = Number(point[0]);
    const latitude = Number(point[1]);
    if (
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180 ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new Error("Polygon points must be valid longitude/latitude pairs.");
    }
    return [longitude, latitude] as const;
  });
  if (ring.length < 4) {
    throw new Error("Polygon ring must contain at least four points.");
  }
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    throw new Error("Polygon ring must be explicitly closed.");
  }
  const distinctPoints = new Set(
    ring
      .slice(0, -1)
      .map(([longitude, latitude]) => `${longitude},${latitude}`),
  );
  if (distinctPoints.size < 3) {
    throw new Error("Polygon must contain at least three distinct points.");
  }
  const bbox = ring.reduce(
    (current, [longitude, latitude]) => ({
      minLongitude: Math.min(current.minLongitude, longitude),
      maxLongitude: Math.max(current.maxLongitude, longitude),
      minLatitude: Math.min(current.minLatitude, latitude),
      maxLatitude: Math.max(current.maxLatitude, latitude),
    }),
    {
      minLongitude: Number.POSITIVE_INFINITY,
      maxLongitude: Number.NEGATIVE_INFINITY,
      minLatitude: Number.POSITIVE_INFINITY,
      maxLatitude: Number.NEGATIVE_INFINITY,
    },
  );
  return {
    geoJson: {
      type: "Polygon",
      coordinates: [ring],
    },
    ring,
    bbox,
  };
}

function pointOnSegment(
  point: Coordinate,
  start: Coordinate,
  end: Coordinate,
): boolean {
  const [px, py] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const cross = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1);
  if (Math.abs(cross) > 1e-9) return false;
  const dot = (px - x1) * (px - x2) + (py - y1) * (py - y2);
  return dot <= 1e-9;
}

export function polygonContainsPoint(
  polygon: ParsedZonePolygon,
  point: Point,
): boolean {
  const px = point.longitude;
  const py = point.latitude;
  if (
    px < polygon.bbox.minLongitude ||
    px > polygon.bbox.maxLongitude ||
    py < polygon.bbox.minLatitude ||
    py > polygon.bbox.maxLatitude
  ) {
    return false;
  }

  let inside = false;
  for (let index = 0; index < polygon.ring.length - 1; index += 1) {
    const start = polygon.ring[index]!;
    const end = polygon.ring[index + 1]!;
    if (pointOnSegment([px, py], start, end)) {
      return true;
    }
    const [x1, y1] = start;
    const [x2, y2] = end;
    const intersects =
      y1 > py !== y2 > py && px < ((x2 - x1) * (py - y1)) / (y2 - y1) + x1;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

export function polygonOverlaps(
  left: ParsedZonePolygon,
  right: ParsedZonePolygon,
): boolean {
  if (
    left.bbox.maxLongitude < right.bbox.minLongitude ||
    left.bbox.minLongitude > right.bbox.maxLongitude ||
    left.bbox.maxLatitude < right.bbox.minLatitude ||
    left.bbox.minLatitude > right.bbox.maxLatitude
  ) {
    return false;
  }
  return (
    left.ring
      .slice(0, -1)
      .some(([longitude, latitude]) =>
        polygonContainsPoint(right, { longitude, latitude }),
      ) ||
    right.ring
      .slice(0, -1)
      .some(([longitude, latitude]) =>
        polygonContainsPoint(left, { longitude, latitude }),
      )
  );
}

export function isInsideCambodia(point: Point): boolean {
  return polygonContainsPoint(CAMBODIA_BOUNDARY, point);
}
