"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api, User, onUnauthorized, ApiError } from "@/lib/api";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (username_or_email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    try {
      const u = await api.getMe();
      setUser(u);
      return u;
    } catch (err: any) {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch of current user session
    refreshUser();

    // Listen for unauthorized events dispatched by API client
    const cleanup = typeof onUnauthorized === "function" ? onUnauthorized(() => {
      setUser(null);
      setLoading(false);
    }) : undefined;

    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, [refreshUser]);

  const login = useCallback(async (username_or_email: string, password: string): Promise<User> => {
    setLoading(true);
    try {
      const loggedInUser = await api.login(username_or_email, password);
      setUser(loggedInUser);
      return loggedInUser;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await api.logout();
    } catch (_) {
      // Clean up client state regardless of server logout response
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: Boolean(user),
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
