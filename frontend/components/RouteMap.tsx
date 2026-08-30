"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";

/**
 * A real map: OpenStreetMap tiles under the employee's route.
 *
 * Leaflet touches `window` at import time, so it is loaded dynamically inside an
 * effect rather than at module scope — importing it normally breaks the Next.js
 * server render.
 *
 * Tiles come from openstreetmap.org, which needs no API key. That is fine for an
 * internal dashboard, but OSM's tile policy forbids heavy production traffic:
 * before this ships to customers, point TILE_URL at a paid provider (MapTiler,
 * Stadia, Mapbox) or a self-hosted tile server. Nothing else has to change.
 */

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export type MapPoint = { capturedAt: string; latitude: number; longitude: number };

export type MapStop = {
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  latitude: number;
  longitude: number;
  officeLabel?: string;
};

export type MapOffice = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

/** A person shown on the live map, rather than a single route. */
export type MapMarker = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  detail?: string;
  tone?: "onsite" | "offsite" | "stale";
};

type Props = {
  points?: MapPoint[];
  stops?: MapStop[];
  offices?: MapOffice[];
  markers?: MapMarker[];
  clockIn?: { latitude: number; longitude: number } | null;
  clockOut?: { latitude: number; longitude: number } | null;
  height?: number;
};

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours === 0 ? `${minutes} min` : `${hours}h ${minutes}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Popup content is built as HTML, so anything user-supplied must be escaped. */
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );
}

export default function RouteMap({
  points = [],
  stops = [],
  offices = [],
  markers = [],
  clockIn = null,
  clockOut = null,
  height = 420,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);

  // Create the map once and tear it down on unmount, so React strict mode's
  // double-invocation cannot bind two maps to the same container.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        // Page scrolling should not zoom the map by accident.
        scrollWheelZoom: false,
      }).setView([20.5937, 78.9629], 4);

      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);

      // Deliberate interaction still gets wheel zoom.
      map.on("click", () => map.scrollWheelZoom.enable());
      map.on("mouseout", () => map.scrollWheelZoom.disable());

      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Redraw whenever the data changes.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      const layer = layerRef.current;
      if (cancelled || !map || !layer) return;

      layer.clearLayers();

      const dot = (color: string, size: number, ring = 3) =>
        L.divIcon({
          className: "",
          html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${ring}px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>`,
          iconSize: [size + ring * 2, size + ring * 2],
          iconAnchor: [(size + ring * 2) / 2, (size + ring * 2) / 2],
        });

      // What the viewport should frame: the actual activity. Office geofences
      // are drawn but deliberately excluded, because an office in another city
      // would zoom the route down to an invisible speck.
      const bounds: Array<[number, number]> = [];
      const officeBounds: Array<[number, number]> = [];

      // Office geofences first, so everything else draws on top of them.
      offices.forEach((office) => {
        L.circle([office.latitude, office.longitude], {
          radius: office.radiusMeters,
          color: "#2563eb",
          weight: 1,
          fillColor: "#2563eb",
          fillOpacity: 0.08,
        })
          .bindPopup(
            `<strong>${escapeHtml(office.label)}</strong><br/>${office.radiusMeters} m geofence`,
          )
          .addTo(layer);
        officeBounds.push([office.latitude, office.longitude]);
      });

      // The travelled route.
      if (points.length > 1) {
        const latlngs = points.map(
          (p) => [p.latitude, p.longitude] as [number, number],
        );
        L.polyline(latlngs, {
          color: "#2563eb",
          weight: 4,
          opacity: 0.75,
          lineJoin: "round",
        }).addTo(layer);
        bounds.push(...latlngs);
      }

      // Every recorded fix, small — density shows where time was spent.
      points.forEach((p) => {
        L.circleMarker([p.latitude, p.longitude], {
          radius: 2.5,
          color: "#2563eb",
          fillColor: "#2563eb",
          fillOpacity: 0.6,
          weight: 0,
        })
          .bindPopup(`Recorded ${formatTime(p.capturedAt)}`)
          .addTo(layer);
        bounds.push([p.latitude, p.longitude]);
      });

      // Stops, sized by how long they lasted.
      stops.forEach((stop) => {
        const radius = Math.min(90, 25 + Math.sqrt(stop.durationSeconds) * 2);
        L.circle([stop.latitude, stop.longitude], {
          radius,
          color: "#f59e0b",
          weight: 2,
          fillColor: "#f59e0b",
          fillOpacity: 0.25,
        })
          .bindPopup(
            `<strong>${escapeHtml(stop.officeLabel ?? "Stopped here")}</strong><br/>` +
              `${formatDuration(stop.durationSeconds)}<br/>` +
              `${formatTime(stop.startedAt)} – ${formatTime(stop.endedAt)}`,
          )
          .addTo(layer);
        bounds.push([stop.latitude, stop.longitude]);
      });

      if (clockIn) {
        L.marker([clockIn.latitude, clockIn.longitude], { icon: dot("#059669", 14) })
          .bindPopup("<strong>Clocked in here</strong>")
          .addTo(layer);
        bounds.push([clockIn.latitude, clockIn.longitude]);
      }

      if (clockOut) {
        L.marker([clockOut.latitude, clockOut.longitude], { icon: dot("#dc2626", 14) })
          .bindPopup("<strong>Clocked out here</strong>")
          .addTo(layer);
        bounds.push([clockOut.latitude, clockOut.longitude]);
      }

      // Live-map people.
      const toneColor = {
        onsite: "#059669",
        offsite: "#f59e0b",
        stale: "#8C837B",
      } as const;

      markers.forEach((m) => {
        L.marker([m.latitude, m.longitude], {
          icon: dot(toneColor[m.tone ?? "onsite"], 16),
        })
          .bindPopup(
            `<strong>${escapeHtml(m.label)}</strong>` +
              (m.detail ? `<br/>${escapeHtml(m.detail)}` : ""),
          )
          .addTo(layer);
        bounds.push([m.latitude, m.longitude]);
      });

      // Fall back to the offices only when there is no activity to frame.
      const framed = bounds.length > 0 ? bounds : officeBounds;

      if (framed.length === 1) {
        map.setView(framed[0], 16);
      } else if (framed.length > 1) {
        map.fitBounds(L.latLngBounds(framed).pad(0.15));
      }

      // The container is usually sized by grid/flex after the map is created;
      // without this Leaflet keeps stale dimensions and tiles render grey.
      setTimeout(() => map.invalidateSize(), 0);
    })();

    return () => {
      cancelled = true;
    };
  }, [points, stops, offices, markers, clockIn, clockOut]);

  const isEmpty =
    points.length === 0 && markers.length === 0 && !clockIn && offices.length === 0;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        style={{ height }}
        className="w-full overflow-hidden rounded-lg border border-[#DDD2C9] bg-[#F8F5F1]"
      />
      {isEmpty ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-[#F8F5F1]/85 text-sm text-[#8C837B]">
          No location recorded yet.
        </div>
      ) : null}
    </div>
  );
}
