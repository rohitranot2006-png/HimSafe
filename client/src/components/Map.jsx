
import { useEffect, useRef, useState } from "react";
import api from "../services/api";
import "./Map.css";

function HimSafeMap() {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef(new Map());
    const scriptRef = useRef(null);

    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [mapReady, setMapReady] = useState(false);
    const [mapError, setMapError] = useState("");

    useEffect(() => {
        let cancelled = false;

        const loadAlerts = async () => {
            try {
                const response = await api.get(
                    "/emergencies/active"
                );

                if (cancelled) return;

                const data = response.data;

                if (data?.success === false) {
                    throw new Error(
                        "The server could not load active emergencies."
                    );
                }

                const emergencies =
                    data?.emergencies ?? data?.alerts ?? [];

                if (!Array.isArray(emergencies)) {
                    throw new Error(
                        "Invalid emergency data received from server."
                    );
                }

                setAlerts(emergencies);
                setMapError("");
            } catch (error) {
                console.error("Map alert error:", error);

                if (!cancelled) {
                    setMapError(
                        "Unable to load emergency alerts. Please check the server."
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        loadAlerts();

        const interval = setInterval(loadAlerts, 10000);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        let script = null;
        let handleLoad = null;
        let handleError = null;

        const initializeMap = () => {
            if (
                cancelled ||
                !mapRef.current ||
                !window.L ||
                mapInstanceRef.current
            ) {
                return;
            }

            const L = window.L;

            const map = L.map(mapRef.current).setView(
                [20.5937, 78.9629],
                5
            );

            L.tileLayer(
                "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                {
                    attribution:
                        "&copy; OpenStreetMap contributors",
                    maxZoom: 19,
                }
            ).addTo(map);

            mapInstanceRef.current = map;
            setMapReady(true);

            window.requestAnimationFrame(() => {
                if (!cancelled && mapInstanceRef.current) {
                    map.invalidateSize();
                }
            });
        };

        const loadLeaflet = () => {
            if (window.L) {
                initializeMap();
                return;
            }

            let stylesheet = document.querySelector(
                'link[data-himsafe-leaflet="true"]'
            );

            if (!stylesheet) {
                stylesheet = document.createElement("link");
                stylesheet.rel = "stylesheet";
                stylesheet.href =
                    "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
                stylesheet.dataset.himsafeLeaflet = "true";
                document.head.appendChild(stylesheet);
            }

            const existingScript = document.querySelector(
                'script[data-himsafe-leaflet="true"]'
            );

            if (existingScript) {
                if (existingScript.dataset.loaded === "true") {
                    initializeMap();
                    return;
                }

                handleLoad = () => {
                    existingScript.dataset.loaded = "true";
                    initializeMap();
                };

                handleError = () => {
                    if (!cancelled) {
                        setMapError(
                            "Unable to load the map library. Check your internet connection."
                        );
                    }
                };

                existingScript.addEventListener(
                    "load",
                    handleLoad
                );
                existingScript.addEventListener(
                    "error",
                    handleError
                );

                return;
            }

            script = document.createElement("script");
            script.src =
                "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
            script.async = true;
            script.dataset.himsafeLeaflet = "true";

            script.onload = () => {
                script.dataset.loaded = "true";
                initializeMap();
            };

            script.onerror = () => {
                if (!cancelled) {
                    setMapError(
                        "Unable to load the map library. Check your internet connection."
                    );
                }
            };

            scriptRef.current = script;
            document.body.appendChild(script);
        };

        loadLeaflet();

        return () => {
            cancelled = true;

            if (script) {
                script.onload = null;
                script.onerror = null;
            }

            const existingScript = document.querySelector(
                'script[data-himsafe-leaflet="true"]'
            );

            if (existingScript && handleLoad) {
                existingScript.removeEventListener(
                    "load",
                    handleLoad
                );
            }

            if (existingScript && handleError) {
                existingScript.removeEventListener(
                    "error",
                    handleError
                );
            }

            markersRef.current.forEach((marker) => {
                marker.remove();
            });

            markersRef.current.clear();

            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }

            scriptRef.current = null;
        };
    }, []);

    useEffect(() => {
        const map = mapInstanceRef.current;
        const L = window.L;

        if (!mapReady || !map || !L) {
            return;
        }

        const currentMarkers = markersRef.current;
        const activeIds = new Set();
        const bounds = [];

        alerts.forEach((alert) => {
            const latitude = Number(alert.latitude);
            const longitude = Number(alert.longitude);

            if (
                !Number.isFinite(latitude) ||
                !Number.isFinite(longitude) ||
                latitude < -90 ||
                latitude > 90 ||
                longitude < -180 ||
                longitude > 180
            ) {
                return;
            }

            const id =
                alert.id ??
                alert._id ??
                `${latitude},${longitude}`;

            const markerId = String(id);
            activeIds.add(markerId);

            const markerColor =
                alert.status === "ACKNOWLEDGED"
                    ? "#f59e0b"
                    : "#dc2626";

            const icon = L.divIcon({
                className: "himsafe-marker-wrapper",
                html: `<div class="himsafe-marker" style="background:${markerColor}">🚨</div>`,
                iconSize: [42, 42],
                iconAnchor: [21, 21],
            });

            let marker = currentMarkers.get(markerId);

            if (marker) {
                marker.setLatLng([latitude, longitude]);
                marker.setIcon(icon);
            } else {
                marker = L.marker(
                    [latitude, longitude],
                    { icon }
                ).addTo(map);

                currentMarkers.set(markerId, marker);
            }

            const popup = document.createElement("div");
            popup.className = "himsafe-popup";

            const heading = document.createElement("strong");
            heading.textContent = "SOS Emergency";
            popup.appendChild(heading);

            [
                `Status: ${alert.status ?? "ACTIVE"}`,
                `Latitude: ${latitude.toFixed(5)}`,
                `Longitude: ${longitude.toFixed(5)}`,
                `Reported: ${
                    alert.createdAt
                        ? new Date(
                              alert.createdAt
                          ).toLocaleString()
                        : "Unknown"
                }`,
            ].forEach((line) => {
                const span = document.createElement("span");
                span.textContent = line;
                popup.appendChild(span);
            });

            marker.bindPopup(popup);

            bounds.push([latitude, longitude]);
        });

        currentMarkers.forEach((marker, id) => {
            if (!activeIds.has(id)) {
                marker.remove();
                currentMarkers.delete(id);
            }
        });

        if (bounds.length === 1) {
            const currentCenter = map.getCenter();
            const target = bounds[0];

            const alreadyCentered =
                Math.abs(currentCenter.lat - target[0]) < 0.00001 &&
                Math.abs(currentCenter.lng - target[1]) < 0.00001;

            if (!alreadyCentered) {
                map.setView(target, Math.max(map.getZoom(), 15));
            }
        } else if (bounds.length > 1) {
            map.fitBounds(bounds, {
                padding: [40, 40],
                maxZoom: 15,
            });
        } else {
            currentMarkers.clear();
            map.setView([20.5937, 78.9629], 5);
        }

        map.invalidateSize();
    }, [alerts, mapReady]);

    const activeCount = alerts.filter(
        (alert) =>
            alert.status === "ACTIVE" ||
            alert.status === "ACKNOWLEDGED"
    ).length;

    return (
        <div className="himsafe-map-container">
            <div ref={mapRef} className="himsafe-map" />

            <div className="map-overlay">
                <div className="map-overlay-title">
                    <span className="map-live-dot" />
                    LIVE EMERGENCY LOCATIONS
                </div>

                <div className="map-overlay-count">
                    {loading
                        ? "Loading alerts..."
                        : `${activeCount} active ${
                              activeCount === 1
                                  ? "emergency"
                                  : "emergencies"
                          }`}
                </div>

                {mapError && (
                    <div role="alert">{mapError}</div>
                )}
            </div>

            {activeCount > 0 && (
                <div className="map-legend">
                    <div>
                        <span className="legend-dot active-dot" />
                        Active
                    </div>

                    <div>
                        <span className="legend-dot acknowledged-dot" />
                        Acknowledged
                    </div>
                </div>
            )}
        </div>
    );
}

export default HimSafeMap;