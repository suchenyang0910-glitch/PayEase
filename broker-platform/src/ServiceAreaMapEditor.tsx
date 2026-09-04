import { useEffect, useMemo, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

type PolygonGeoJson = Readonly<{
  type: "Polygon";
  coordinates: number[][][];
}>;

type ZonePreview = Readonly<{
  key: string;
  zoneRef: string;
  version: number;
  displayName: string;
  status: "DRAFT" | "PENDING_REVIEW" | "ACTIVE" | "RETIRED";
  polygonGeoJson: PolygonGeoJson;
}>;

const blankMapStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#e2e8f0" },
    },
  ],
};

const CAMBODIA_VIEW = {
  center: [104.991, 12.5657] as [number, number],
  zoom: 6.5,
};

const previewSourceId = "service-area-zones-preview";
const previewFillLayerId = "service-area-zones-fill";
const previewLineLayerId = "service-area-zones-line";

const drawConstants = (
  MapboxDraw as unknown as {
    constants?: {
      classes?: Record<string, string>;
    };
  }
).constants?.classes;

if (drawConstants) {
  drawConstants.CANVAS = "maplibregl-canvas";
  drawConstants.CONTROL_BASE = "maplibregl-ctrl";
  drawConstants.CONTROL_PREFIX = "maplibregl-ctrl-";
  drawConstants.CONTROL_GROUP = "maplibregl-ctrl-group";
  drawConstants.ATTRIBUTION = "maplibregl-ctrl-attrib";
}

function zoneFeature(
  zone: ZonePreview,
): Feature<Polygon, Record<string, string>> {
  return {
    type: "Feature",
    geometry: zone.polygonGeoJson as Polygon,
    properties: {
      key: zone.key,
      status: zone.status,
      label: `${zone.zoneRef} v${zone.version} · ${zone.displayName}`,
    },
  };
}

function polygonBounds(
  polygons: readonly PolygonGeoJson[],
): maplibregl.LngLatBoundsLike | null {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon.coordinates) {
      for (const [lng, lat] of ring) {
        if (typeof lng !== "number" || typeof lat !== "number") {
          continue;
        }
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }
    }
  }
  if (!Number.isFinite(minLng)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export function ServiceAreaMapEditor(
  props: Readonly<{
    value: PolygonGeoJson | null;
    zones: readonly ZonePreview[];
    editable: boolean;
    label: string;
    onChange: (polygon: PolygonGeoJson | null) => void;
  }>,
): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const drawListenerRef = useRef<(() => void) | null>(null);
  const loadedRef = useRef(false);
  const lastValueRef = useRef<string>("");
  const onChangeRef = useRef(props.onChange);
  onChangeRef.current = props.onChange;

  const previewCollection = useMemo<FeatureCollection<Polygon>>(
    () => ({
      type: "FeatureCollection",
      features: props.zones.map((zone) => zoneFeature(zone)),
    }),
    [props.zones],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: blankMapStyle,
      center: CAMBODIA_VIEW.center,
      zoom: CAMBODIA_VIEW.zoom,
      attributionControl: false,
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.on("load", () => {
      loadedRef.current = true;
      map.addSource(previewSourceId, {
        type: "geojson",
        data: previewCollection,
      });
      map.addLayer({
        id: previewFillLayerId,
        type: "fill",
        source: previewSourceId,
        paint: {
          "fill-color": [
            "match",
            ["get", "status"],
            "ACTIVE",
            "#16a34a",
            "DRAFT",
            "#2563eb",
            "PENDING_REVIEW",
            "#d97706",
            "RETIRED",
            "#64748b",
            "#2563eb",
          ],
          "fill-opacity": 0.18,
        },
      });
      map.addLayer({
        id: previewLineLayerId,
        type: "line",
        source: previewSourceId,
        paint: {
          "line-color": [
            "match",
            ["get", "status"],
            "ACTIVE",
            "#166534",
            "DRAFT",
            "#1d4ed8",
            "PENDING_REVIEW",
            "#b45309",
            "RETIRED",
            "#475569",
            "#1d4ed8",
          ],
          "line-width": 2,
        },
      });
    });
    mapRef.current = map;
    return () => {
      drawListenerRef.current = null;
      drawRef.current = null;
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [previewCollection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource(previewSourceId) as GeoJSONSource | undefined;
    source?.setData(previewCollection);
  }, [previewCollection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    if (props.editable) {
      if (!drawRef.current) {
        const draw = new MapboxDraw({
          displayControlsDefault: false,
          controls: {
            polygon: true,
            trash: true,
          },
        });
        const handleDrawChange = () => {
          const collection = draw.getAll() as FeatureCollection;
          const polygon = collection.features.find(
            (feature: Feature) => feature.geometry?.type === "Polygon",
          );
          onChangeRef.current(
            polygon?.geometry
              ? (polygon.geometry as unknown as PolygonGeoJson)
              : null,
          );
        };
        (
          map as unknown as {
            addControl: (control: unknown, position?: string) => void;
            on: (event: string, listener: () => void) => void;
          }
        ).addControl(draw, "top-left");
        (
          map as unknown as {
            on: (event: string, listener: () => void) => void;
          }
        ).on("draw.create", handleDrawChange);
        (
          map as unknown as {
            on: (event: string, listener: () => void) => void;
          }
        ).on("draw.update", handleDrawChange);
        (
          map as unknown as {
            on: (event: string, listener: () => void) => void;
          }
        ).on("draw.delete", handleDrawChange);
        drawRef.current = draw;
        drawListenerRef.current = handleDrawChange;
      }
      return;
    }
    if (drawRef.current) {
      if (drawListenerRef.current) {
        (
          map as unknown as {
            off: (event: string, listener: () => void) => void;
          }
        ).off("draw.create", drawListenerRef.current);
        (
          map as unknown as {
            off: (event: string, listener: () => void) => void;
          }
        ).off("draw.update", drawListenerRef.current);
        (
          map as unknown as {
            off: (event: string, listener: () => void) => void;
          }
        ).off("draw.delete", drawListenerRef.current);
      }
      (
        map as unknown as {
          removeControl: (control: unknown) => void;
        }
      ).removeControl(drawRef.current);
      drawRef.current = null;
      drawListenerRef.current = null;
      lastValueRef.current = "";
    }
  }, [props.editable]);

  useEffect(() => {
    const draw = drawRef.current;
    if (!props.editable || !draw) return;
    const serialized = JSON.stringify(props.value ?? null);
    if (serialized === lastValueRef.current) return;
    lastValueRef.current = serialized;
    const existing = draw.getAll() as FeatureCollection;
    for (const feature of existing.features) {
      if (feature.id) {
        draw.delete(String(feature.id));
      }
    }
    if (props.value) {
      draw.add({
        type: "Feature",
        properties: {},
        geometry: props.value as unknown as Polygon,
      });
    }
  }, [props.editable, props.value]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const polygons = [
      ...props.zones.map((zone) => zone.polygonGeoJson),
      ...(props.editable && props.value ? [props.value] : []),
    ];
    const bounds = polygonBounds(polygons);
    if (!bounds) return;
    map.fitBounds(bounds, { padding: 36, duration: 0, maxZoom: 12 });
  }, [props.editable, props.value, props.zones]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <strong>{props.label}</strong>
      <div
        ref={containerRef}
        style={{
          minHeight: 360,
          borderRadius: 10,
          overflow: "hidden",
          border: "1px solid #cbd5e1",
        }}
      />
    </div>
  );
}
