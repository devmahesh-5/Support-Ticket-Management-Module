import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch {
      setError("Invalid username or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container d-flex align-items-center justify-content-center" style={{ minHeight: "100vh" }}>
      <div className="card shadow" style={{ width: "100%", maxWidth: "420px" }}>
        <div className="card-body p-4">
          <div className="text-center mb-4">
            <i className="bi bi-ticket-perforated text-primary" style={{ fontSize: "3rem" }}></i>
            <h3 className="mt-2">Support Ticket System</h3>
            <p className="text-muted small">Pulchowk Engineering Campus</p>
          </div>
          {error && <div className="alert alert-danger py-2">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label">Username</label>
              <input type="text" className="form-control" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
            </div>
            <div className="mb-3">
              <label className="form-label">Password</label>
              <input type="password" className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary w-100" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
          <div className="mt-3 small text-muted text-center">
            Use campus credentials to login
          </div>
        </div>
      </div>
    </div>
  );
}
