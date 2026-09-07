"use client";

import React from "react";
import NextLink from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items }) => {
  return (
    <nav aria-label="Breadcrumb" style={{ marginBottom: "1.25rem" }}>
      <ol style={{ display: "flex", alignItems: "center", gap: "0.4rem", listStyle: "none", padding: 0, margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <React.Fragment key={index}>
              {index > 0 && <ChevronRight size={14} color="var(--border-color)" style={{ flexShrink: 0 }} />}
              <li>
                {item.href && !isLast ? (
                  <NextLink
                    href={item.href}
                    style={{
                      color: "var(--text-muted)",
                      textDecoration: "none",
                      transition: "color 0.15s ease",
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.color = "var(--primary)")}
                    onMouseOut={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                  >
                    {item.label}
                  </NextLink>
                ) : (
                  <span style={{ color: isLast ? "var(--text-main)" : "var(--text-muted)", fontWeight: isLast ? 600 : 400 }}>
                    {item.label}
                  </span>
                )}
              </li>
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
};
