import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";

export interface IntegrityEventPayload {
  event_type: string;
  client_timestamp?: string;
  duration_seconds?: number;
  metadata_json?: string;
  session_id?: string;
}

interface UseExamIntegrityOptions {
  inactivityThresholdSeconds?: number;
  flushIntervalMs?: number;
}

export function useExamIntegrity(
  attemptId: string | undefined,
  sessionId: string | undefined,
  isExamActive: boolean,
  options?: UseExamIntegrityOptions
) {
  const inactivityThreshold = options?.inactivityThresholdSeconds ?? 60;
  const flushIntervalMs = options?.flushIntervalMs ?? 10000;

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isDuplicateTab, setIsDuplicateTab] = useState<boolean>(false);
  const [isInactiveWarning, setIsInactiveWarning] = useState<boolean>(false);

  const eventQueueRef = useRef<IntegrityEventPayload[]>([]);
  const isFlushingRef = useRef<boolean>(false);

  const lastActivityTimeRef = useRef<number>(Date.now());
  const inactiveStartRef = useRef<number | null>(null);
  const blurStartRef = useRef<number | null>(null);
  const fullscreenExitStartRef = useRef<number | null>(null);
  const offlineStartRef = useRef<number | null>(null);

  // Helper to enqueue event
  const enqueueEvent = useCallback(
    (
      eventType: string,
      durationSeconds?: number,
      metadata?: Record<string, any>
    ) => {
      if (!attemptId) return;

      const event: IntegrityEventPayload = {
        event_type: eventType.toUpperCase(),
        client_timestamp: new Date().toISOString(),
        duration_seconds:
          durationSeconds !== undefined ? Math.round(durationSeconds * 10) / 10 : undefined,
        metadata_json: metadata ? JSON.stringify(metadata) : undefined,
        session_id: sessionId || undefined,
      };

      eventQueueRef.current.push(event);

      // Auto-flush if queue reaches threshold
      if (eventQueueRef.current.length >= 5) {
        flushQueue();
      }
    },
    [attemptId, sessionId]
  );

  // Flush queued events to backend
  const flushQueue = useCallback(async () => {
    if (!attemptId || eventQueueRef.current.length === 0 || isFlushingRef.current) {
      return;
    }

    const batch = [...eventQueueRef.current];
    eventQueueRef.current = [];
    isFlushingRef.current = true;

    try {
      await api.recordIntegrityEvents(attemptId, { events: batch });
    } catch (err) {
      // Re-queue failed events (up to a safe max to avoid memory growth)
      console.warn("[Integrity] Non-blocking event flush error (re-queuing)", err);
      eventQueueRef.current = [...batch, ...eventQueueRef.current].slice(-30);
    } finally {
      isFlushingRef.current = false;
    }
  }, [attemptId]);

  // Beacon flush on unload / tab close
  const flushWithBeacon = useCallback(() => {
    if (!attemptId || eventQueueRef.current.length === 0) return;

    const batch = [...eventQueueRef.current];
    eventQueueRef.current = [];

    const url = `/api/v1/attempts/${attemptId}/integrity-events`;
    const payload = JSON.stringify({ events: batch });

    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      const sent = navigator.sendBeacon(url, blob);
      if (!sent) {
        // Fallback to fetch with keepalive
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } else {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  }, [attemptId]);

  // Request fullscreen helper
  const requestFullscreen = useCallback(async () => {
    try {
      if (typeof document !== "undefined" && !document.fullscreenElement) {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        }
      }
    } catch (e) {
      console.warn("[Integrity] Fullscreen request not permitted or cancelled", e);
    }
  }, []);

  // 1. Initial page load / refresh detection
  useEffect(() => {
    if (!attemptId || !isExamActive) return;

    try {
      const refreshKey = `cbt_exam_seen_${attemptId}`;
      const hasSeen = sessionStorage.getItem(refreshKey);
      if (hasSeen) {
        enqueueEvent("PAGE_REFRESHED", undefined, {
          referrer: typeof document !== "undefined" ? document.referrer : "",
        });
      } else {
        sessionStorage.setItem(refreshKey, "true");
      }
    } catch (e) {
      // Storage unavailable or blocked
    }
  }, [attemptId, isExamActive, enqueueEvent]);

  // 2. Fullscreen monitoring
  useEffect(() => {
    if (!isExamActive) return;

    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);

      if (!isFs) {
        // Candidate left fullscreen
        fullscreenExitStartRef.current = Date.now();
      } else {
        // Candidate entered fullscreen
        if (fullscreenExitStartRef.current) {
          const durationSec = (Date.now() - fullscreenExitStartRef.current) / 1000;
          enqueueEvent("FULLSCREEN_EXITED", durationSec);
          fullscreenExitStartRef.current = null;
        }
      }
    };

    setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      if (fullscreenExitStartRef.current) {
        const durationSec = (Date.now() - fullscreenExitStartRef.current) / 1000;
        enqueueEvent("FULLSCREEN_EXITED", durationSec);
        fullscreenExitStartRef.current = null;
      }
    };
  }, [isExamActive, enqueueEvent]);

  // 3. Tab switch & visibility monitoring
  useEffect(() => {
    if (!isExamActive) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        blurStartRef.current = Date.now();
        // Trigger quick non-blocking flush when hidden
        flushWithBeacon();
      } else {
        if (blurStartRef.current) {
          const durationSec = (Date.now() - blurStartRef.current) / 1000;
          enqueueEvent("TAB_SWITCHED", durationSec, {
            visibility_state: document.visibilityState,
          });
          blurStartRef.current = null;
        }
      }
    };

    const handleBlur = () => {
      if (!blurStartRef.current) {
        blurStartRef.current = Date.now();
      }
    };

    const handleFocus = () => {
      if (blurStartRef.current) {
        const durationSec = (Date.now() - blurStartRef.current) / 1000;
        enqueueEvent("TAB_SWITCHED", durationSec, { type: "window_focus" });
        blurStartRef.current = null;
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);

      if (blurStartRef.current) {
        const durationSec = (Date.now() - blurStartRef.current) / 1000;
        enqueueEvent("TAB_SWITCHED", durationSec);
        blurStartRef.current = null;
      }
    };
  }, [isExamActive, enqueueEvent, flushWithBeacon]);

  // 4. Concurrent / Multiple Tab Detection via BroadcastChannel
  useEffect(() => {
    if (!attemptId || !isExamActive || typeof BroadcastChannel === "undefined") return;

    const channelName = `cbt_exam_active_tab_${attemptId}`;
    const channel = new BroadcastChannel(channelName);

    channel.onmessage = (event) => {
      const data = event.data;
      if (data?.type === "PING") {
        // Another tab opened for this attempt! Reply with PONG
        channel.postMessage({ type: "PONG", senderSession: sessionId });
        setIsDuplicateTab(true);
        enqueueEvent("MULTIPLE_TAB_DETECTED", undefined, {
          trigger: "received_ping",
          other_session: data?.senderSession,
        });
      } else if (data?.type === "PONG") {
        // Received response from an existing open tab
        setIsDuplicateTab(true);
        enqueueEvent("MULTIPLE_TAB_DETECTED", undefined, {
          trigger: "received_pong",
          existing_session: data?.senderSession,
        });
      }
    };

    // Broadcast ping upon mounting to discover existing tabs
    channel.postMessage({ type: "PING", senderSession: sessionId });

    return () => {
      channel.close();
    };
  }, [attemptId, sessionId, isExamActive, enqueueEvent]);

  // 5. Inactivity detection
  useEffect(() => {
    if (!isExamActive) return;

    const recordUserActivity = () => {
      lastActivityTimeRef.current = Date.now();
      if (inactiveStartRef.current) {
        const durationSec = (Date.now() - inactiveStartRef.current) / 1000;
        enqueueEvent("INACTIVITY_ENDED", durationSec);
        inactiveStartRef.current = null;
        setIsInactiveWarning(false);
      }
    };

    const interval = setInterval(() => {
      const idleSec = (Date.now() - lastActivityTimeRef.current) / 1000;
      if (idleSec >= inactivityThreshold && !inactiveStartRef.current) {
        inactiveStartRef.current = Date.now();
        setIsInactiveWarning(true);
        enqueueEvent("INACTIVITY_WARNING", idleSec);
      }
    }, 5000);

    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, recordUserActivity, { passive: true }));

    return () => {
      clearInterval(interval);
      events.forEach((ev) => window.removeEventListener(ev, recordUserActivity));
      if (inactiveStartRef.current) {
        const durationSec = (Date.now() - inactiveStartRef.current) / 1000;
        enqueueEvent("INACTIVITY_ENDED", durationSec);
        inactiveStartRef.current = null;
      }
    };
  }, [isExamActive, inactivityThreshold, enqueueEvent]);

  // 6. Network connectivity monitoring
  useEffect(() => {
    if (!isExamActive) return;

    const handleOffline = () => {
      offlineStartRef.current = Date.now();
      enqueueEvent("NETWORK_DISCONNECTED");
    };

    const handleOnline = () => {
      const durationSec = offlineStartRef.current
        ? (Date.now() - offlineStartRef.current) / 1000
        : undefined;
      offlineStartRef.current = null;
      enqueueEvent("NETWORK_RECONNECTED", durationSec);
      flushQueue();
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [isExamActive, enqueueEvent, flushQueue]);

  // 7. Periodic flush and unload flush
  useEffect(() => {
    if (!isExamActive) return;

    const interval = setInterval(() => {
      flushQueue();
    }, flushIntervalMs);

    const handleBeforeUnload = () => {
      flushWithBeacon();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
      flushWithBeacon();
    };
  }, [isExamActive, flushIntervalMs, flushQueue, flushWithBeacon]);

  const resetInactivity = useCallback(() => {
    lastActivityTimeRef.current = Date.now();
    if (inactiveStartRef.current) {
      const durationSec = (Date.now() - inactiveStartRef.current) / 1000;
      enqueueEvent("INACTIVITY_ENDED", durationSec);
      inactiveStartRef.current = null;
    }
    setIsInactiveWarning(false);
  }, [enqueueEvent]);

  return {
    isFullscreen,
    isDuplicateTab,
    isInactiveWarning,
    requestFullscreen,
    resetInactivity,
    recordCustomEvent: enqueueEvent,
    flushNow: flushQueue,
  };
}
