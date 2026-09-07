"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { Sidebar } from "@/components/Sidebar";
import { AdminHeader } from "@/components/AdminHeader";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Sidebar Collapsed State with LocalStorage Persistence
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  // Mobile Drawer State (<960px)
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);

  useEffect(() => {
    // Load saved collapsed preference from localStorage
    try {
      const saved = localStorage.getItem("cbt_admin_sidebar_collapsed");
      if (saved === "true") {
        setIsCollapsed(true);
      }
    } catch (e) {
      // Ignore storage errors in restricted contexts
    }
  }, []);

  // Close mobile drawer whenever the user navigates to a different page
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("cbt_admin_sidebar_collapsed", next ? "true" : "false");
      } catch (e) {}
      return next;
    });
  };

  useEffect(() => {
    // If authentication verification is complete and user is not an authenticated ADMIN,
    // immediately redirect to the administrator login screen
    if (!loading && (!isAuthenticated || user?.role !== "ADMIN")) {
      router.replace("/login");
    }
  }, [loading, isAuthenticated, user, router]);

  // While validating session token with the backend, display a clean, centered loading state
  // with ZERO sidebar and ZERO reserved layout space.
  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--bg-main)",
          color: "var(--text-muted)",
          gap: "1.25rem",
          fontFamily: "var(--font-family)",
        }}
      >
        <div
          style={{
            width: "44px",
            height: "44px",
            border: "3px solid rgba(249, 115, 22, 0.2)",
            borderTopColor: "var(--ember-500)",
            borderRadius: "50%",
            animation: "adminGuardSpin 0.8s linear infinite",
          }}
        />
        <div style={{ fontSize: "0.92rem", fontWeight: 500, letterSpacing: "-0.01em", color: "var(--text-main)" }}>
          Verifying administrator credentials...
        </div>
        <style
          dangerouslySetInnerHTML={{
            __html: `
            @keyframes adminGuardSpin {
              to { transform: rotate(360deg); }
            }
          `,
          }}
        />
      </div>
    );
  }

  // If unauthenticated or role is not ADMIN, render nothing while redirect is executed
  // to guarantee that no sidebar or admin UI artifacts are ever flashed.
  if (!isAuthenticated || user?.role !== "ADMIN") {
    return null;
  }

  // Authenticated Admin Shell: Renders Collapsible Sidebar, Mobile Drawer Overlay, Top Header and Main Content
  return (
    <div className="admin-shell">
      <Sidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      {/* Mobile Drawer Backdrop Overlay */}
      {isMobileOpen && (
        <div
          className="admin-drawer-overlay"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Content Pane with Unified Admin Top Header */}
      <main className={`admin-main-content ${isCollapsed ? "collapsed" : ""}`}>
        <AdminHeader
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
          onOpenMobile={() => setIsMobileOpen(true)}
        />
        <div className="admin-page-body">{children}</div>
      </main>
    </div>
  );
}
