"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import NextLink from "next/link";
import {
  api,
  AccessCodeVerifyResponse,
} from "@/lib/api";
import {
  CheckSquare,
  Clock,
  HelpCircle,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Wifi,
  FileText,
  User as UserIcon,
  Layers,
  Calendar,
  BookOpen,
  Award,
  Loader2,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function StudentExamEntryPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            background: "var(--bg-main)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-main)",
            fontFamily: "var(--font-family)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "var(--primary-500)" }} />
            <span>Loading Examination Gateway...</span>
          </div>
        </div>
      }
    >
      <StudentExamEntryContent />
    </Suspense>
  );
}

function StudentExamEntryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Form State
  const [accessCode, setAccessCode] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidatePhone, setCandidatePhone] = useState("");
  const [candidateRoll, setCandidateRoll] = useState("");
  const [declarationChecked, setDeclarationChecked] = useState(false);

  // Status & Verification State
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [testDetails, setTestDetails] = useState<AccessCodeVerifyResponse | null>(null);

  // Lobby State & Server-Authoritative Countdown
  const [lobbySecondsRemaining, setLobbySecondsRemaining] = useState<number | null>(null);
  const [isLobbyActive, setIsLobbyActive] = useState<boolean>(false);
  const serverOffsetMsRef = useRef<number>(0);
  const scheduledStartMsRef = useRef<number | null>(null);
  const autoStartedRef = useRef<boolean>(false);

  // Resume State
  const [resumableAttempt, setResumableAttempt] = useState<{
    attemptId: string;
    sessionId?: string;
    testTitle?: string;
  } | null>(null);

  // Starting State
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Load saved candidate info from localStorage
  useEffect(() => {
    try {
      const savedName = localStorage.getItem("cbt_candidate_name");
      const savedEmail = localStorage.getItem("cbt_candidate_email");
      const savedPhone = localStorage.getItem("cbt_candidate_phone");
      const savedRoll = localStorage.getItem("cbt_candidate_roll");
      if (savedName) setCandidateName(savedName);
      if (savedEmail) setCandidateEmail(savedEmail);
      if (savedPhone) setCandidatePhone(savedPhone);
      if (savedRoll) setCandidateRoll(savedRoll);
    } catch {}
  }, []);

  // Update lobby countdown helper
  const updateLobbyTimer = (details: AccessCodeVerifyResponse) => {
    const rawServerTime = details.server_now || details.server_time;
    const serverTimeMs = rawServerTime ? new Date(rawServerTime).getTime() : Date.now();
    const localNow = Date.now();
    const serverOffset = Number.isFinite(serverTimeMs) ? serverTimeMs - localNow : 0;
    serverOffsetMsRef.current = serverOffset;

    if (details.start_time) {
      const startMs = new Date(details.start_time).getTime();
      scheduledStartMsRef.current = startMs;
      const currentServerNow = localNow + serverOffset;
      const remSec = Math.max(0, Math.floor((startMs - currentServerNow) / 1000));
      if (remSec > 0 && details.is_lobby_open) {
        setIsLobbyActive(true);
        setLobbySecondsRemaining(remSec);
      } else {
        setIsLobbyActive(false);
        setLobbySecondsRemaining(0);
      }
    } else {
      setIsLobbyActive(false);
      setLobbySecondsRemaining(0);
    }
  };

  const candidateFormRef = useRef({ name: candidateName, email: candidateEmail, phone: candidatePhone });
  candidateFormRef.current = { name: candidateName, email: candidateEmail, phone: candidatePhone };

  // Countdown timer for pre-exam window
  useEffect(() => {
    if (!isLobbyActive || scheduledStartMsRef.current === null) return;

    const interval = setInterval(() => {
      const currentServerNow = Date.now() + serverOffsetMsRef.current;
      const targetMs = scheduledStartMsRef.current;
      if (targetMs === null) return;

      const remSec = Math.max(0, Math.floor((targetMs - currentServerNow) / 1000));
      setLobbySecondsRemaining(remSec);

      if (remSec <= 0) {
        setIsLobbyActive(false);
        clearInterval(interval);
        if (!autoStartedRef.current) {
          autoStartedRef.current = true;
          const formName = localStorage.getItem("cbt_candidate_name") || candidateFormRef.current.name;
          const formEmail = localStorage.getItem("cbt_candidate_email") || candidateFormRef.current.email;
          const formPhone = localStorage.getItem("cbt_candidate_phone") || candidateFormRef.current.phone;
          if (formName?.trim() && formEmail?.trim() && formPhone?.trim()) {
            handleStartExamDirect(formName.trim(), formEmail.trim(), formPhone.trim());
          }
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isLobbyActive]);

  // Read ?code= query param on mount
  useEffect(() => {
    const codeParam = searchParams.get("code");
    if (codeParam) {
      let clean = codeParam.trim().toUpperCase();
      if (clean.includes("CODE=")) {
        try {
          const url = new URL(clean.startsWith("HTTP") ? clean : `http://dummy.com/${clean}`);
          const c = url.searchParams.get("code");
          if (c) clean = c.trim().toUpperCase();
        } catch {}
      }
      setAccessCode(clean);
      api.verifyAccessCode(clean).then((details) => {
        setTestDetails(details);
        updateLobbyTimer(details);
        if (details.has_active_attempt && details.active_attempt_id) {
          setResumableAttempt({
            attemptId: details.active_attempt_id,
            sessionId: details.active_session_id,
            testTitle: details.title,
          });
        }
      }).catch((err: any) => {
        setVerifyError(err?.message || "Invalid or inaccessible examination access code.");
      });
    }
  }, [searchParams]);

  // Check localStorage for resumable attempt
  useEffect(() => {
    try {
      const storedAttemptId = localStorage.getItem("cbt_current_attempt_id");
      const storedSessionId = localStorage.getItem("cbt_current_session_id");
      const storedTestTitle = localStorage.getItem("cbt_current_test_title");
      if (storedAttemptId && storedSessionId) {
        setResumableAttempt({
          attemptId: storedAttemptId,
          sessionId: storedSessionId,
          testTitle: storedTestTitle || "In-Progress Examination",
        });
      }
    } catch (e) {}
  }, []);

  const handleVerifyCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    let cleanCode = accessCode.trim().toUpperCase();
    if (cleanCode.includes("CODE=")) {
      try {
        const url = new URL(cleanCode.startsWith("HTTP") ? cleanCode : `http://dummy.com/${cleanCode}`);
        const c = url.searchParams.get("code");
        if (c) cleanCode = c.trim().toUpperCase();
      } catch {}
    }

    if (!cleanCode || cleanCode.length < 3) {
      setVerifyError("Please enter a valid examination access code.");
      return;
    }

    setIsVerifying(true);
    setVerifyError(null);
    setStartError(null);

    try {
      const details = await api.verifyAccessCode(cleanCode);
      setTestDetails(details);
      updateLobbyTimer(details);

      if (details.has_active_attempt && details.active_attempt_id) {
        setResumableAttempt({
          attemptId: details.active_attempt_id,
          sessionId: details.active_session_id,
          testTitle: details.title,
        });
      }
    } catch (err: any) {
      setTestDetails(null);
      setVerifyError(err?.message || "We could not find an active examination with this access code. Please verify with your instructor.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleStartExamDirect = async (name: string, email: string, phone: string) => {
    if (!testDetails) return;
    setIsStarting(true);
    setStartError(null);

    try {
      localStorage.setItem("cbt_candidate_name", name);
      localStorage.setItem("cbt_candidate_email", email);
      localStorage.setItem("cbt_candidate_phone", phone);
      if (candidateRoll) localStorage.setItem("cbt_candidate_roll", candidateRoll);

      const resp = await api.startAttempt({
        access_code: accessCode.trim().toUpperCase(),
        candidate_name: name,
        candidate_email: email,
        candidate_phone: phone,
      });

      localStorage.setItem("cbt_current_attempt_id", resp.attempt_id);
      localStorage.setItem("cbt_current_session_id", resp.session_id);
      localStorage.setItem("cbt_current_test_title", testDetails.title);

      router.push(`/exam/${resp.attempt_id}`);
    } catch (err: any) {
      setIsStarting(false);
      setStartError(err?.message || "Could not launch examination session. Please try again.");
    }
  };

  const handleCandidateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateName.trim() || !candidateEmail.trim() || !candidatePhone.trim()) {
      setStartError("Please provide your full name, email, and phone number.");
      return;
    }
    if (!declarationChecked) {
      setStartError("You must read and confirm the examination declaration checkbox.");
      return;
    }
    handleStartExamDirect(candidateName.trim(), candidateEmail.trim(), candidatePhone.trim());
  };

  const formatCountdown = (totalSec: number) => {
    if (totalSec <= 0) return "00:00";
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const formatLocalTime = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
    } catch {
      return isoString;
    }
  };

  const formatLocalDate = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    } catch {
      return isoString;
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-main)",
        color: "var(--text-main)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-family)",
      }}
    >
      {/* Top Header */}
      <header
        style={{
          height: "64px",
          padding: "0 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border-color)",
          backgroundColor: "var(--bg-surface)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <NextLink
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              textDecoration: "none",
              color: "var(--text-muted)",
              fontSize: "0.85rem",
              fontWeight: 500,
              padding: "0.35rem 0.65rem",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-surface-elevated)",
              border: "1px solid var(--border-color)",
              transition: "var(--transition)",
            }}
          >
            <ArrowLeft size={15} />
            <span>Home</span>
          </NextLink>

          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                background: "var(--gradient-ember)",
                borderRadius: "var(--radius-md)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 8px rgba(249, 115, 22, 0.3)",
              }}
            >
              <CheckSquare size={17} color="#ffffff" strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-main)", letterSpacing: "-0.01em" }}>
                CBT Exam Portal
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                Candidate Gateway
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              fontSize: "0.75rem",
              color: "#10b981",
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              padding: "0.25rem 0.65rem",
              borderRadius: "var(--radius-full)",
              fontWeight: 600,
            }}
          >
            <Wifi size={13} />
            <span>System Ready</span>
          </div>

          <ThemeToggle />
        </div>
      </header>

      {/* Main Gateway Card Area */}
      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1.25rem 3rem",
        }}
      >
        <div style={{ width: "100%", maxWidth: testDetails ? "680px" : "440px" }}>
          {/* Active Attempt Banner */}
          {resumableAttempt && (
            <div
              style={{
                background: "rgba(124, 58, 237, 0.1)",
                border: "1px solid rgba(124, 58, 237, 0.3)",
                borderRadius: "var(--radius-lg)",
                padding: "1rem 1.25rem",
                marginBottom: "1.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--primary-400)" }}>
                  Active Examination Detected
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {resumableAttempt.testTitle}
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/exam/${resumableAttempt.attemptId}`)}
                className="btn btn-primary btn-sm"
                style={{ fontWeight: 700 }}
              >
                Resume Examination
              </button>
            </div>
          )}

          {/* STATE 1: Enter Access Code */}
          {!testDetails && (
            <div className="card card-blade" style={{ padding: "2.25rem", boxShadow: "var(--shadow-lg)" }}>
              <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
                <h1 style={{ fontSize: "1.45rem", fontWeight: 700, color: "var(--text-main)", margin: 0 }}>
                  Enter Access Code
                </h1>
                <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "0.45rem", lineHeight: 1.5 }}>
                  Enter your authorized 6-character examination access code provided by your institute administrator to begin.
                </p>
              </div>

              {verifyError && (
                <div
                  style={{
                    backgroundColor: "var(--danger-bg)",
                    border: "1px solid var(--danger-border)",
                    color: "var(--danger)",
                    borderRadius: "var(--radius-md)",
                    padding: "0.85rem",
                    fontSize: "0.85rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "1.25rem",
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{verifyError}</span>
                </div>
              )}

              <form onSubmit={handleVerifyCode}>
                <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                  <input
                    id="accessCode"
                    type="text"
                    value={accessCode}
                    onChange={(e) => {
                      let val = e.target.value.toUpperCase();
                      if (val.includes("CODE=")) {
                        try {
                          const url = new URL(val.startsWith("HTTP") ? val : `http://dummy.com/${val}`);
                          const c = url.searchParams.get("code");
                          if (c) val = c.toUpperCase();
                        } catch {}
                      }
                      setAccessCode(val.replace(/[^A-Z0-9-]/g, "").trim());
                      setVerifyError(null);
                    }}
                    placeholder="e.g. KP4B2X"
                    autoCapitalize="characters"
                    autoFocus
                    required
                    className="form-control"
                    style={{
                      minHeight: "48px",
                      fontSize: "1.2rem",
                      fontWeight: 700,
                      textAlign: "center",
                      letterSpacing: "0.1em",
                      fontFamily: "monospace",
                    }}
                  />
                  <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", textAlign: "center", marginTop: "0.4rem" }}>
                    Standard examination access codes are exactly 6 uppercase characters.
                  </div>
                </div>

                <button
                  id="verifyAccessCodeBtn"
                  type="submit"
                  disabled={isVerifying || !accessCode.trim()}
                  className="btn btn-primary"
                  style={{ width: "100%", padding: "0.85rem", fontSize: "0.95rem", fontWeight: 700 }}
                >
                  {isVerifying ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                      <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                      <span>Verifying Code...</span>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                      <span>Continue</span>
                      <ArrowRight size={16} />
                    </div>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* STATE 2: Full Unified Candidate Entry (Metadata + Instructions + Form) */}
          {testDetails && (
            <div className="card card-blade" style={{ padding: "2.25rem", boxShadow: "var(--shadow-lg)" }}>
              {/* Header: Title & Subject */}
              <div style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "1.25rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "var(--ember-500)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {testDetails.subject_name || "General Examination"}
                    </span>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-main)", margin: "0.2rem 0 0 0" }}>
                      {testDetails.title}
                    </h1>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setTestDetails(null);
                      setAccessCode("");
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-muted)",
                      fontSize: "0.78rem",
                      cursor: "pointer",
                      textDecoration: "underline",
                      padding: "0.2rem 0",
                    }}
                  >
                    Change Code
                  </button>
                </div>

                {/* Key Metadata Grid */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                    gap: "0.75rem",
                    marginTop: "1.1rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "var(--bg-surface-elevated)", padding: "0.5rem 0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
                    <Clock size={16} color="var(--primary-400)" />
                    <div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Duration</div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-main)" }}>{testDetails.duration_minutes} Mins</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "var(--bg-surface-elevated)", padding: "0.5rem 0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
                    <BookOpen size={16} color="var(--ember-500)" />
                    <div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Questions</div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-main)" }}>{testDetails.total_questions} Questions</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "var(--bg-surface-elevated)", padding: "0.5rem 0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
                    <Award size={16} color="#10b981" />
                    <div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Total Marks</div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-main)" }}>{testDetails.total_marks} Marks</div>
                    </div>
                  </div>
                </div>

                {/* Pre-Exam Scheduled Countdown & Status Banner */}
                {isLobbyActive && lobbySecondsRemaining !== null && lobbySecondsRemaining > 0 ? (
                  <div
                    style={{
                      marginTop: "1.1rem",
                      padding: "1rem 1.25rem",
                      borderRadius: "var(--radius-md)",
                      background: "rgba(245, 158, 11, 0.12)",
                      border: "1.5px solid var(--warning)",
                      color: "var(--text-main)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Clock size={18} color="var(--warning)" />
                        <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--warning)" }}>
                          Your examination hasn't started yet
                        </span>
                      </div>
                      <div style={{ fontFamily: "monospace", fontSize: "1.15rem", fontWeight: 800, color: "var(--warning)", background: "rgba(0,0,0,0.25)", padding: "0.2rem 0.6rem", borderRadius: "6px" }}>
                        Starts in {formatCountdown(lobbySecondsRemaining)}
                      </div>
                    </div>
                    {testDetails.start_time && (
                      <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                        The examination will begin at <strong>{formatLocalTime(testDetails.start_time)}</strong> ({formatLocalDate(testDetails.start_time)}).
                      </div>
                    )}
                  </div>
                ) : testDetails.start_time && !isLobbyActive ? (
                  <div
                    style={{
                      marginTop: "1.1rem",
                      padding: "0.85rem 1.25rem",
                      borderRadius: "var(--radius-md)",
                      background: "rgba(16, 185, 129, 0.12)",
                      border: "1.5px solid #10b981",
                      color: "var(--text-main)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.6rem",
                    }}
                  >
                    <CheckSquare size={18} color="#10b981" />
                    <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "#10b981" }}>
                      Your examination has started. You may begin now!
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Instructions Section — Clearly Visible Before Starting */}
              <div style={{ marginBottom: "1.5rem" }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "0.6rem", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                  <FileText size={16} color="var(--primary-400)" />
                  <span>Examination Instructions</span>
                </h3>
                <div
                  style={{
                    maxHeight: "150px",
                    overflowY: "auto",
                    padding: "0.85rem 1rem",
                    background: "var(--bg-surface-elevated)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.84rem",
                    color: "var(--text-muted)",
                    lineHeight: 1.55,
                    whiteSpace: "pre-line",
                  }}
                >
                  {testDetails.instructions ||
                    "1. All questions are compulsory unless stated otherwise.\n2. Do not refresh or navigate away from the test window.\n3. Your answers are automatically saved in real-time.\n4. Ensure a stable internet connection for continuous synchronization."}
                </div>
              </div>

              {/* Error Message */}
              {startError && (
                <div
                  style={{
                    backgroundColor: "var(--danger-bg)",
                    border: "1px solid var(--danger-border)",
                    color: "var(--danger)",
                    borderRadius: "var(--radius-md)",
                    padding: "0.85rem",
                    fontSize: "0.85rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "1.25rem",
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{startError}</span>
                </div>
              )}

              {/* Candidate Details Form */}
              <form onSubmit={handleCandidateSubmit}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                  <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                    <label className="form-label" htmlFor="candidateName">
                      Full Name *
                    </label>
                    <input
                      id="candidateName"
                      type="text"
                      required
                      value={candidateName}
                      onChange={(e) => setCandidateName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="form-control"
                      disabled={isStarting}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="candidateEmail">
                      Email Address *
                    </label>
                    <input
                      id="candidateEmail"
                      type="email"
                      required
                      value={candidateEmail}
                      onChange={(e) => setCandidateEmail(e.target.value)}
                      placeholder="john@example.com"
                      className="form-control"
                      disabled={isStarting}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="candidatePhone">
                      Phone Number *
                    </label>
                    <input
                      id="candidatePhone"
                      type="tel"
                      required
                      value={candidatePhone}
                      onChange={(e) => setCandidatePhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className="form-control"
                      disabled={isStarting}
                    />
                  </div>

                  <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                    <label className="form-label" htmlFor="candidateRoll">
                      Roll Number / Student ID (Optional)
                    </label>
                    <input
                      id="candidateRoll"
                      type="text"
                      value={candidateRoll}
                      onChange={(e) => setCandidateRoll(e.target.value)}
                      placeholder="e.g. 2026-PHY-042"
                      className="form-control"
                      disabled={isStarting}
                    />
                  </div>
                </div>

                {/* Declaration Checkbox */}
                <div style={{ marginBottom: "1.5rem" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.65rem",
                      fontSize: "0.82rem",
                      color: "var(--text-main)",
                      cursor: "pointer",
                      lineHeight: 1.45,
                    }}
                  >
                    <input
                      id="declarationCheckbox"
                      type="checkbox"
                      checked={declarationChecked}
                      onChange={(e) => setDeclarationChecked(e.target.checked)}
                      style={{ marginTop: "0.15rem", width: "16px", height: "16px", accentColor: "var(--primary-500)", cursor: "pointer" }}
                      disabled={isStarting}
                    />
                    <span>
                      I have read and understood all examination instructions above and confirm my candidate identity.
                    </span>
                  </label>
                </div>

                {/* Primary Action Button */}
                <button
                  id="startExamBtn"
                  type="submit"
                  disabled={isStarting || (isLobbyActive && lobbySecondsRemaining !== null && lobbySecondsRemaining > 0)}
                  className="btn btn-primary"
                  style={{
                    width: "100%",
                    padding: "0.85rem",
                    fontSize: "0.95rem",
                    fontWeight: 700,
                  }}
                >
                  {isStarting ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                      <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                      <span>Preparing Examination...</span>
                    </div>
                  ) : isLobbyActive && lobbySecondsRemaining !== null && lobbySecondsRemaining > 0 ? (
                    <span>Exam starts in {formatCountdown(lobbySecondsRemaining)}</span>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                      <span>Start Examination</span>
                      <ArrowRight size={16} />
                    </div>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
