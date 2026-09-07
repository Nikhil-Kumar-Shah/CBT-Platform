"use client";

import React, { useEffect, useState } from "react";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, User } from "@/lib/api";
import {
  CheckSquare,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    api.getMe().then(setUser).catch(() => {});
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await api.logout();
      router.push("/login");
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  if (pathname === "/login") return null;

  return (
    <header
      style={{
        backgroundColor: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-color)",
        padding: "0.85rem 1.5rem",
        position: "sticky",
        top: 0,
        zIndex: 50,
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <NextLink
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            textDecoration: "none",
          }}
        >
          <div
            style={{
              background: "var(--gradient-ember)",
              padding: "0.45rem",
              borderRadius: "var(--radius-md)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 10px rgba(249, 115, 22, 0.3)",
            }}
          >
            <CheckSquare size={18} color="#ffffff" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-main)", letterSpacing: "-0.01em" }}>
              CBT Exam Center
            </div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              Official Examination Portal
            </div>
          </div>
        </NextLink>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <ThemeToggle />

          {user && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                <UserIcon size={14} />
                <span style={{ color: "var(--text-main)", fontWeight: 600 }}>
                  {user.display_name || user.username}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="btn btn-secondary btn-sm"
                title="Log out"
              >
                <LogOut size={13} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
