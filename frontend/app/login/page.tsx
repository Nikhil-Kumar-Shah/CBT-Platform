"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { CheckSquare, Lock, User, AlertCircle, Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(identifier, password);
      router.push("/admin/tests");
    } catch (err: any) {
      setError(err.detail || err.message || "Invalid username or password. Please verify credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        background: "var(--bg-main)",
        position: "relative",
      }}
    >
      {/* Top Header Controls: Back to Home link on left, ThemeToggle on right */}
      <div
        style={{
          position: "absolute",
          top: "1.5rem",
          left: "1.5rem",
          right: "1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <NextLink
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            color: "var(--text-muted)",
            fontSize: "0.85rem",
            fontWeight: 500,
            textDecoration: "none",
            padding: "0.4rem 0.75rem",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-color)",
            transition: "var(--transition)",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-main)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-muted)")}
        >
          <ArrowLeft size={15} />
          <span>Back to CBT Portal</span>
        </NextLink>

        <ThemeToggle />
      </div>

      <div
        className="card card-blade"
        style={{
          maxWidth: "420px",
          width: "100%",
          padding: "2.25rem",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              margin: "0 auto 1rem",
              background: "var(--gradient-ember)",
              borderRadius: "var(--radius-lg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 6px 16px rgba(249, 115, 22, 0.35)",
            }}
          >
            <CheckSquare size={24} color="#ffffff" strokeWidth={2.5} />
          </div>
          <h1 style={{ fontSize: "1.45rem", fontWeight: 700, color: "var(--text-main)", letterSpacing: "-0.02em", margin: 0 }}>
            Admin Login
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.86rem", marginTop: "0.35rem" }}>
            Sign in to manage examination papers, scheduling, and results.
          </p>
        </div>

        {error && (
          <div
            style={{
              backgroundColor: "var(--danger-bg)",
              border: "1px solid var(--danger-border)",
              color: "var(--danger)",
              borderRadius: "var(--radius-md)",
              padding: "0.85rem",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "1.25rem",
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: "1.1rem" }}>
            <label className="form-label" htmlFor="identifier">
              Username or Email
            </label>
            <div style={{ position: "relative" }}>
              <User
                size={16}
                style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-subtle)" }}
              />
              <input
                id="identifier"
                type="text"
                required
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="form-control"
                style={{ paddingLeft: "2.4rem" }}
                placeholder="Enter admin username or email"
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: "1.75rem" }}>
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <div style={{ position: "relative" }}>
              <Lock
                size={16}
                style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-subtle)" }}
              />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-control"
                style={{ paddingLeft: "2.4rem", paddingRight: "2.4rem" }}
                placeholder="Enter admin password"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-subtle)",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title={showPassword ? "Hide password" : "Show password"}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", padding: "0.8rem", fontSize: "0.92rem", fontWeight: 700 }}
            disabled={loading}
          >
            {loading ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : "Sign In to Admin"}
          </button>
        </form>
      </div>
    </div>
  );
}
