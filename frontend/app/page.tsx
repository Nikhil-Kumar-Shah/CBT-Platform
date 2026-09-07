"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckSquare,
  ArrowRight,
  ShieldCheck,
  GraduationCap,
  Sparkles,
  Lock,
  Clock,
  Zap,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function HomePage() {
  const router = useRouter();
  const [accessCode, setAccessCode] = useState("");

  const handleQuickEnter = (e: React.FormEvent) => {
    e.preventDefault();
    let clean = accessCode.trim().toUpperCase();
    if (clean.includes("CODE=")) {
      try {
        const url = new URL(clean.startsWith("HTTP") ? clean : `http://dummy.com/${clean}`);
        const c = url.searchParams.get("code");
        if (c) clean = c.trim().toUpperCase();
      } catch {}
    }
    if (clean) {
      router.push(`/exam?code=${encodeURIComponent(clean)}`);
    } else {
      router.push("/exam");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-main)",
        color: "var(--text-main)",
        fontFamily: "var(--font-family)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {/* Radial gradient glow in background */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: "1200px",
          height: "450px",
          background: "var(--gradient-mesh)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Top Header */}
      <header
        style={{
          padding: "1.25rem 2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border-color)",
          backdropFilter: "blur(10px)",
          position: "relative",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              background: "var(--gradient-ember)",
              borderRadius: "var(--radius-md)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 14px rgba(249, 115, 22, 0.35)",
            }}
          >
            <CheckSquare size={22} color="#ffffff" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1.1rem", letterSpacing: "-0.02em", color: "var(--text-main)" }}>
              CBT Exam Center
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              Official Examination Platform
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
          <ThemeToggle />
        </div>
      </header>

      {/* Hero Body */}
      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "3.5rem 1.5rem",
          position: "relative",
          zIndex: 5,
        }}
      >
        <div style={{ maxWidth: "720px", width: "100%", textAlign: "center" }}>
          {/* Signal Pill */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "rgba(249, 115, 22, 0.12)",
              border: "1px solid rgba(249, 115, 22, 0.3)",
              padding: "0.35rem 0.95rem",
              borderRadius: "9999px",
              fontSize: "0.82rem",
              color: "var(--ember-500)",
              fontWeight: 600,
              marginBottom: "1.75rem",
            }}
          >
            <Sparkles size={14} />
            <span>Secure Candidate Gateway • Live Session Delivery</span>
          </div>

          {/* Editorial Display Heading */}
          <h1
            className="display-title"
            style={{
              marginBottom: "1.25rem",
              color: "var(--text-main)",
            }}
          >
            Take your examination with{" "}
            <span
              style={{
                background: "var(--gradient-ember)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              absolute clarity
            </span>
          </h1>

          <p
            style={{
              fontSize: "1.05rem",
              color: "var(--text-muted)",
              marginBottom: "2.5rem",
              lineHeight: 1.6,
              maxWidth: "580px",
              margin: "0 auto 2.5rem auto",
            }}
          >
            Enter your authorized 6-character examination access code provided by your institute administrator to begin.
          </p>

          {/* Access Code Form Card */}
          <div
            className="card card-blade"
            style={{
              maxWidth: "520px",
              margin: "0 auto 3rem auto",
              padding: "2rem",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <form onSubmit={handleQuickEnter}>
              <div style={{ marginBottom: "1.25rem" }}>
                <label
                  htmlFor="home-code-input"
                  style={{
                    display: "block",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-subtle)",
                    marginBottom: "0.65rem",
                  }}
                >
                  Candidate Access Code
                </label>
                <input
                  id="home-code-input"
                  type="text"
                  placeholder="e.g. KP4B2X"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  className="form-control"
                  style={{
                    fontSize: "1.35rem",
                    fontWeight: 700,
                    letterSpacing: "0.15em",
                    textAlign: "center",
                    textTransform: "uppercase",
                    padding: "0.9rem",
                    borderRadius: "var(--radius-md)",
                    height: "54px",
                  }}
                  autoFocus
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  width: "100%",
                  height: "50px",
                  fontSize: "1rem",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                }}
              >
                <span>Enter Examination</span>
                <ArrowRight size={18} />
              </button>
            </form>
          </div>

          {/* Trust & Feature Badges */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1.25rem",
              textAlign: "left",
            }}
          >
            <div className="card" style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "var(--ember-500)", marginBottom: "0.5rem" }}>
                <Clock size={18} />
                <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)" }}>
                  Server Authoritative
                </span>
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
                Synced timers and server deadlines protect fairness against local device clock changes.
              </p>
            </div>

            <div className="card" style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "var(--primary-500)", marginBottom: "0.5rem" }}>
                <Zap size={18} />
                <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)" }}>
                  Instant Autosave
                </span>
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
                Every answer choice is securely recorded in real time with automatic offline retry queue.
              </p>
            </div>

            <div className="card" style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "var(--success)", marginBottom: "0.5rem" }}>
                <ShieldCheck size={18} />
                <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)" }}>
                  Integrity Monitored
                </span>
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
                Proctoring telemetry and browser blur events maintain institutional testing standards.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          padding: "1.25rem 2rem",
          borderTop: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "0.8rem",
          color: "var(--text-subtle)",
          position: "relative",
          zIndex: 10,
        }}
      >
        <span>CBT Examination System • Official Candidate Gateway</span>
        <Link
          href="/login"
          style={{
            color: "var(--text-subtle)",
            opacity: 0.4,
            transition: "opacity 0.2s ease, color 0.2s ease",
            display: "inline-flex",
            alignItems: "center",
            padding: "4px",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "0.9";
            (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "0.4";
            (e.currentTarget as HTMLElement).style.color = "var(--text-subtle)";
          }}
          title="System Administration"
          aria-label="System Administration"
        >
          <Lock size={13} />
        </Link>
      </footer>
    </div>
  );
}
