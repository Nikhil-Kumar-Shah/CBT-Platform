"use client";

import React, { useState, useEffect, useRef, memo } from "react";
import { Clock } from "lucide-react";

interface ExamTimerProps {
  expiresAtMs: number;
  serverOffsetMs: number;
  isPaused?: boolean;
  onExpire?: () => void;
  className?: string;
}

function formatTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "--:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

export const ExamTimer = memo(function ExamTimer({
  expiresAtMs,
  serverOffsetMs,
  isPaused = false,
  onExpire,
  className = "",
}: ExamTimerProps) {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(() => {
    if (!expiresAtMs || !Number.isFinite(expiresAtMs) || expiresAtMs <= 0) return null;
    const serverNow = Date.now() + (Number.isFinite(serverOffsetMs) ? serverOffsetMs : 0);
    return Math.max(0, Math.floor((expiresAtMs - serverNow) / 1000));
  });

  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    if (!expiresAtMs || !Number.isFinite(expiresAtMs)) return;

    const tick = () => {
      if (isPaused) return;

      const currentOffset = Number.isFinite(serverOffsetMs) ? serverOffsetMs : 0;
      const serverNow = Date.now() + currentOffset;
      const left = Math.max(0, Math.floor((expiresAtMs - serverNow) / 1000));

      setSecondsRemaining(left);

      if (left <= 0 && expiresAtMs > 0 && serverNow >= expiresAtMs) {
        if (!hasExpiredRef.current) {
          hasExpiredRef.current = true;
          onExpireRef.current?.();
        }
      }
    };

    // Immediate tick
    tick();

    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAtMs, serverOffsetMs, isPaused]);

  const isCritical = secondsRemaining !== null && secondsRemaining > 0 && secondsRemaining <= 300; // <= 5 minutes
  const isUrgent = secondsRemaining !== null && secondsRemaining > 0 && secondsRemaining <= 60; // <= 1 minute

  return (
    <div
      className={`exam-timer-badge ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.4rem 0.85rem",
        borderRadius: "20px",
        fontSize: "0.95rem",
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
        background: isPaused
          ? "rgba(234, 179, 8, 0.15)"
          : isUrgent
          ? "rgba(239, 68, 68, 0.25)"
          : isCritical
          ? "rgba(245, 158, 11, 0.2)"
          : "rgba(99, 102, 241, 0.12)",
        color: isPaused
          ? "#facc15"
          : isUrgent
          ? "#f87171"
          : isCritical
          ? "#fbbf24"
          : "#a5b4fc",
        border: `1px solid ${
          isPaused
            ? "rgba(234, 179, 8, 0.35)"
            : isUrgent
            ? "rgba(239, 68, 68, 0.4)"
            : isCritical
            ? "rgba(245, 158, 11, 0.35)"
            : "rgba(99, 102, 241, 0.25)"
        }`,
        transition: "background 0.3s ease, color 0.3s ease",
      }}
      title={isPaused ? "Examination Paused by Admin" : "Authoritative Time Remaining"}
    >
      <Clock size={16} className={isUrgent ? "animate-pulse" : ""} />
      <span>{isPaused ? `PAUSED (${formatTime(secondsRemaining)})` : formatTime(secondsRemaining)}</span>
    </div>
  );
});
