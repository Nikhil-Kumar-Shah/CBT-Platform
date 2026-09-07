"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";
import { ThemeToggle } from "../ThemeToggle";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  showThemeToggle?: boolean;
  style?: React.CSSProperties;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  badge,
  actions,
  showThemeToggle = false,
  style,
}) => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: "2rem",
        paddingBottom: "1.25rem",
        borderBottom: "1px solid var(--border-color)",
        flexWrap: "wrap",
        gap: "1rem",
        ...style,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "var(--text-main)", letterSpacing: "-0.02em" }}>
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p style={{ margin: "0.35rem 0 0 0", color: "var(--text-muted)", fontSize: "0.92rem", lineHeight: 1.5 }}>
            {subtitle}
          </p>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        {actions}
        {showThemeToggle && <ThemeToggle />}
      </div>
    </div>
  );
};

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  align?: "left" | "center" | "right";
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  style?: React.CSSProperties;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  loading = false,
  emptyMessage = "No records found.",
  style,
}: DataTableProps<T>) {
  return (
    <div className="table-container" style={{ ...style }}>
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{
                    textAlign: c.align || "left",
                    width: c.width,
                  }}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-subtle)" }}>
                  Loading table data...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-subtle)" }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((item) => (
                <tr key={keyExtractor(item)}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      style={{
                        textAlign: c.align || "left",
                        width: c.width,
                      }}
                    >
                      {c.render ? c.render(item) : (item as any)[c.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  style?: React.CSSProperties;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  pages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  style,
}) => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0.85rem 1.25rem",
        background: "var(--bg-surface-elevated)",
        borderTop: "1px solid var(--border-color)",
        flexWrap: "wrap",
        gap: "0.75rem",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
        <span>
          Total: <strong style={{ color: "var(--text-main)" }}>{total.toLocaleString()}</strong>
        </span>
        {onPageSizeChange && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="form-select"
              style={{
                padding: "0.2rem 0.5rem",
                fontSize: "0.8rem",
                width: "auto",
                height: "28px",
              }}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          leftIcon={<ChevronLeft size={14} />}
        >
          Previous
        </Button>
        <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", padding: "0 0.5rem" }}>
          {page} / {pages || 1}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(Math.min(pages, page + 1))}
          disabled={page >= pages}
          rightIcon={<ChevronRight size={14} />}
        >
          Next
        </Button>
      </div>
    </div>
  );
};
