
import { useCallback, useEffect, useState } from "react";
import { io } from "socket.io-client";
import api from "../services/api";
import HimSafeMap from "./Map";
import "./EmergencyDashboard.css";

function EmergencyDashboard() {
    const [alerts, setAlerts] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [actionId, setActionId] = useState(null);
    const [message, setMessage] = useState("");
    const [serverOnline, setServerOnline] = useState(false);
    const [socketOnline, setSocketOnline] = useState(false);
    const [notification, setNotification] = useState("");
    const [historyFilter, setHistoryFilter] = useState("ALL");

    const loadAlerts = useCallback(async (showLoading = false) => {
        if (showLoading) setLoading(true);

        try {
            const response = await api.get("/emergencies/active");

            if (!response.data.success) {
                throw new Error("Unable to load active emergencies");
            }

            setAlerts(
                response.data.emergencies ??
                response.data.alerts ??
                []
            );
            setServerOnline(true);
        } catch (error) {
            console.error("Dashboard error:", error);
            setMessage("Unable to load emergency alerts. Check the API connection.");
        } finally {
            setLoading(false);
        }
    }, []);

    const loadHistory = useCallback(async (showLoading = false) => {
        if (showLoading) setHistoryLoading(true);

        try {
            const response = await api.get("/sos");

            if (!response.data.success) {
                throw new Error("Unable to load SOS history");
            }

            setHistory(
                response.data.emergencies ??
                response.data.alerts ??
                []
            );
            setServerOnline(true);
        } catch (error) {
            console.error("History error:", error);
            setMessage("Unable to load SOS history. Please try refreshing.");
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    const loadDashboard = useCallback(async (showLoading = false) => {
        await Promise.all([
            loadAlerts(showLoading),
            loadHistory(showLoading),
        ]);
    }, [loadAlerts, loadHistory]);

    useEffect(() => {
        let refreshInProgress = false;

        const refreshDashboard = async (showLoading = false) => {
            if (refreshInProgress) return;

            refreshInProgress = true;

            try {
                await loadDashboard(showLoading);
            } finally {
                refreshInProgress = false;
            }
        };

        refreshDashboard(true);

        const interval = setInterval(() => {
            refreshDashboard();
        }, 10000);

        const socket = io({
            path: "/socket.io",
            transports: ["websocket", "polling"],
        });

        socket.on("connect", () => setSocketOnline(true));
        socket.on("disconnect", () => setSocketOnline(false));

        socket.on("connect_error", (error) => {
            setSocketOnline(false);
            console.error("Socket.IO connection error:", error.message);
        });

        const handleEmergencyUpdate = (emergency) => {
            const status = emergency?.status || "UPDATED";
            const id = emergency?.id || emergency?._id;
            const incidentId = id ? ` · Incident ${String(id).slice(-8)}` : "";

            setNotification(
                `${status === "ACTIVE" ? "New SOS alert received" :
                    status === "ACKNOWLEDGED" ? "Emergency acknowledged" :
                        status === "RESOLVED" ? "Emergency resolved" :
                            "Emergency information updated"}${incidentId}`
            );

            refreshDashboard();
        };

        socket.on("sos:created", handleEmergencyUpdate);
        socket.on("emergencies:updated", handleEmergencyUpdate);
        socket.on("sos:location-updated", handleEmergencyUpdate);

        return () => {
            clearInterval(interval);
            socket.off("sos:created", handleEmergencyUpdate);
            socket.off("emergencies:updated", handleEmergencyUpdate);
            socket.off("sos:location-updated", handleEmergencyUpdate);
            socket.disconnect();
        };
    }, [loadDashboard]);

    const updateEmergency = async (id, action) => {
        try {
            setActionId(id);
            setMessage("");

            const response = await api.patch(`/sos/${id}/${action}`);

            if (response.data.success) {
                setMessage(
                    action === "acknowledge"
                        ? "Emergency acknowledged successfully."
                        : "Emergency resolved successfully."
                );
                await loadDashboard();
            }
        } catch (error) {
            console.error("Emergency action error:", error);
            setMessage("Unable to update this emergency. Please try again.");
        } finally {
            setActionId(null);
        }
    };

    const getId = (item) => String(item?.id || item?._id || "");

    const openLocation = (latitude, longitude) => {
        const lat = Number(latitude);
        const lng = Number(longitude);

        if (
            latitude == null ||
            longitude == null ||
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            lat < -90 ||
            lat > 90 ||
            lng < -180 ||
            lng > 180
        ) {
            setMessage("Valid location coordinates are not available.");
            return;
        }

        window.open(
            `https://www.google.com/maps?q=${lat},${lng}`,
            "_blank",
            "noopener,noreferrer"
        );
    };

    const formatDate = (date) => {
        if (!date) return "Date unavailable";

        const parsed = new Date(date);

        return Number.isNaN(parsed.getTime())
            ? "Date unavailable"
            : parsed.toLocaleString();
    };

    const formatCoordinates = (latitude, longitude) => {
        const lat = Number(latitude);
        const lng = Number(longitude);

        if (
            latitude == null ||
            longitude == null ||
            !Number.isFinite(lat) ||
            !Number.isFinite(lng)
        ) {
            return "Coordinates unavailable";
        }

        return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    };

    const activeCount = history.filter(
        (item) => item.status === "ACTIVE"
    ).length;

    const acknowledgedCount = history.filter(
        (item) => item.status === "ACKNOWLEDGED"
    ).length;

    const resolvedCount = history.filter(
        (item) => item.status === "RESOLVED"
    ).length;

    const filteredHistory = history.filter((item) => {
        return historyFilter === "ALL" || item.status === historyFilter;
    });

    const serviceNames = (services) => {
        if (!services) return [];

        return Object.entries(services)
            .filter(([, enabled]) => enabled === true)
            .map(([name]) => name.charAt(0).toUpperCase() + name.slice(1));
    };

    return (
        <div className="emergency-dashboard">
            <header className="dashboard-navbar">
                <a className="dashboard-logo" href="/" aria-label="HimSafe home">
                    <span className="dashboard-logo-icon">🛡️</span>
                    <span className="dashboard-logo-copy">
                        <strong>HimSafe</strong>
                        <span>Emergency Safety Platform</span>
                    </span>
                </a>

                <nav className="dashboard-nav" aria-label="Main navigation">
                    <a href="/">Home</a>
                    <a className="active" href="/dashboard">Dashboard</a>
                    <a href="/reports">Reports</a>
                </nav>

                <div className="dashboard-connectivity">
                    <span className={`connection-pill ${serverOnline ? "online" : "offline"}`}>
                        <span className="connection-dot" />
                        {serverOnline ? "API Online" : "API Offline"}
                    </span>
                    <span className={`connection-pill ${socketOnline ? "online" : "offline"}`}>
                        <span className="connection-dot" />
                        {socketOnline ? "Live Connected" : "Live Disconnected"}
                    </span>
                </div>
            </header>

            <main className="dashboard-main">
                <section className="dashboard-heading">
                    <div>
                        <span className="dashboard-eyebrow">HIMSAFE CONTROL CENTER</span>
                        <h1>Emergency Dashboard</h1>
                        <p>Monitor SOS alerts, review incident history, and manage emergencies in one place.</p>
                    </div>

                    <button
                        type="button"
                        className="refresh-button"
                        onClick={() => loadDashboard(true)}
                        disabled={loading || historyLoading}
                    >
                        <span aria-hidden="true">{loading || historyLoading ? "⏳" : "↻"}</span>
                        {loading || historyLoading ? "Refreshing..." : "Refresh data"}
                    </button>
                </section>

                {notification && (
                    <div className="dashboard-notification" role="status">
                        <span className="notification-symbol">🔔</span>
                        <span>{notification}</span>
                        <button type="button" onClick={() => setNotification("")} aria-label="Dismiss notification">×</button>
                    </div>
                )}

                {message && (
                    <div className="dashboard-message" role="status">
                        <span>{message}</span>
                        <button type="button" onClick={() => setMessage("")} aria-label="Dismiss message">×</button>
                    </div>
                )}

                <section className="dashboard-stats" aria-label="Emergency statistics">
                    <article className="stat-card stat-total">
                        <span className="stat-icon">📋</span>
                        <div className="stat-copy">
                            <span>Total SOS Records</span>
                            <strong>{history.length}</strong>
                            <small>All recorded incidents</small>
                        </div>
                    </article>

                    <article className="stat-card stat-active">
                        <span className="stat-icon">🚨</span>
                        <div className="stat-copy">
                            <span>Active Emergencies</span>
                            <strong>{activeCount}</strong>
                            <small>Require attention</small>
                        </div>
                    </article>

                    <article className="stat-card stat-acknowledged">
                        <span className="stat-icon">◉</span>
                        <div className="stat-copy">
                            <span>Acknowledged</span>
                            <strong>{acknowledgedCount}</strong>
                            <small>Being attended to</small>
                        </div>
                    </article>

                    <article className="stat-card stat-resolved">
                        <span className="stat-icon">✓</span>
                        <div className="stat-copy">
                            <span>Resolved</span>
                            <strong>{resolvedCount}</strong>
                            <small>Completed incidents</small>
                        </div>
                    </article>
                </section>

                <section className="dashboard-panel">
                    <div className="section-title">
                        <div>
                            <span className="section-eyebrow">LIVE MONITORING</span>
                            <h2>Active Emergencies</h2>
                            <p>Review current incidents and update their status.</p>
                        </div>
                        <span className="section-count">{alerts.length} active</span>
                    </div>

                    {loading ? (
                        <div className="dashboard-empty">
                            <span className="empty-icon">⏳</span>
                            <h3>Loading emergencies</h3>
                            <p>Retrieving the latest emergency information...</p>
                        </div>
                    ) : alerts.length === 0 ? (
                        <div className="dashboard-empty">
                            <span className="empty-icon">✓</span>
                            <h3>No active emergencies</h3>
                            <p>There are no active or acknowledged emergencies right now.</p>
                        </div>
                    ) : (
                        <div className="emergency-list">
                            {alerts.map((alert) => {
                                const id = getId(alert);

                                return (
                                    <article className="emergency-card" key={id}>
                                        <div className="emergency-card-top">
                                            <div className="emergency-card-title">
                                                <span className="emergency-icon">🚨</span>
                                                <div>
                                                    <h3>SOS Emergency</h3>
                                                    <span className="incident-id">Incident ID: {id.slice(-8) || "Unavailable"}</span>
                                                </div>
                                            </div>
                                            <span className={`alert-status ${(alert.status || "unknown").toLowerCase()}`}>
                                                {alert.status || "UNKNOWN"}
                                            </span>
                                        </div>

                                        <div className="emergency-details">
                                            <p><span>📍</span> {formatCoordinates(alert.latitude, alert.longitude)}</p>
                                            <p><span>🕒</span> {formatDate(alert.createdAt)}</p>
                                        </div>

                                        <div className="service-tags">
                                            {serviceNames(alert.services).length ? (
                                                serviceNames(alert.services).map((service) => (
                                                    <span className="service-tag" key={service}>{service}</span>
                                                ))
                                            ) : (
                                                <span className="service-tag">No services specified</span>
                                            )}
                                        </div>

                                        <div className="emergency-actions">
                                            <button
                                                type="button"
                                                className="location-button"
                                                onClick={() => openLocation(alert.latitude, alert.longitude)}
                                            >
                                                ↗ View location
                                            </button>

                                            {alert.status === "ACTIVE" && (
                                                <button
                                                    type="button"
                                                    className="acknowledge-button"
                                                    disabled={actionId === id}
                                                    onClick={() => updateEmergency(id, "acknowledge")}
                                                >
                                                    {actionId === id ? "Updating..." : "Acknowledge"}
                                                </button>
                                            )}

                                            {alert.status !== "RESOLVED" && (
                                                <button
                                                    type="button"
                                                    className="resolve-button"
                                                    disabled={actionId === id}
                                                    onClick={() => updateEmergency(id, "resolve")}
                                                >
                                                    {actionId === id ? "Updating..." : "Resolve"}
                                                </button>
                                            )}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>

                <section className="dashboard-panel">
                    <div className="section-title history-heading">
                        <div>
                            <span className="section-eyebrow">INCIDENT RECORDS</span>
                            <h2>SOS History</h2>
                            <p>Review previous alerts and open their locations.</p>
                        </div>

                        <label className="history-filter">
                            <span>Filter status</span>
                            <select value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)}>
                                <option value="ALL">All records</option>
                                <option value="ACTIVE">Active</option>
                                <option value="ACKNOWLEDGED">Acknowledged</option>
                                <option value="RESOLVED">Resolved</option>
                            </select>
                        </label>
                    </div>

                    <div className="history-summary">
                        <span>{filteredHistory.length} record{filteredHistory.length !== 1 ? "s" : ""} shown</span>
                        <span>{history.length} total</span>
                    </div>

                    {historyLoading ? (
                        <div className="dashboard-empty">
                            <span className="empty-icon">⏳</span>
                            <h3>Loading SOS history</h3>
                            <p>Retrieving previous emergency records...</p>
                        </div>
                    ) : filteredHistory.length === 0 ? (
                        <div className="dashboard-empty">
                            <span className="empty-icon">📋</span>
                            <h3>No records found</h3>
                            <p>There are no SOS records matching this filter.</p>
                        </div>
                    ) : (
                        <div className="history-list">
                            {filteredHistory.map((alert) => {
                                const id = getId(alert);

                                return (
                                    <article className="history-card" key={id}>
                                        <div className="history-main">
                                            <span className={`history-icon history-icon-${(alert.status || "unknown").toLowerCase()}`}>
                                                {alert.status === "RESOLVED" ? "✓" : alert.status === "ACKNOWLEDGED" ? "◉" : "🚨"}
                                            </span>
                                            <div className="history-details">
                                                <h3>SOS Emergency</h3>
                                                <span className="incident-id">Incident ID: {id.slice(-8) || "Unavailable"}</span>
                                                <p>📍 {formatCoordinates(alert.latitude, alert.longitude)}</p>
                                                <p>🕒 {formatDate(alert.createdAt)}</p>
                                            </div>
                                        </div>

                                        <div className="history-right">
                                            <span className={`alert-status ${(alert.status || "unknown").toLowerCase()}`}>
                                                {alert.status || "UNKNOWN"}
                                            </span>
                                            <button
                                                type="button"
                                                className="history-location-button"
                                                onClick={() => openLocation(alert.latitude, alert.longitude)}
                                            >
                                                ↗ Location
                                            </button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>

                <section className="dashboard-panel dashboard-map-section">
                    <div className="section-title">
                        <div>
                            <span className="section-eyebrow">LOCATION MONITORING</span>
                            <h2>Emergency Map</h2>
                            <p>View emergency locations on the HimSafe map.</p>
                        </div>
                        <span className="map-section-tag">◉ Map view</span>
                    </div>

                    <div className="dashboard-map">
                        <HimSafeMap />
                    </div>
                </section>
            </main>

            <footer className="dashboard-footer">
                <p><span>🛡️</span> © 2026 HimSafe · Emergency Safety Platform</p>
                <p>
                    <span className={`footer-status-dot ${serverOnline ? "online" : "offline"}`} />
                    {serverOnline ? "Connected to API" : "API connection unavailable"}
                    {" · "}
                    {socketOnline ? "Live notifications active" : "Live notifications disconnected"}
                </p>
            </footer>
        </div>
    );
}

export default EmergencyDashboard;