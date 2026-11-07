
import { useEffect, useState } from "react";
import api from "./services/api";
import Login from "./components/Login";
import Register from "./components/Register";
import App from "./App";
import EmergencyDashboard from "./components/EmergencyDashboard";
import EmergencyReports from "./components/EmergencyReports";

function AuthRoot() {
    const [user, setUser] = useState(null);
    const [page, setPage] = useState("login");
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        let cancelled = false;

        async function restoreSession() {
            const token = localStorage.getItem("himsafe_token");

            if (!token) {
                if (!cancelled) setChecking(false);
                return;
            }

            try {
                const response = await api.get("/auth/me");

                if (!cancelled) {
                    const currentUser = response.data.user;
                    setUser(currentUser);
                    localStorage.setItem(
                        "himsafe_user",
                        JSON.stringify(currentUser)
                    );
                }
            } catch {
                localStorage.removeItem("himsafe_token");
                localStorage.removeItem("himsafe_user");
            } finally {
                if (!cancelled) setChecking(false);
            }
        }

        restoreSession();

        return () => {
            cancelled = true;
        };
    }, []);

    async function handleLogin(credentials) {
        const response = await api.post("/auth/login", credentials);
        const { token, user: loggedInUser } = response.data;

        if (!token || !loggedInUser) {
            throw new Error("Invalid login response");
        }

        localStorage.setItem("himsafe_token", token);
        localStorage.setItem(
            "himsafe_user",
            JSON.stringify(loggedInUser)
        );

        setUser(loggedInUser);
    }

    async function handleRegister(details) {
        await api.post("/auth/register", details);
        setPage("login");
    }

    function handleLogout() {
        localStorage.removeItem("himsafe_token");
        localStorage.removeItem("himsafe_user");
        setUser(null);
        setPage("login");
        window.history.replaceState({}, "", "/");
    }

    if (checking) {
        return (
            <main style={{ padding: 40, textAlign: "center" }}>
                Checking your HimSafe session...
            </main>
        );
    }

    if (!user) {
        return page === "register" ? (
            <Register
                onRegister={handleRegister}
                onShowLogin={() => setPage("login")}
            />
        ) : (
            <Login
                onLogin={handleLogin}
                onShowRegister={() => setPage("register")}
            />
        );
    }

    const path = window.location.pathname;

    if (user.role === "responder") {
        if (path === "/reports") {
            return (
                <ResponderPage
                    title="Emergency Reports"
                    onLogout={handleLogout}
                >
                    <EmergencyReports />
                </ResponderPage>
            );
        }

        return (
            <ResponderPage
                title="Responder Dashboard"
                onLogout={handleLogout}
            >
                <EmergencyDashboard />
            </ResponderPage>
        );
    }

    if (path === "/dashboard" || path === "/reports") {
        window.history.replaceState({}, "", "/");
    }

    return <UserPage user={user} onLogout={handleLogout} />;
}

function ResponderPage({ title, onLogout, children }) {
    return (
        <>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 20px",
                    background: "#102a43",
                    color: "white",
                    flexWrap: "wrap",
                }}
            >
                <strong>{title}</strong>
                <button type="button" onClick={onLogout}>
                    Sign out
                </button>
            </div>
            {children}
        </>
    );
}

function UserPage({ user, onLogout }) {
    return (
        <>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 20px",
                    background: "#102a43",
                    color: "white",
                    flexWrap: "wrap",
                }}
            >
                <span>
                    Signed in as {user.name}
                    {user.phone ? ` · ${user.phone}` : ""}
                </span>
                <button type="button" onClick={onLogout}>
                    Sign out
                </button>
            </div>
            <App />
        </>
    );
}

export default AuthRoot;
