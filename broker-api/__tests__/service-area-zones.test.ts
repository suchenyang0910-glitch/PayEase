import { describe, expect, it } from "vitest";
import {
  isInsideCambodia,
  parseZonePolygon,
  polygonContainsPoint,
  polygonOverlaps,
} from "../src/service-area-zones.js";

describe("service area zones", () => {
  const polygon = parseZonePolygon({
    type: "Polygon",
    coordinates: [
      [
        [104.9, 11.56],
        [104.94, 11.56],
        [104.94, 11.6],
        [104.9, 11.6],
        [104.9, 11.56],
      ],
    ],
  });

  it("treats inside and boundary points as matches", () => {
    expect(
      polygonContainsPoint(polygon, { longitude: 104.92, latitude: 11.58 }),
    ).toBe(true);
    expect(
      polygonContainsPoint(polygon, { longitude: 104.9, latitude: 11.58 }),
    ).toBe(true);
    expect(
      polygonContainsPoint(polygon, { longitude: 105.02, latitude: 11.58 }),
    ).toBe(false);
  });

  it("rejects malformed polygons and detects overlap", () => {
    expect(() =>
      parseZonePolygon({
        type: "Polygon",
        coordinates: [
          [
            [104.9, 11.56],
            [104.94, 11.6],
            [104.9, 11.56],
          ],
        ],
      }),
    ).toThrow(/at least four points/i);
    const overlapping = parseZonePolygon({
      type: "Polygon",
      coordinates: [
        [
          [104.93, 11.59],
          [104.97, 11.59],
          [104.97, 11.63],
          [104.93, 11.63],
          [104.93, 11.59],
        ],
      ],
    });
    const separate = parseZonePolygon({
      type: "Polygon",
      coordinates: [
        [
          [105.1, 11.8],
          [105.14, 11.8],
          [105.14, 11.84],
          [105.1, 11.84],
          [105.1, 11.8],
        ],
      ],
    });
    expect(polygonOverlaps(polygon, overlapping)).toBe(true);
    expect(polygonOverlaps(polygon, separate)).toBe(false);
  });

  it("uses the bundled Cambodia boundary for country checks", () => {
    expect(isInsideCambodia({ longitude: 104.9282, latitude: 11.5564 })).toBe(
      true,
    );
    expect(isInsideCambodia({ longitude: 100.5, latitude: 13.75 })).toBe(false);
  });
});
