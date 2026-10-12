
import { useCallback, useEffect, useRef, useState } from "react";
import api from "./services/api";
import HimSafeMap from "./components/Map";
import EmergencyDashboard from "./components/EmergencyDashboard";
import EmergencyReports from "./components/EmergencyReports";
import "./App.css";

function App() {
    const path = window.location.pathname;

    if (path === "/dashboard") {
        return <EmergencyDashboard />;
    }

    if (path === "/reports") {
        return <EmergencyReports />;
    }

    return <HomePage />;
}

function HomePage() {
    const [message, setMessage] = useState("Connecting...");
    const [location, setLocation] = useState("Detecting location...");
    const [sosActive, setSosActive] = useState(false);
    const [sosLocation, setSosLocation] = useState(null);
    const [sosLoading, setSosLoading] = useState(false);
    const [sosMessage, setSosMessage] = useState("");
    const [sosHistory, setSosHistory] = useState([]);
    const [activeSOSId, setActiveSOSId] = useState(null);
    const [tracking, setTracking] = useState(false);
    const [resolving, setResolving] = useState(false);

    const watchIdRef = useRef(null);
    const activeSOSIdRef = useRef(null);
    const lastLocationUpdateRef = useRef(0);
    const mountedRef = useRef(false);

    const stopLiveTracking = useCallback(() => {
        if (
            watchIdRef.current !== null &&
            navigator.geolocation
        ) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }

        lastLocationUpdateRef.current = 0;
        setTracking(false);
    }, []);

    useEffect(() => {
        mountedRef.current = true;

        const checkServer = async () => {
            try {
                const response = await api.get("/health");

                if (mountedRef.current) {
                    setMessage(response.data.message);
                }
            } catch (error) {
                if (mountedRef.current) {
                    setMessage("Unable to connect to HimSafe server");
                }

                console.error("Server connection error:", error);
            }
        };

        const loadSOSHistory = async () => {
            try {
                const response = await api.get("/sos");

                if (mountedRef.current && response.data.success) {
                    setSosHistory(
                        response.data.emergencies ||
                        response.data.alerts ||
                        []
                    );
                }
            } catch (error) {
                console.error("SOS history error:", error);
            }
        };

        checkServer();
        loadSOSHistory();

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                () => {
                    if (mountedRef.current) {
                        setLocation("Location detected");
                    }
                },
                () => {
                    if (mountedRef.current) {
                        setLocation("Location unavailable");
                    }
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0,
                }
            );
        } else {
            setLocation("Location not supported");
        }

        return () => {
            mountedRef.current = false;

            if (
                watchIdRef.current !== null &&
                navigator.geolocation
            ) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }

            activeSOSIdRef.current = null;
        };
    }, []);

    const handleSOS = () => {
        if (sosLoading || sosActive) return;

        if (!navigator.geolocation) {
            setSosMessage("Location services are not supported");
            return;
        }

        setSosLoading(true);
        setSosMessage("Getting your emergency location...");

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const latitude = position.coords.latitude;
                const longitude = position.coords.longitude;

                try {
                    const response = await api.post("/sos", {
                        latitude,
                        longitude,
                    });

                    if (response.data.success) {
                        const emergency = response.data.emergency;
                        const id = emergency.id || emergency._id;

                        activeSOSIdRef.current = id;
                        setActiveSOSId(id);
                        setSosActive(true);

                        setSosLocation(
                            `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                        );

                        setLocation("Emergency location detected");

                        setSosMessage(
                            "SOS alert sent successfully. Live tracking is not started yet."
                        );

                        setSosHistory((previous) => [
                            emergency,
                            ...previous.filter(
                                (item) =>
                                    (item.id || item._id) !== id
                            ),
                        ]);
                    } else {
                        setSosMessage(
                            "The server could not register the SOS alert"
                        );
                    }
                } catch (error) {
                    console.error("SOS API error:", error);

                    setSosMessage(
                        "Unable to send SOS alert to HimSafe server"
                    );
                } finally {
                    setSosLoading(false);
                }
            },
            (error) => {
                console.error("Geolocation error:", error);
                setSosLoading(false);
                setSosMessage(
                    "Unable to get your current location. SOS was not sent."
                );
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0,
            }
        );
    };

    const startLiveTracking = () => {
        if (tracking || watchIdRef.current !== null) return;

        const sosId = activeSOSIdRef.current;

        if (!sosId) {
            setSosMessage(
                "Create an SOS alert before starting live tracking."
            );
            return;
        }

        if (!navigator.geolocation) {
            setSosMessage("Location services are not supported");
            return;
        }

        setSosMessage(
            "Requesting permission for live location tracking..."
        );

        try {
            const watchId = navigator.geolocation.watchPosition(
                async (position) => {
                    if (!mountedRef.current) return;

                    const { latitude, longitude } = position.coords;

                    setSosLocation(
                        `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                    );

                    setLocation("Live location tracking active");

                    const now = Date.now();

                    // Send updates at most once every five seconds.
                    if (now - lastLocationUpdateRef.current < 5000) {
                        return;
                    }

                    lastLocationUpdateRef.current = now;

                    try {
                        const response = await api.patch(
                            `/sos/${sosId}/location`,
                            {
                                latitude,
                                longitude,
                            }
                        );

                        if (!mountedRef.current) return;

                        if (response.data.success) {
                            const emergency = response.data.emergency;

                            setSosHistory((previous) =>
                                previous.map((item) =>
                                    (item.id || item._id) === sosId
                                        ? { ...item, ...emergency }
                                        : item
                                )
                            );

                            setSosMessage(
                                "Live location is updating successfully."
                            );
                        }
                    } catch (error) {
                        console.error(
                            "Live location update error:",
                            error
                        );

                        if (!mountedRef.current) return;

                        const status = error.response?.status;

                        if (status === 409 || status === 404) {
                            stopLiveTracking();
                            setSosMessage(
                                "Tracking stopped because this SOS is no longer active."
                            );
                        } else {
                            setSosMessage(
                                "Tracking is running, but the server could not save the latest location. Retrying on the next update."
                            );
                        }
                    }
                },
                (error) => {
                    console.error("Live tracking error:", error);

                    stopLiveTracking();

                    if (mountedRef.current) {
                        setSosMessage(
                            error.code === 1
                                ? "Location permission was denied. Allow location access to use live tracking."
                                : "Unable to retrieve your live location. Tracking has stopped."
                        );
                    }
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 0,
                    timeout: 15000,
                }
            );

            watchIdRef.current = watchId;
            setTracking(true);
            setSosMessage(
                "Live tracking started. Your browser may ask for location permission."
            );
        } catch (error) {
            console.error("Unable to start tracking:", error);
            stopLiveTracking();
            setSosMessage("Unable to start live location tracking.");
        }
    };

    const cancelSOS = async () => {
        if (resolving) return;

        const sosId = activeSOSIdRef.current;

        // Stop location sharing immediately when cancellation is requested.
        stopLiveTracking();

        if (!sosId) {
            setSosMessage("No active SOS alert was found.");
            return;
        }

        setResolving(true);
        setSosMessage("Stopping tracking and resolving the SOS alert...");

        try {
            const response = await api.patch(`/sos/${sosId}/resolve`);

            if (response.data.success) {
                const emergency = response.data.emergency;

                activeSOSIdRef.current = null;
                setActiveSOSId(null);
                setSosActive(false);
                setSosLocation(null);
                setLocation("Live tracking stopped");

                setSosHistory((previous) =>
                    previous.map((item) =>
                        (item.id || item._id) === sosId
                            ? { ...item, ...emergency }
                            : item
                    )
                );

                setSosMessage(
                    "SOS resolved successfully. Live tracking has stopped."
                );
            }
        } catch (error) {
            console.error("SOS resolution error:", error);

            setSosMessage(
                "Live tracking has stopped on this page, but the server could not resolve the alert. Check your connection and try again."
            );
        } finally {
            setResolving(false);
        }
    };

    const handleShareLocation = () => {
        if (!navigator.geolocation) {
            setSosMessage("Location services are not supported");
            return;
        }

        setSosMessage("Getting your location...");

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;

                const locationUrl =
                    `https://www.google.com/maps?q=${latitude},${longitude}`;

                if (navigator.share) {
                    try {
                        await navigator.share({
                            title: "My HimSafe Location",
                            text: "Here is my current location:",
                            url: locationUrl,
                        });

                        setSosMessage("Location shared successfully");
                    } catch (error) {
                        if (error.name !== "AbortError") {
                            setSosMessage("Unable to share location");
                        }
                    }
                } else {
                    try {
                        await navigator.clipboard.writeText(locationUrl);
                        setSosMessage("Location link copied to clipboard");
                    } catch (error) {
                        setSosMessage(
                            "Unable to share or copy location"
                        );
                    }
                }
            },
            () => {
                setSosMessage("Unable to get your current location");
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0,
            }
        );
    };

    return (
        <div className="app">
            <header className="navbar">
                <div className="logo">
                    <div className="logo-icon">🛡️</div>

                    <div>
                        <h2>HimSafe</h2>
                        <span>Your Safety. Our Priority.</span>
                    </div>
                </div>

                <div className="navbar-right">
                    <nav className="nav-links">
                        <button
                            className="nav-button active"
                            onClick={() => {
                                window.location.href = "/";
                            }}
                        >
                            Home
                        </button>

                        <button
                            className="nav-button"
                            onClick={() => {
                                window.location.href = "/dashboard";
                            }}
                        >
                            Emergency Dashboard
                        </button>

                        <button
                            className="nav-button"
                            onClick={() => {
                                window.location.href = "/reports";
                            }}
                        >
                            Reports
                        </button>
                    </nav>

                    <div className="server-status">
                        <span className="status-dot"></span>

                        {message === "HimSafe API is running"
                            ? "System Online"
                            : message === "Connecting..."
                              ? "Connecting..."
                              : "System Offline"}
                    </div>
                </div>
            </header>

            <main className="dashboard">
                <section className="hero">
                    <div className="hero-content">
                        <span className="welcome">
                            WELCOME TO HIMSAFE
                        </span>

                        <h1>
                            Stay Safe.
                            <br />
                            Stay <span>Connected.</span>
                        </h1>

                        <p>
                            Your personal safety companion for emergencies,
                            location tracking and quick access to help.
                        </p>

                        <div className="location-box">
                            <span>📍</span>
                            <div>
                                <small>Current Location</small>
                                <strong>{location}</strong>
                            </div>
                        </div>
                    </div>

                    <div
                        className={`sos-card ${
                            sosActive ? "sos-active" : ""
                        }`}
                    >
                        <div className="sos-ring">
                            <button
                                className="sos-button"
                                onClick={handleSOS}
                                disabled={sosLoading || sosActive}
                            >
                                {sosLoading ? "..." : "SOS"}
                            </button>
                        </div>

                        <h2>
                            {sosActive
                                ? "Emergency Activated"
                                : "Emergency SOS"}
                        </h2>

                        <p>
                            {sosActive
                                ? "Your emergency alert has been sent to the HimSafe server."
                                : "Press only in an emergency to get immediate help."}
                        </p>

                        {sosMessage && (
                            <div className="sos-message" role="status">
                                {sosMessage}
                            </div>
                        )}

                        {sosActive && (
                            <>
                                <div className="sos-location">
                                    <span>📍</span>
                                    <div>
                                        <small>
                                            {tracking
                                                ? "Live Emergency Location"
                                                : "Emergency Location"}
                                        </small>
                                        <strong>
                                            {sosLocation || "Detecting..."}
                                        </strong>
                                    </div>
                                </div>

                                {!tracking ? (
                                    <button
                                        className="emergency-button"
                                        onClick={startLiveTracking}
                                        disabled={resolving}
                                    >
                                        Start Live Tracking
                                    </button>
                                ) : (
                                    <button
                                        className="cancel-button"
                                        onClick={stopLiveTracking}
                                    >
                                        Stop Live Tracking
                                    </button>
                                )}

                                <button
                                    className="cancel-button"
                                    onClick={cancelSOS}
                                    disabled={resolving}
                                >
                                    {resolving
                                        ? "Resolving SOS..."
                                        : "Resolve / Cancel SOS"}
                                </button>
                            </>
                        )}

                        {!sosActive && (
                            <button
                                className="emergency-button"
                                onClick={handleSOS}
                                disabled={sosLoading}
                            >
                                {sosLoading
                                    ? "Sending SOS..."
                                    : "Activate Emergency"}
                            </button>
                        )}
                    </div>
                </section>

                <section className="quick-section">
                    <div className="section-heading">
                        <div>
                            <span>QUICK ACCESS</span>
                            <h2>Emergency Services</h2>
                        </div>
                        <p>Get help when you need it most.</p>
                    </div>

                    <div className="service-grid">
                        <div className="service-card">
                            <div className="service-icon">🚑</div>
                            <h3>Ambulance</h3>
                            <p>Medical emergency assistance</p>
                            <a href="tel:108" className="service-button">
                                Call 108
                            </a>
                        </div>

                        <div className="service-card">
                            <div className="service-icon">🚓</div>
                            <h3>Police</h3>
                            <p>Police and emergency assistance</p>
                            <a href="tel:112" className="service-button">
                                Call 112
                            </a>
                        </div>

                        <div className="service-card">
                            <div className="service-icon">🚒</div>
                            <h3>Fire Service</h3>
                            <p>Fire and rescue assistance</p>
                            <a href="tel:101" className="service-button">
                                Call 101
                            </a>
                        </div>

                        <div className="service-card">
                            <div className="service-icon">📍</div>
                            <h3>Live Location</h3>
                            <p>Share your current location</p>
                            <button
                                className="service-button"
                                onClick={handleShareLocation}
                            >
                                Share Location
                            </button>
                        </div>
                    </div>
                </section>

                <section className="history-section">
                    <div className="section-heading">
                        <div>
                            <span>EMERGENCY RECORDS</span>
                            <h2>SOS History</h2>
                        </div>

                        <p>
                            {sosHistory.length} saved alert
                            {sosHistory.length !== 1 ? "s" : ""}
                        </p>
                    </div>

                    {sosHistory.length === 0 ? (
                        <div className="empty-history">
                            <div>🛡️</div>
                            <h3>No SOS alerts yet</h3>
                            <p>
                                Your emergency alerts will appear here after
                                activation.
                            </p>
                        </div>
                    ) : (
                        <div className="history-list">
                            {sosHistory.map((alert, index) => (
                                <div
                                    className="history-card"
                                    key={alert.id || alert._id || index}
                                >
                                    <div className="history-icon">🚨</div>

                                    <div className="history-details">
                                        <div className="history-top">
                                            <h3>SOS Alert</h3>
                                            <span className="history-status">
                                                {alert.status}
                                            </span>
                                        </div>

                                        <p>
                                            📍{" "}
                                            {Number(
                                                alert.latitude
                                            ).toFixed(5)}
                                            ,{" "}
                                            {Number(
                                                alert.longitude
                                            ).toFixed(5)}
                                        </p>

                                        <small>
                                            {alert.createdAt
                                                ? new Date(
                                                      alert.createdAt
                                                  ).toLocaleString()
                                                : "Date unavailable"}
                                        </small>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="map-preview">
                    <div className="map-header">
                        <div>
                            <span>SAFETY MAP</span>
                            <h2>Find Help Near You</h2>
                        </div>
                    </div>

                    <HimSafeMap />
                </section>
            </main>

            <footer>
                <p>© 2026 HimSafe • Emergency Safety Platform</p>
                <p>HimSafe API: {message}</p>
            </footer>
        </div>
    );
}

export default App;