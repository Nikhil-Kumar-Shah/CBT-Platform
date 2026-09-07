import React from "react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Layers,
  BarChart3,
  Activity,
  ScrollText,
  Settings,
  CheckSquare,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";

interface SidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed = false,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const pathname = usePathname();

  // Only render inside admin routes
  if (!pathname?.startsWith("/admin")) return null;

  const isActive = (path: string) => {
    if (path === "/admin") {
      return pathname === "/admin" || pathname === "/admin/dashboard";
    }
    return pathname.startsWith(path);
  };

  const navItems = [
    {
      name: "Dashboard",
      path: "/admin",
      icon: LayoutDashboard,
      active: isActive("/admin"),
    },
    {
      name: "Tests",
      path: "/admin/tests",
      icon: FileText,
      active: isActive("/admin/tests"),
    },
    {
      name: "Test Series",
      path: "/admin/test-series",
      icon: Layers,
      active: isActive("/admin/test-series"),
    },
    {
      name: "Results",
      path: "/admin/results",
      icon: BarChart3,
      active: isActive("/admin/results"),
    },
    {
      name: "System Health",
      path: "/admin/health",
      icon: Activity,
      active: isActive("/admin/health"),
    },
    {
      name: "Audit",
      path: "/admin/audit",
      icon: ScrollText,
      active: isActive("/admin/audit"),
    },
    {
      name: "Settings",
      path: "/admin/settings",
      icon: Settings,
      active: isActive("/admin/settings"),
    },
  ];

  const handleNavClick = () => {
    if (isMobileOpen && onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <aside
      className={`admin-sidebar app-sidebar ${isCollapsed ? "collapsed" : ""} ${
        isMobileOpen ? "mobile-open" : ""
      }`}
    >
      {/* Brand Header */}
      <div className="sidebar-brand">
        <NextLink href="/admin" className="brand-link" onClick={handleNavClick} title="CBT Control">
          <div className="brand-icon-box">
            <CheckSquare size={19} color="#ffffff" strokeWidth={2.5} />
          </div>
          <div className="brand-text">
            <span className="brand-title">CBT Control</span>
            <span className="brand-subtitle">Exam Management</span>
          </div>
        </NextLink>

        {/* Mobile Close Button (<960px) */}
        {isMobileOpen && onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "0.4rem",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        )}

        {/* Desktop Collapse Toggle in Sidebar Header */}
        {!isCollapsed && onToggleCollapse && !isMobileOpen && (
          <button
            type="button"
            onClick={onToggleCollapse}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-subtle)",
              cursor: "pointer",
              padding: "0.35rem",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "var(--transition)",
            }}
            title="Collapse sidebar (icons only)"
            aria-label="Collapse sidebar"
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-main)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-subtle)")}
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      {/* Primary Navigation */}
      <nav className="sidebar-nav">
        <div className="sidebar-nav-label">OPERATIONS</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NextLink
              key={item.path}
              href={item.path}
              prefetch={true}
              onClick={handleNavClick}
              className={`sidebar-nav-item ${item.active ? "active" : ""}`}
              title={isCollapsed ? item.name : undefined}
            >
              <Icon size={18} className="sidebar-nav-icon" />
              <span>{item.name}</span>
            </NextLink>
          );
        })}
      </nav>

      {/* Collapse / Expand Toggle Button in Footer */}
      {onToggleCollapse && !isMobileOpen && (
        <div className="sidebar-footer">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="sidebar-collapse-btn"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: isCollapsed ? "center" : "flex-start",
              gap: "0.65rem",
              padding: isCollapsed ? "0.65rem" : "0.65rem 0.85rem",
              background: "var(--bg-surface-elevated)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-md)",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "0.82rem",
              fontWeight: 500,
              transition: "var(--transition)",
            }}
          >
            {isCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            {!isCollapsed && <span>Collapse Sidebar</span>}
          </button>
        </div>
      )}
    </aside>
  );
};
