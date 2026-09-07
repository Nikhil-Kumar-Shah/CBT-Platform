"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  LogOut,
  User as UserIcon,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { ThemeToggle } from "./ThemeToggle";

interface AdminHeaderProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenMobile: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  isCollapsed,
  onToggleCollapse,
  onOpenMobile,
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e) {
      console.error("Logout failed", e);
    } finally {
      router.replace("/login");
    }
  };

  // Human-readable title based on current admin route
  const getSectionTitle = () => {
    if (!pathname || pathname === "/admin" || pathname === "/admin/dashboard") return "Dashboard";
    if (pathname.startsWith("/admin/tests/new")) return "Create Examination";
    if (pathname.startsWith("/admin/tests/")) return "Examination Studio";
    if (pathname.startsWith("/admin/tests")) return "Examinations";
    if (pathname.startsWith("/admin/test-series")) return "Test Series";
    if (pathname.startsWith("/admin/results")) return "Performance Analytics";
    if (pathname.startsWith("/admin/health")) return "System Health & Diagnostics";
    if (pathname.startsWith("/admin/audit")) return "Universal Audit Timeline";
    if (pathname.startsWith("/admin/settings")) return "System Settings";
    if (pathname.startsWith("/admin/subjects")) return "Subjects & Syllabus";
    return "Admin Console";
  };

  return (
    <header className="admin-header">
      {/* Left Area: Mobile Menu & Location */}
      <div className="admin-header-left">
        {/* Mobile Hamburger Toggle */}
        <button
          type="button"
          onClick={onOpenMobile}
          className="admin-header-mobile-btn"
          aria-label="Open navigation drawer"
          title="Open navigation menu"
        >
          <Menu size={20} />
        </button>

        {/* Current Location Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              fontSize: "0.95rem",
              fontWeight: 600,
              color: "var(--text-main)",
              letterSpacing: "-0.01em",
            }}
          >
            {getSectionTitle()}
          </span>
        </div>
      </div>

      {/* Right Area: System Status, Theme Toggle, User Profile & Quick Logout */}
      <div className="admin-header-right">
        {/* System Status Pill */}
        <div className="admin-header-status-pill" title="All critical backend and database subsystems operational">
          <span className="admin-header-status-dot" />
          <span>Operational</span>
        </div>

        {/* Prominent Theme Toggle */}
        <div style={{ display: "flex", alignItems: "center" }} title="Switch between Light and Dark mode">
          <ThemeToggle />
        </div>

        {/* User Profile Chip */}
        {user && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: "0.3rem 0.65rem",
              borderRadius: "var(--radius-full)",
              background: "var(--bg-surface-elevated)",
              border: "1px solid var(--border-color)",
            }}
          >
            <div className="user-avatar" style={{ width: "26px", height: "26px", fontSize: "0.75rem" }}>
              {(user.display_name || user.username || "A")[0].toUpperCase()}
            </div>
            <span
              style={{
                fontSize: "0.82rem",
                fontWeight: 600,
                color: "var(--text-main)",
                maxWidth: "120px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {user.display_name || user.username}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign out of admin portal"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                padding: "2px",
                borderRadius: "var(--radius-sm)",
                transition: "var(--transition)",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--danger)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-muted)")}
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
