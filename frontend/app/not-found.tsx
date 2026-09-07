import React from "react";
import NextLink from "next/link";
import { FileQuestion, Home } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div
      style={{
        minHeight: "80vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <div className="card" style={{ maxWidth: "460px", width: "100%", padding: "2.5rem" }}>
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "rgba(99, 102, 241, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.25rem",
            color: "#818cf8",
          }}
        >
          <FileQuestion size={28} />
        </div>

        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          Page Not Found
        </h2>

        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.75rem", lineHeight: 1.5 }}>
          The requested page or examination link could not be located. Please check the URL or return to the main portal.
        </p>

        <NextLink
          href="/"
          className="btn btn-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
        >
          <Home size={16} />
          <span>Back to Home</span>
        </NextLink>
      </div>
    </div>
  );
}
