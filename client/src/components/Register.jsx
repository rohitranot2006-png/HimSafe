
import { useState } from "react";
import "./Login.css";

function Register({ onRegister, onShowLogin }) {
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    async function handleSubmit(event) {
        event.preventDefault();
        setError("");
        setMessage("");

        if (password.length < 8 || password.length > 72) {
            setError("Password must contain 8–72 characters.");
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);

        try {
            await onRegister({
                name: name.trim(),
                phone: phone.trim(),
                password,
            });
            setMessage("Account created. You can now sign in.");
        } catch (err) {
            setError(
                err.response?.data?.message ||
                "Unable to create your account. Please try again."
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

                <h2>Create your account</h2>
                <p className="login-subtitle">
                    Register with your mobile number.
                </p>

                <form onSubmit={handleSubmit}>
                    <label htmlFor="register-name">Full name</label>
                    <input
                        id="register-name"
                        type="text"
                        autoComplete="name"
                        placeholder="Enter your full name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        maxLength={100}
                        required
                    />

                    <label htmlFor="register-phone">Mobile number</label>
                    <input
                        id="register-phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="e.g. +919876543210"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        maxLength={20}
                        required
                    />

                    <label htmlFor="register-password">Password</label>
                    <input
                        id="register-password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        minLength={8}
                        maxLength={72}
                        required
                    />

                    <label htmlFor="register-confirm-password">
                        Confirm password
                    </label>
                    <input
                        id="register-confirm-password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="Enter your password again"
                        value={confirmPassword}
                        onChange={(event) =>
                            setConfirmPassword(event.target.value)
                        }
                        minLength={8}
                        maxLength={72}
                        required
                    />

                    {error && (
                        <p className="login-error" role="alert">
                            {error}
                        </p>
                    )}

                    {message && (
                        <p role="status" style={{ color: "#087e8b" }}>
                            {message}
                        </p>
                    )}

                    <button type="submit" disabled={loading}>
                        {loading ? "Creating account..." : "Create Account"}
                    </button>
                </form>

                <p className="login-register">
                    Already registered?{" "}
                    <button
                        type="button"
                        className="login-link"
                        onClick={onShowLogin}
                    >
                        Sign in
                    </button>
                </p>

                <p className="login-security">
                    This creates a standard user account. Responder access
                    requires separate authorization.
                </p>
            </section>
        </main>
    );
}

export default Register;
