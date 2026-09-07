"use client";

import React from "react";
import { useTheme } from "./ThemeProvider";
import { Sun, Moon } from "lucide-react";

interface ThemeToggleProps {
  className?: string;
  style?: React.CSSProperties;
  showLabel?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className = "",
  style,
  showLabel = false,
}) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`icon-btn ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.45rem",
        padding: showLabel ? "0.4rem 0.8rem" : undefined,
        width: showLabel ? "auto" : "36px",
        height: "36px",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-surface-elevated)",
        border: "1px solid var(--border-color)",
        color: "var(--text-muted)",
        cursor: "pointer",
        transition: "var(--transition)",
        ...style,
      }}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "Light" : "Dark"} mode`}
    >
      {theme === "dark" ? (
        <Sun size={17} style={{ color: "var(--amber-400)", transition: "transform 0.2s ease" }} />
      ) : (
        <Moon size={17} style={{ color: "var(--primary-500)", transition: "transform 0.2s ease" }} />
      )}
      {showLabel && (
        <span style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--text-main)" }}>
          {theme === "dark" ? "Light" : "Dark"}
        </span>
      )}
    </button>
  );
};
