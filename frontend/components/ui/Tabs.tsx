"use client";

import React from "react";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  style?: React.CSSProperties;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onChange, style }) => {
  return (
    <div
      style={{
        display: "inline-flex",
        background: "var(--bg-surface-elevated)",
        padding: "0.25rem",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-color)",
        gap: "0.25rem",
        ...style,
      }}
    >
      {tabs.map((t) => {
        const isActive = t.id === activeTab;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.45rem 0.95rem",
              fontSize: "0.82rem",
              fontWeight: isActive ? 600 : 500,
              borderRadius: "var(--radius-sm)",
              border: "none",
              cursor: "pointer",
              transition: "var(--transition)",
              background: isActive ? "var(--bg-surface)" : "transparent",
              color: isActive ? "var(--text-main)" : "var(--text-muted)",
              boxShadow: isActive ? "var(--shadow-sm)" : "none",
              fontFamily: "var(--font-family)",
            }}
          >
            {t.icon}
            <span>{t.label}</span>
            {t.count !== undefined && (
              <span
                style={{
                  fontSize: "0.72rem",
                  padding: "0.1rem 0.4rem",
                  borderRadius: "var(--radius-full)",
                  background: isActive ? "var(--bg-surface-elevated)" : "var(--bg-sunken)",
                  color: isActive ? "var(--text-main)" : "var(--text-subtle)",
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
