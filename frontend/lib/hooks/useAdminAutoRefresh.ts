"use client";

import { useEffect, useRef } from "react";

interface UseAdminAutoRefreshOptions {
  intervalMs?: number;
  enabled?: boolean;
  onRefresh: () => Promise<void> | void;
}

/**
 * Custom hook for silent, non-disruptive background auto-refresh in the admin console.
 * - Automatically pauses polling when the browser tab is hidden or backgrounded.
 * - Triggers an immediate silent refresh when the user returns to the tab.
 * - Preserves scroll position, active input focus, active tabs, and modals without flashing spinners.
 */
export function useAdminAutoRefresh({
  intervalMs = 6000,
  enabled = true,
  onRefresh,
}: UseAdminAutoRefreshOptions) {
  const refreshCallbackRef = useRef(onRefresh);
  refreshCallbackRef.current = onRefresh;

  const isRefreshingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const executeSilentRefresh = async () => {
      if (document.hidden || isRefreshingRef.current) return;
      isRefreshingRef.current = true;
      try {
        await refreshCallbackRef.current();
      } catch (err) {
        // Silent error logging to avoid interrupting administrative tasks
        console.debug("Background silent refresh caught error:", err);
      } finally {
        isRefreshingRef.current = false;
      }
    };

    // 1. Recurring background timer
    const interval = setInterval(executeSilentRefresh, intervalMs);

    // 2. Visibility change listener (revalidate on tab focus)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        executeSilentRefresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
