
import { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import "./EmergencyReports.css";

export default function EmergencyReports() {
    const [analytics, setAnalytics] = useState(null);
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("ALL");

    const loadReports = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const [analyticsRes, recordsRes] = await Promise.all([
                api.get("/analytics/emergencies"),
                api.get("/sos"),
            ]);

            const data = analyticsRes.data?.analytics ?? {};
            const emergencies =
                recordsRes.data?.emergencies ??
                recordsRes.data?.alerts ??
                [];

            setAnalytics({
                ...data,
                dailyData: data.dailyData ?? data.trend ?? [],
            });

            setRecords(Array.isArray(emergencies) ? emergencies : []);
        } catch (err) {
            console.error("Reports error:", err);
            setError("Unable to load reports. Check the server and retry.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadReports();
    }, [loadReports]);

    const trend = Array.isArray(analytics?.dailyData)
        ? analytics.dailyData
        : [];

    const filteredRecords = records.filter((record) => {
        const query = search.trim().toLowerCase();
        const id = String(record.id ?? record._id ?? "");

        const statusMatches =
            filter === "ALL" || record.status === filter;

        const searchMatches =
            !query ||
            id.toLowerCase().includes(query) ||
            String(record.status ?? "").toLowerCase().includes(query) ||
            String(record.latitude ?? "").includes(query) ||
            String(record.longitude ?? "").includes(query);

        return statusMatches && searchMatches;
    });

    const periodTotal = trend.reduce(
        (sum, item) => sum + (Number(item.count) || 0),
        0
    );

    // Build a readable Y-axis with zero as the baseline.
    const highestCount = Math.max(
        0,
        ...trend.map((item) => Number(item.count) || 0)
    );

    const yAxisMax = Math.max(5, Math.ceil(highestCount / 5) * 5);
    const yAxisStep = yAxisMax / 5;

    const chartPoints = trend.map((item, index) => {
        const x =
            trend.length === 1
                ? 350
                : 65 + (index * 570) / (trend.length - 1);

        const count = Number(item.count) || 0;

        return {
            x,
            y: 190 - (count / yAxisMax) * 150,
            count,
            date:
                item.date ??
                item._id ??
                item.day ??
                item.label ??
                item.createdAt ??
                null,
        };
    });

    const chartLine = chartPoints
        .map((point, index) =>
            `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
        )
        .join(" ");

    const chartArea = chartPoints.length
        ? `${chartLine} L ${
              chartPoints[chartPoints.length - 1].x
          } 190 L ${chartPoints[0].x} 190 Z`
        : "";

    // Format ISO dates without timezone shifting.
    function formatDate(dateValue, index) {
        if (dateValue) {
            const value = String(dateValue);
            const match = value.match(
                /^(\d{4})-(\d{2})-(\d{2})/
            );

            if (match) {
                return `${match[3]}/${match[2]}`;
            }

            const date = new Date(dateValue);

            if (!Number.isNaN(date.getTime())) {
                return `${String(date.getDate()).padStart(2, "0")}/${String(
                    date.getMonth() + 1
                ).padStart(2, "0")}`;
            }
        }

        // Fallback for API data without a date field.
        const fallback = new Date();
        fallback.setHours(12, 0, 0, 0);
        fallback.setDate(
            fallback.getDate() - (trend.length - 1 - index)
        );

        return `${String(fallback.getDate()).padStart(2, "0")}/${String(
            fallback.getMonth() + 1
        ).padStart(2, "0")}`;
    }

    function exportCSV() {
        if (!filteredRecords.length) {
            window.alert("No records available to export.");
            return;
        }

        const escapeCSV = (value) =>
            `"${String(value ?? "").replace(/"/g, '""')}"`;

        const headers = [
            "Incident ID",
            "Status",
            "Latitude",
            "Longitude",
            "Created At",
        ];

        const rows = filteredRecords.map((record) => [
            record.id ?? record._id ?? "",
            record.status ?? "",
            record.latitude ?? "",
            record.longitude ?? "",
            record.createdAt
                ? new Date(record.createdAt).toLocaleString()
                : "",
        ]);

        const csv = [
            headers.map(escapeCSV).join(","),
            ...rows.map((row) => row.map(escapeCSV).join(",")),
        ].join("\r\n");

        const blob = new Blob(["\uFEFF", csv], {
            type: "text/csv;charset=utf-8;",
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `himsafe-reports-${new Date()
            .toISOString()
            .slice(0, 10)}.csv`;

        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    return (
        <div className="reports-page">
            <header className="reports-header">
                <a href="/" className="reports-brand">
                    <span className="reports-brand-icon">H</span>
                    <span>
                        <strong>HimSafe</strong>
                        <small>Emergency Intelligence</small>
                    </span>
                </a>

                <nav className="reports-nav">
                    <a href="/">Home</a>
                    <a href="/dashboard">Dashboard</a>
                    <a href="/reports" className="selected">
                        Reports
                    </a>
                </nav>
            </header>

            <main className="reports-content">
                <section className="reports-intro">
                    <div>
                        <span className="reports-eyebrow">
                            SAFETY OVERVIEW
                        </span>
                        <h1>Emergency Reports</h1>
                        <p>
                            Monitor SOS activity and emergency history.
                        </p>
                    </div>

                    <div className="reports-actions">
                        <button
                            className="reports-refresh"
                            onClick={exportCSV}
                            disabled={
                                loading || !filteredRecords.length
                            }
                        >
                            Export CSV
                        </button>

                        <button
                            className="reports-refresh"
                            onClick={loadReports}
                            disabled={loading}
                        >
                            {loading ? "Loading..." : "Refresh Reports"}
                        </button>
                    </div>
                </section>

                {error && (
                    <div className="reports-error" role="alert">
                        {error}
                        <button onClick={loadReports}>Retry</button>
                    </div>
                )}

                <section className="reports-stats">
                    <article className="report-stat">
                        <span>Total Emergencies</span>
                        <strong>{analytics?.total ?? 0}</strong>
                    </article>

                    <article className="report-stat stat-active">
                        <span>Active Emergencies</span>
                        <strong>{analytics?.active ?? 0}</strong>
                    </article>

                    <article className="report-stat stat-acknowledged">
                        <span>Acknowledged</span>
                        <strong>{analytics?.acknowledged ?? 0}</strong>
                    </article>

                    <article className="report-stat stat-resolved">
                        <span>Resolved</span>
                        <strong>{analytics?.resolved ?? 0}</strong>
                    </article>
                </section>

                <section className="reports-panel activity-panel">
                    <div className="activity-heading">
                        <div>
                            <span className="reports-eyebrow">
                                LAST 7 DAYS
                            </span>
                            <h2>Emergency Activity</h2>
                            <p>
                                Daily count of reported SOS incidents
                            </p>
                        </div>

                        <div className="activity-total">
                            <span>Total this period</span>
                            <strong>{periodTotal}</strong>
                            <small>Reported emergencies</small>
                        </div>
                    </div>

                    {trend.length > 0 ? (
                        <div className="activity-chart">
                            <div className="chart-legend">
                                <span className="chart-legend-dot" />
                                Emergency reports
                            </div>

                            <svg
                                className="activity-svg"
                                viewBox="0 0 700 255"
                                role="img"
                                aria-label="Daily emergency counts by date"
                            >
                                <defs>
                                    <linearGradient
                                        id="activityGradient"
                                        x1="0"
                                        y1="0"
                                        x2="0"
                                        y2="1"
                                    >
                                        <stop
                                            offset="0%"
                                            stopColor="#4f46e5"
                                            stopOpacity="0.22"
                                        />
                                        <stop
                                            offset="100%"
                                            stopColor="#4f46e5"
                                            stopOpacity="0.01"
                                        />
                                    </linearGradient>
                                </defs>

                                {Array.from(
                                    { length: 6 },
                                    (_, index) => {
                                        const value =
                                            yAxisMax -
                                            index * yAxisStep;
                                        const y = 40 + index * 30;

                                        return (
                                            <g key={index}>
                                                <line
                                                    x1="65"
                                                    y1={y}
                                                    x2="635"
                                                    y2={y}
                                                    className="chart-grid-line"
                                                />

                                                <text
                                                    x="52"
                                                    y={y + 4}
                                                    textAnchor="end"
                                                    className="chart-axis-label"
                                                >
                                                    {value}
                                                </text>
                                            </g>
                                        );
                                    }
                                )}

                                <path
                                    d={chartArea}
                                    className="chart-area"
                                />

                                <path
                                    d={chartLine}
                                    className="chart-line"
                                />

                                {chartPoints.map((point, index) => (
                                    <g key={`${point.date}-${index}`}>
                                        <circle
                                            cx={point.x}
                                            cy={point.y}
                                            r="5"
                                            className="chart-point"
                                        />

                                        <text
                                            x={point.x}
                                            y={point.y - 12}
                                            textAnchor="middle"
                                            className="chart-value-label"
                                        >
                                            {point.count}
                                        </text>

                                        <text
                                            x={point.x}
                                            y="215"
                                            textAnchor="middle"
                                            className="chart-date-label"
                                        >
                                            {formatDate(point.date, index)}
                                        </text>
                                    </g>
                                ))}

                                <text
                                    x="350"
                                    y="246"
                                    textAnchor="middle"
                                    className="chart-axis-title"
                                >
                                    Date (DD/MM)
                                </text>

                                <text
                                    x="12"
                                    y="115"
                                    textAnchor="middle"
                                    className="chart-axis-title"
                                    transform="rotate(-90 12 115)"
                                >
                                    Emergencies
                                </text>
                            </svg>
                        </div>
                    ) : (
                        <p className="reports-empty">
                            {loading
                                ? "Loading chart..."
                                : "No activity data available."}
                        </p>
                    )}
                </section>

                <section className="reports-panel">
                    <h2>Emergency Records</h2>

                    <div className="reports-controls">
                        <input
                            type="search"
                            placeholder="Search ID, status or coordinates"
                            value={search}
                            onChange={(event) =>
                                setSearch(event.target.value)
                            }
                        />

                        <select
                            value={filter}
                            onChange={(event) =>
                                setFilter(event.target.value)
                            }
                        >
                            <option value="ALL">All statuses</option>
                            <option value="ACTIVE">Active</option>
                            <option value="ACKNOWLEDGED">
                                Acknowledged
                            </option>
                            <option value="RESOLVED">Resolved</option>
                        </select>
                    </div>

                    {loading ? (
                        <p className="reports-empty">
                            Loading records...
                        </p>
                    ) : filteredRecords.length === 0 ? (
                        <p className="reports-empty">
                            No matching emergency records found.
                        </p>
                    ) : (
                        <div className="reports-table-wrap">
                            <table className="reports-table">
                                <thead>
                                    <tr>
                                        <th>Incident ID</th>
                                        <th>Status</th>
                                        <th>Coordinates</th>
                                        <th>Created</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {filteredRecords.map(
                                        (record, index) => (
                                            <tr
                                                key={
                                                    record.id ??
                                                    record._id ??
                                                    index
                                                }
                                            >
                                                <td>
                                                    {String(
                                                        record.id ??
                                                        record._id ??
                                                        "Unknown"
                                                    ).slice(-8)}
                                                </td>

                                                <td>
                                                    <span
                                                        className={
                                                            "report-status " +
                                                            String(
                                                                record.status ??
                                                                "unknown"
                                                            ).toLowerCase()
                                                        }
                                                    >
                                                        {record.status ??
                                                            "UNKNOWN"}
                                                    </span>
                                                </td>

                                                <td>
                                                    {record.latitude != null &&
                                                    record.longitude != null
                                                        ? `${record.latitude}, ${record.longitude}`
                                                        : "Unavailable"}
                                                </td>

                                                <td>
                                                    {record.createdAt
                                                        ? new Date(
                                                            record.createdAt
                                                        ).toLocaleString()
                                                        : "Unknown"}
                                                </td>
                                            </tr>
                                        )
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <p className="reports-disclaimer">
                    Reports display saved HimSafe SOS records.
                </p>
            </main>
        </div>
    );
}