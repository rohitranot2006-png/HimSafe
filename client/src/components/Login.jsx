
import { useState } from "react";
import "./Login.css";

function Login({ onLogin, onShowRegister }) {
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(event) {
        event.preventDefault();
        setError("");
        setLoading(true);

        try {
            await onLogin({ phone: phone.trim(), password });
        } catch (err) {
            setError(
                err.response?.data?.message ||
                "Unable to log in. Please try again."
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="login-page">
            <section className="login-card">
                <div className="login-brand">
                    <div className="login-logo">H</div>
                    <h1>HimSafe</h1>
                    <p>Your safety, our priority.</p>
                </div>

                <h2>Welcome back</h2>
                <p className="login-subtitle">
                    Sign in using your registered mobile number.
                </p>

                <form onSubmit={handleSubmit}>
                    <label htmlFor="login-phone">Mobile number</label>
                    <input
                        id="login-phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="e.g. +919876543210"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        maxLength={20}
                        required
                    />

                    <label htmlFor="login-password">Password</label>
                    <input
                        id="login-password"
                        type="password"
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                    />

                    {error && (
                        <p className="login-error" role="alert">
                            {error}
                        </p>
                    )}

                    <button type="submit" disabled={loading}>
                        {loading ? "Signing in..." : "Sign In"}
                    </button>
                </form>

                <p className="login-register">
                    New to HimSafe?{" "}
                    <button
                        type="button"
                        className="login-link"
                        onClick={onShowRegister}
                    >
                        Create an account
                    </button>
                </p>

                <p className="login-security">
                    Authorized responders use this same login.
                    Dashboard access depends on your account role.
                </p>
            </section>
        </main>
    );
}

export default Login;
