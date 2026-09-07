"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  api,
  AttemptSessionStateResponse,
  AttemptQuestionItem,
  AttemptAnswerItem,
  AttemptSaveAnswerRequest,
} from "@/lib/api";
import { MathRenderer } from "@/components/MathRenderer";
import { ExamTimer } from "@/components/ExamTimer";
import "./exam-mobile.css";
import {
  Clock,
  Wifi,
  WifiOff,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Flag,
  RotateCcw,
  CheckSquare,
  Send,
  User as UserIcon,
  LayoutGrid,
  X,
  Check,
  RefreshCw,
  Pause,
  Maximize2,
  Minimize2,
  Layers,
  HelpCircle,
  FileText,
  Info,
  Menu,
} from "lucide-react";
import { useExamIntegrity } from "@/lib/hooks/useExamIntegrity";
import { ThemeToggle } from "@/components/ThemeToggle";

type SaveStatus = "SAVING" | "SAVED" | "OFFLINE" | "SYNCING" | "FAILED";

export default function ExamPlayerPage() {
  const params = useParams();
  const router = useRouter();
  const attemptId = params?.attemptId as string;

  // Session & Loading State
  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState<AttemptSessionStateResponse | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const [isExamPaused, setIsExamPaused] = useState<boolean>(false);
  const [isExamCancelled, setIsExamCancelled] = useState<boolean>(false);

  // Navigation & Answers State
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, AttemptAnswerItem>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isTimeExpiredModal, setIsTimeExpiredModal] = useState(false);

  // Mobile Modals & Drawers
  const [showMobilePalette, setShowMobilePalette] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);

  // Network & Sync State
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("SAVED");
  const [justRestored, setJustRestored] = useState<boolean>(false);
  const [pendingQueue, setPendingQueue] = useState<AttemptSaveAnswerRequest[]>([]);

  // Time & Clock State (authoritative server deadlines)
  const serverOffsetMs = useRef<number>(0);
  const expiresAtMs = useRef<number>(0);
  const questionStartTimeRef = useRef<number>(Date.now());
  const numericalDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const textDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const hasExpiredSubmittedRef = useRef<boolean>(false);

  // Synchronous Answers Reference and In-Flight Save Tracker
  const answersRef = useRef<Record<string, AttemptAnswerItem>>({});
  const inFlightSavesRef = useRef<Map<string, Promise<any>>>(new Map());

  // Mutable refs to decouple intervals and listeners from rapid state changes
  const currentIndexRef = useRef<number>(currentIndex);
  currentIndexRef.current = currentIndex;
  const pendingQueueRef = useRef<AttemptSaveAnswerRequest[]>(pendingQueue);
  pendingQueueRef.current = pendingQueue;
  const isOnlineRef = useRef<boolean>(isOnline);
  isOnlineRef.current = isOnline;

  // Candidate Details from Storage
  const [candidateName, setCandidateName] = useState<string>("Candidate");
  const [candidateRoll, setCandidateRoll] = useState<string>("");

  // Storage key helper for attempt offline queue
  const queueStorageKey = useMemo(() => `cbt_pending_queue_${attemptId}`, [attemptId]);

  // Examination Session Integrity Telemetry & Non-Adversarial Safeguards
  const isExamActive =
    !loading &&
    !sessionError &&
    !isExamPaused &&
    !isExamCancelled &&
    !isSubmitting &&
    !isTimeExpiredModal &&
    sessionData?.status === "IN_PROGRESS";

  const {
    isFullscreen,
    isDuplicateTab,
    isInactiveWarning,
    requestFullscreen,
    resetInactivity,
  } = useExamIntegrity(attemptId, sessionId, isExamActive);
  const [duplicateTabDismissed, setDuplicateTabDismissed] = useState<boolean>(false);

  // Persistent Queue helper
  const persistQueueToStorage = useCallback((queue: AttemptSaveAnswerRequest[]) => {
    try {
      if (queue.length > 0) {
        localStorage.setItem(queueStorageKey, JSON.stringify(queue));
      } else {
        localStorage.removeItem(queueStorageKey);
      }
    } catch (e) {
      console.warn("localStorage queue write error", e);
    }
  }, [queueStorageKey]);

  // 1. Initial Load: Fetch Session State & Reconcile Persistent Offline Queue
  useEffect(() => {
    if (!attemptId) return;

    let storedSessionId = "";
    try {
      storedSessionId =
        localStorage.getItem(`cbt_session_${attemptId}`) ||
        localStorage.getItem("cbt_current_session_id") ||
        "";
      const storedName = localStorage.getItem("cbt_candidate_name");
      const storedRoll = localStorage.getItem("cbt_candidate_roll");
      if (storedName) setCandidateName(storedName);
      if (storedRoll) setCandidateRoll(storedRoll);
    } catch (e) {
      console.warn("Storage read error", e);
    }

    const loadSession = async () => {
      try {
        setLoading(true);
        setSessionError(null);
        const data = await api.getAttemptState(attemptId, storedSessionId || undefined);

        if (data.status === "COMPLETED" || data.status === "EXPIRED") {
          router.replace(`/exam/${attemptId}/result`);
          return;
        }

        if (data.status === "CANCELLED") {
          setIsExamCancelled(true);
          setLoading(false);
          return;
        }

        if (data.is_paused || data.status === "PAUSED" || (data.test as any)?.status === "PAUSED") {
          setIsExamPaused(true);
        }

        setSessionData(data);
        setSessionId(data.session_id);
        try {
          localStorage.setItem(`cbt_session_${attemptId}`, data.session_id);
          localStorage.setItem("cbt_current_session_id", data.session_id);
          localStorage.setItem("cbt_current_attempt_id", data.attempt_id);
          if (data.test_title) {
            localStorage.setItem("cbt_current_test_title", data.test_title);
          }
        } catch (e) {}

        // Setup clock sync safely
        const clientNow = Date.now();
        const rawServerNow = (data as any).server_now || (data as any).server_time;
        const serverNow = rawServerNow ? new Date(rawServerNow).getTime() : clientNow;
        serverOffsetMs.current = Number.isFinite(serverNow) ? (serverNow - clientNow) : 0;

        let expMs = NaN;
        if (typeof data.time_remaining_seconds === "number" && data.time_remaining_seconds >= 0) {
          expMs = clientNow + serverOffsetMs.current + data.time_remaining_seconds * 1000;
        } else if (data.expires_at) {
          expMs = new Date(data.expires_at).getTime();
        }
        if (!Number.isFinite(expMs) || expMs <= 0) {
          const configuredMinutes = data.duration_minutes || data.test?.duration_minutes || 60;
          expMs = clientNow + serverOffsetMs.current + configuredMinutes * 60 * 1000;
        }
        expiresAtMs.current = expMs;

        // Reconcile with local persistent offline queue
        let localQueue: AttemptSaveAnswerRequest[] = [];
        try {
          const rawQ = localStorage.getItem(queueStorageKey);
          if (rawQ) {
            localQueue = JSON.parse(rawQ);
          }
        } catch (e) {}

        const initialAnswers: Record<string, AttemptAnswerItem> = {};
        if (data.answers) {
          for (const [qid, ansItem] of Object.entries(data.answers)) {
            const opt = ansItem.selected_option_id || ansItem.selected_option_ids || null;
            initialAnswers[qid] = {
              ...ansItem,
              selected_option_id: opt,
              selected_option_ids: opt,
            };
          }
        }

        if (localQueue.length > 0) {
          for (const queued of localQueue) {
            const qId = queued.question_id;
            const existing = initialAnswers[qId] || {
              question_id: qId,
              is_marked_for_review: false,
              is_visited: true,
              time_spent_seconds: 0,
            };
            const opt = queued.selected_option_id || queued.selected_option_ids || existing.selected_option_id || null;
            initialAnswers[qId] = {
              ...existing,
              selected_option_id: opt,
              selected_option_ids: opt,
              numerical_answer: queued.numerical_answer !== undefined ? queued.numerical_answer : existing.numerical_answer,
              is_marked_for_review: queued.is_marked_for_review ?? existing.is_marked_for_review,
              is_visited: true,
            };
          }
        }

        answersRef.current = { ...initialAnswers };
        setAnswers(initialAnswers);
        setPendingQueue(localQueue);

        if (typeof data.current_question_index === "number" && data.current_question_index >= 0) {
          setCurrentIndex(Math.min(data.current_question_index, data.questions.length - 1));
        }

        questionStartTimeRef.current = Date.now();
      } catch (err: any) {
        const msg = err?.message || "";
        if (msg.includes("403") || msg.includes("SESSION_MISMATCH")) {
          setSessionError("Session Mismatch: This examination attempt is open on another device or window. Please return to your original session.");
        } else if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
          setSessionError("Examination session not found. Please verify your access code at the student portal.");
        } else {
          setSessionError(msg || "Failed to load examination session. Please check your internet connection.");
        }
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, [attemptId, router, queueStorageKey]);

  // Current Question helper
  const currentQuestion = useMemo<AttemptQuestionItem | null>(() => {
    if (!sessionData?.questions || sessionData.questions.length === 0) return null;
    return sessionData.questions[currentIndex] || null;
  }, [sessionData, currentIndex]);

  const currentAnswer = useMemo<AttemptAnswerItem | undefined>(() => {
    if (!currentQuestion) return undefined;
    return answers[currentQuestion.id];
  }, [answers, currentQuestion]);

  const currentQuestionHasAnswer = useMemo(() => {
    if (!currentAnswer) return false;
    const hasOpt =
      (currentAnswer.selected_option_id !== null && currentAnswer.selected_option_id !== undefined && currentAnswer.selected_option_id !== "") ||
      (currentAnswer.selected_option_ids !== null && currentAnswer.selected_option_ids !== undefined && currentAnswer.selected_option_ids !== "");
    const hasNum = currentAnswer.numerical_answer !== null && currentAnswer.numerical_answer !== undefined;
    const hasText = currentAnswer.text_answer !== null && currentAnswer.text_answer !== undefined && currentAnswer.text_answer.trim() !== "";
    return hasOpt || hasNum || hasText;
  }, [currentAnswer]);

  // Record time spent on question before changing
  const recordQuestionTime = useCallback(() => {
    if (!currentQuestion) return;
    const now = Date.now();
    const elapsedSeconds = Math.max(1, Math.round((now - questionStartTimeRef.current) / 1000));
    questionStartTimeRef.current = now;

    setAnswers((prev) => {
      const existing = prev[currentQuestion.id] || {
        question_id: currentQuestion.id,
        is_marked_for_review: false,
        is_visited: true,
        time_spent_seconds: 0,
      };
      return {
        ...prev,
        [currentQuestion.id]: {
          ...existing,
          time_spent_seconds: (existing.time_spent_seconds || 0) + elapsedSeconds,
          is_visited: true,
        },
      };
    });
  }, [currentQuestion]);

  // Handle Timer Expiry
  const handleTimerExpire = useCallback(() => {
    setIsTimeExpiredModal(true);
  }, []);

  // Offline queue flusher
  const flushPendingQueue = useCallback(async () => {
    if (pendingQueueRef.current.length === 0 || !sessionId) return;
    setSaveStatus("SYNCING");

    const toProcess = [...pendingQueueRef.current];
    let successfullySent: string[] = [];

    for (const req of toProcess) {
      try {
        await api.saveAttemptAnswer(attemptId, req);
        successfullySent.push(req.question_id);
      } catch (e) {
        console.warn("Queue flush partial fail", e);
        break;
      }
    }

    if (successfullySent.length > 0) {
      setPendingQueue((prev) => {
        const remaining = prev.filter((item) => !successfullySent.includes(item.question_id));
        persistQueueToStorage(remaining);
        return remaining;
      });
      setJustRestored(true);
      setTimeout(() => setJustRestored(false), 4000);
      setSaveStatus("SAVED");
    } else {
      setSaveStatus("FAILED");
    }
  }, [attemptId, sessionId, persistQueueToStorage]);

  // Online / Offline listener
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      flushPendingQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSaveStatus("OFFLINE");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [flushPendingQueue]);

  // Periodic heartbeat & proactive pause/resume detection
  useEffect(() => {
    if (!sessionId || !attemptId || isExamCancelled || isSubmitting) return;

    // Fast polling (3s) while paused to detect administrator resume immediately; 20s when active
    const pollIntervalMs = isExamPaused ? 3000 : 20000;

    const interval = setInterval(async () => {
      try {
        const res = await api.heartbeatAttempt(attemptId, {
          session_id: sessionId,
          current_question_index: currentIndexRef.current,
        });

        const rawServerNow = (res as any).server_now || (res as any).server_time;
        if (rawServerNow) {
          const serverNow = new Date(rawServerNow).getTime();
          if (Number.isFinite(serverNow)) {
            serverOffsetMs.current = serverNow - Date.now();
          }
        }

        if (res.is_paused) {
          setIsExamPaused(true);
          if (typeof res.time_remaining_seconds === "number" && res.time_remaining_seconds >= 0) {
            expiresAtMs.current = Date.now() + serverOffsetMs.current + res.time_remaining_seconds * 1000;
          }
        } else {
          // If exam was paused and is now resumed by admin, unblock seamlessly
          if (isExamPaused) {
            setIsExamPaused(false);
          }
          if (typeof res.time_remaining_seconds === "number" && res.time_remaining_seconds >= 0) {
            expiresAtMs.current = Date.now() + serverOffsetMs.current + res.time_remaining_seconds * 1000;
          }
        }

        if (res.is_expired) {
          setIsTimeExpiredModal(true);
        }

        if (pendingQueueRef.current.length > 0 && isOnlineRef.current && !res.is_paused) {
          flushPendingQueue();
        }
      } catch (e) {
        console.warn("Heartbeat missed", e);
      }
    }, pollIntervalMs);

    return () => clearInterval(interval);
  }, [attemptId, sessionId, isExamPaused, isExamCancelled, isSubmitting, flushPendingQueue]);

  // Complete Keyboard Shortcuts & Action Blocker during PAUSE
  useEffect(() => {
    if (!isExamPaused) return;

    const handleKeyLock = (e: KeyboardEvent) => {
      // Intercept and prevent all keyboard shortcuts and navigation during exam pause
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener("keydown", handleKeyLock, { capture: true });
    window.addEventListener("keyup", handleKeyLock, { capture: true });
    window.addEventListener("keypress", handleKeyLock, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleKeyLock, { capture: true });
      window.removeEventListener("keyup", handleKeyLock, { capture: true });
      window.removeEventListener("keypress", handleKeyLock, { capture: true });
    };
  }, [isExamPaused]);

  // Autosave Answer with Synchronous Ref Update & Promise Tracking
  const saveAnswer = useCallback(
    async (
      qId: string,
      updates: Partial<AttemptAnswerItem>,
      targetIndex?: number
    ) => {
      if (!sessionId || isExamPaused) return;

      const existing = answersRef.current[qId] || answers[qId] || {
        question_id: qId,
        selected_option_id: null,
        selected_option_ids: null,
        numerical_answer: null,
        text_answer: null,
        is_marked_for_review: false,
        is_visited: true,
        time_spent_seconds: 0,
      };

      const optVal =
        updates.selected_option_id !== undefined
          ? updates.selected_option_id
          : updates.selected_option_ids !== undefined
          ? updates.selected_option_ids
          : existing.selected_option_id;

      const newAnswer: AttemptAnswerItem = {
        ...existing,
        ...updates,
        selected_option_id: optVal,
        selected_option_ids: optVal,
        is_visited: true,
      };

      // Synchronously commit to answersRef before any asynchronous activity
      answersRef.current[qId] = newAnswer;
      setAnswers((prev) => ({
        ...prev,
        [qId]: newAnswer,
      }));

      const saveReq: AttemptSaveAnswerRequest = {
        session_id: sessionId,
        question_id: qId,
        selected_option_id: newAnswer.selected_option_id,
        selected_option_ids: newAnswer.selected_option_ids,
        numerical_answer: newAnswer.numerical_answer,
        text_answer: newAnswer.text_answer,
        is_marked_for_review: newAnswer.is_marked_for_review,
        is_visited: true,
        time_spent_seconds: newAnswer.time_spent_seconds,
        current_question_index: typeof targetIndex === "number" ? targetIndex : currentIndex,
        client_timestamp: new Date().toISOString(),
      };

      const savePromise = (async () => {
        setSaveStatus("SAVING");
        try {
          const res = await api.saveAttemptAnswer(attemptId, saveReq);
          if (!isOnline) {
            setJustRestored(true);
            setTimeout(() => setJustRestored(false), 4000);
          }
          setIsOnline(true);
          setSaveStatus("SAVED");
          const rawServerNow = (res as any).server_now || (res as any).server_time;
          if (rawServerNow) {
            const serverNow = new Date(rawServerNow).getTime();
            if (Number.isFinite(serverNow)) {
              serverOffsetMs.current = serverNow - Date.now();
            }
          }
          if (res.is_expired) {
            setIsTimeExpiredModal(true);
          }
          return res;
        } catch (e: any) {
          console.warn("Save failed, queued into persistent offline storage", e);
          setIsOnline(false);
          setSaveStatus("OFFLINE");
          setPendingQueue((prev) => {
            const filtered = prev.filter((p) => p.question_id !== qId);
            const nextQ = [...filtered, saveReq];
            persistQueueToStorage(nextQ);
            return nextQ;
          });
          throw e;
        } finally {
          inFlightSavesRef.current.delete(qId);
        }
      })();

      inFlightSavesRef.current.set(qId, savePromise);
      return savePromise;
    },
    [answers, attemptId, currentIndex, isOnline, sessionId, persistQueueToStorage, isExamPaused]
  );

  // Debounce Flushers for Numerical and Text Answers
  const flushNumericalDebounce = useCallback(() => {
    if (numericalDebounceRef.current) {
      clearTimeout(numericalDebounceRef.current);
      numericalDebounceRef.current = null;
      if (currentQuestion && !isExamPaused) {
        const latest = answersRef.current[currentQuestion.id] || answers[currentQuestion.id];
        if (latest && latest.numerical_answer !== undefined) {
          saveAnswer(currentQuestion.id, { numerical_answer: latest.numerical_answer });
        }
      }
    }
  }, [currentQuestion, answers, saveAnswer, isExamPaused]);

  const flushTextDebounce = useCallback(() => {
    if (textDebounceRef.current) {
      clearTimeout(textDebounceRef.current);
      textDebounceRef.current = null;
      if (currentQuestion && !isExamPaused) {
        const latest = answersRef.current[currentQuestion.id] || answers[currentQuestion.id];
        if (latest && latest.text_answer !== undefined) {
          saveAnswer(currentQuestion.id, { text_answer: latest.text_answer });
        }
      }
    }
  }, [currentQuestion, answers, saveAnswer, isExamPaused]);

  const flushAllDebounces = useCallback(() => {
    flushNumericalDebounce();
    flushTextDebounce();
  }, [flushNumericalDebounce, flushTextDebounce]);

  const handleNumericalChange = (valueStr: string) => {
    if (!currentQuestion || isExamPaused) return;
    const num = valueStr === "" ? null : parseFloat(valueStr);

    const existing = answersRef.current[currentQuestion.id] || answers[currentQuestion.id] || {
      question_id: currentQuestion.id,
      is_marked_for_review: false,
      is_visited: true,
      time_spent_seconds: 0,
    };
    answersRef.current[currentQuestion.id] = {
      ...existing,
      numerical_answer: num,
      is_visited: true,
    };

    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: answersRef.current[currentQuestion.id],
    }));

    if (numericalDebounceRef.current) {
      clearTimeout(numericalDebounceRef.current);
    }

    numericalDebounceRef.current = setTimeout(() => {
      if (!isExamPaused) {
        saveAnswer(currentQuestion.id, { numerical_answer: num });
      }
    }, 450);
  };

  const handleTextChange = (text: string) => {
    if (!currentQuestion || isExamPaused) return;
    const trimmedOrNull = text === "" ? null : text;

    const existing = answersRef.current[currentQuestion.id] || answers[currentQuestion.id] || {
      question_id: currentQuestion.id,
      is_marked_for_review: false,
      is_visited: true,
      time_spent_seconds: 0,
    };
    answersRef.current[currentQuestion.id] = {
      ...existing,
      text_answer: trimmedOrNull,
      is_visited: true,
    };

    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: answersRef.current[currentQuestion.id],
    }));

    if (textDebounceRef.current) {
      clearTimeout(textDebounceRef.current);
    }

    textDebounceRef.current = setTimeout(() => {
      if (!isExamPaused) {
        saveAnswer(currentQuestion.id, { text_answer: trimmedOrNull });
      }
    }, 450);
  };

  // Action Handlers
  const handleSelectOption = (optionId: string) => {
    if (!currentQuestion || isExamPaused) return;
    flushAllDebounces();

    // Synchronously update answersRef right away so immediate Submit clicks have latest state
    const existing = answersRef.current[currentQuestion.id] || answers[currentQuestion.id] || {
      question_id: currentQuestion.id,
      is_marked_for_review: false,
      is_visited: true,
      time_spent_seconds: 0,
    };
    answersRef.current[currentQuestion.id] = {
      ...existing,
      selected_option_id: optionId,
      selected_option_ids: optionId,
      is_visited: true,
    };

    saveAnswer(currentQuestion.id, { selected_option_id: optionId, selected_option_ids: optionId });
  };

  const handleToggleMultiOption = (optionId: string) => {
    if (!currentQuestion || isExamPaused) return;
    flushAllDebounces();

    const existing = answersRef.current[currentQuestion.id] || answers[currentQuestion.id] || {
      question_id: currentQuestion.id,
      is_marked_for_review: false,
      is_visited: true,
      time_spent_seconds: 0,
    };
    const currentIdsStr = existing.selected_option_ids || existing.selected_option_id || "";
    const currentIds = currentIdsStr ? currentIdsStr.split(",").filter(Boolean) : [];
    let newIds: string[];
    if (currentIds.includes(optionId)) {
      newIds = currentIds.filter((id) => id !== optionId);
    } else {
      newIds = [...currentIds, optionId];
    }
    const newIdsStr = newIds.length > 0 ? newIds.join(",") : null;

    answersRef.current[currentQuestion.id] = {
      ...existing,
      selected_option_id: newIdsStr,
      selected_option_ids: newIdsStr,
      is_visited: true,
    };

    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: answersRef.current[currentQuestion.id],
    }));

    saveAnswer(currentQuestion.id, {
      selected_option_id: newIdsStr,
      selected_option_ids: newIdsStr,
    });
  };

  const executeClearResponse = () => {
    if (!currentQuestion || isExamPaused) return;
    flushAllDebounces();
    saveAnswer(currentQuestion.id, {
      selected_option_id: null,
      selected_option_ids: null,
      numerical_answer: null,
      text_answer: null,
    });
    setShowClearConfirm(false);
  };

  const handleClearClick = () => {
    if (!currentQuestion || isExamPaused) return;
    if (currentQuestionHasAnswer) {
      setShowClearConfirm(true);
    } else {
      executeClearResponse();
    }
  };

  const handleToggleMarkReview = () => {
    if (!currentQuestion || isExamPaused) return;
    flushAllDebounces();
    const nextReview = !(currentAnswer?.is_marked_for_review ?? false);
    saveAnswer(currentQuestion.id, { is_marked_for_review: nextReview });
  };

  const handleNavigateQuestion = (targetIdx: number) => {
    if (!sessionData?.questions || isExamPaused) return;
    if (targetIdx < 0 || targetIdx >= sessionData.questions.length) return;

    flushAllDebounces();
    recordQuestionTime();
    setCurrentIndex(targetIdx);

    const targetQ = sessionData.questions[targetIdx];
    if (targetQ && !answers[targetQ.id]?.is_visited) {
      setAnswers((prev) => ({
        ...prev,
        [targetQ.id]: {
          question_id: targetQ.id,
          selected_option_id: null,
          selected_option_ids: null,
          numerical_answer: null,
          text_answer: null,
          is_marked_for_review: false,
          is_visited: true,
          time_spent_seconds: 0,
        },
      }));
    }
  };

  const isLastQuestion = sessionData?.questions
    ? currentIndex >= sessionData.questions.length - 1
    : false;

  const handleSaveAndNext = () => {
    if (!sessionData?.questions || isExamPaused) return;
    flushAllDebounces();
    if (currentIndex < sessionData.questions.length - 1) {
      handleNavigateQuestion(currentIndex + 1);
    } else {
      // On the final question: flush latest answer and open submit confirmation modal
      if (currentQuestion) {
        const latest = answersRef.current[currentQuestion.id] || answers[currentQuestion.id];
        if (latest) {
          saveAnswer(currentQuestion.id, {
            selected_option_id: latest.selected_option_id,
            selected_option_ids: latest.selected_option_ids,
            numerical_answer: latest.numerical_answer,
            text_answer: latest.text_answer,
          });
        }
      }
      setShowSubmitModal(true);
    }
  };

  const handleMarkReviewAndNext = () => {
    if (!currentQuestion || !sessionData?.questions || isExamPaused) return;
    flushAllDebounces();
    saveAnswer(
      currentQuestion.id,
      { is_marked_for_review: true },
      currentIndex < sessionData.questions.length - 1 ? currentIndex + 1 : currentIndex
    );
    if (currentIndex < sessionData.questions.length - 1) {
      handleNavigateQuestion(currentIndex + 1);
    } else {
      setShowSubmitModal(true);
    }
  };

  // Submission with Queue Flush & Idempotent Safety
  const submitExam = useCallback(
    async (forcedExpiry: boolean = false) => {
      if (isExamPaused || isSubmitting || hasExpiredSubmittedRef.current) return;
      if (forcedExpiry) {
        hasExpiredSubmittedRef.current = true;
      }
      setIsSubmitting(true);

      try {
        flushAllDebounces();
        recordQuestionTime();

        // 1. Wait for any active in-flight save requests to complete
        if (inFlightSavesRef.current.size > 0) {
          try {
            await Promise.allSettled(Array.from(inFlightSavesRef.current.values()));
          } catch (e) {
            console.warn("In-flight save promise error during submit pre-flush:", e);
          }
        }

        const currentSession = sessionId || localStorage.getItem("cbt_current_session_id") || "";

        // 2. Read synchronously from answersRef.current (guaranteeing latest UI answer selection)
        // answersRef.current takes absolute precedence over any stale React state
        const mergedAnswers = { ...answers, ...answersRef.current };

        const finalAnswers: AttemptSaveAnswerRequest[] = Object.values(mergedAnswers).map((ans) => {
          const opt = ans.selected_option_id || ans.selected_option_ids || null;
          return {
            session_id: currentSession,
            question_id: ans.question_id,
            selected_option_id: opt,
            selected_option_ids: opt,
            numerical_answer: ans.numerical_answer ?? null,
            text_answer: ans.text_answer ?? null,
            is_marked_for_review: ans.is_marked_for_review,
            is_visited: ans.is_visited,
            time_spent_seconds: ans.time_spent_seconds,
            client_timestamp: new Date().toISOString(),
          };
        });

        await api.submitAttempt(attemptId, {
          session_id: currentSession,
          final_answers: finalAnswers,
          forced_by_expiry: forcedExpiry,
        });

        try {
          localStorage.removeItem("cbt_current_attempt_id");
          localStorage.removeItem("cbt_current_session_id");
          localStorage.removeItem("cbt_current_test_title");
          localStorage.removeItem(queueStorageKey);
        } catch (e) {}

        router.replace(`/exam/${attemptId}/result`);
      } catch (err: any) {
        console.error("Submission failed", err);
        alert("Submission encountered an issue. Please verify your connection: " + (err?.message || ""));
        setIsSubmitting(false);
      }
    },
    [answers, attemptId, flushAllDebounces, isSubmitting, queueStorageKey, recordQuestionTime, router, sessionId]
  );

  useEffect(() => {
    if (isTimeExpiredModal) {
      const timeout = setTimeout(() => {
        submitExam(true);
      }, 2500);
      return () => clearTimeout(timeout);
    }
  }, [isTimeExpiredModal, submitExam]);

  // Accidental Tab Close Protection
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isSubmitting && sessionData?.status === "IN_PROGRESS") {
        flushNumericalDebounce();
        e.preventDefault();
        e.returnValue = "You have an active examination in progress. Responses are saved.";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isSubmitting, sessionData, flushNumericalDebounce]);

  // Palette Status Calculation
  const getQuestionStatus = (q: AttemptQuestionItem) => {
    const ans = answersRef.current[q.id] || answers[q.id];
    if (!ans || !ans.is_visited) return "NOT_VISITED";

    const hasAnswer =
      (ans.selected_option_id !== null && ans.selected_option_id !== undefined && ans.selected_option_id !== "") ||
      (ans.selected_option_ids !== null && ans.selected_option_ids !== undefined && ans.selected_option_ids !== "") ||
      (ans.numerical_answer !== null && ans.numerical_answer !== undefined) ||
      (ans.text_answer !== null && ans.text_answer !== undefined && ans.text_answer.trim() !== "");

    if (ans.is_marked_for_review && hasAnswer) return "ANSWERED_AND_REVIEW";
    if (ans.is_marked_for_review) return "MARKED_FOR_REVIEW";
    if (hasAnswer) return "ANSWERED";
    return "NOT_ANSWERED";
  };

  // Summary counts
  const summaryCounts = useMemo(() => {
    if (!sessionData?.questions) return { answered: 0, notAnswered: 0, review: 0, notVisited: 0 };
    let answered = 0;
    let notAnswered = 0;
    let review = 0;
    let notVisited = 0;

    for (const q of sessionData.questions) {
      const status = getQuestionStatus(q);
      if (status === "ANSWERED") answered++;
      else if (status === "ANSWERED_AND_REVIEW") {
        answered++;
        review++;
      } else if (status === "MARKED_FOR_REVIEW") review++;
      else if (status === "NOT_ANSWERED") notAnswered++;
      else notVisited++;
    }

    return { answered, notAnswered, review, notVisited };
  }, [sessionData, answers]);

  // Loading State
  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg-main)",
          color: "var(--text-main)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "var(--font-family)",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            border: "4px solid rgba(99, 102, 241, 0.2)",
            borderTopColor: "var(--primary-500)",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
        <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>
          Loading Examination Session...
        </div>
      </div>
    );
  }

  // Error State
  if (sessionError || !sessionData) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg-main)",
          color: "var(--text-main)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily: "var(--font-family)",
        }}
      >
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-color)",
            borderRadius: "16px",
            padding: "2.5rem 2rem",
            maxWidth: "460px",
            textAlign: "center",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <AlertTriangle size={48} color="var(--danger)" style={{ margin: "0 auto 1rem" }} />
          <h2 style={{ fontSize: "1.3rem", marginBottom: "0.5rem", color: "var(--text-main)" }}>
            Session Error
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: "1.5rem" }}>
            {sessionError || "Unable to access examination attempt."}
          </p>
          <button
            onClick={() => router.push("/exam")}
            style={{
              background: "var(--primary-500)",
              color: "#ffffff",
              border: "none",
              padding: "0.75rem 1.5rem",
              borderRadius: "8px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Return to Examination Lobby
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-main)",
        color: "var(--text-main)",
        fontFamily: "var(--font-family)",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {/* =========================================================================
          1. TOP HEADER (Laptop, Tablet, Mobile)
          ========================================================================= */}
      <header
        className="cbt-exam-header"
        style={{
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 1.25rem",
          flexShrink: 0,
        }}
      >
        {/* Left: Branding & Candidate Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {/* Mobile Menu / Palette Toggle */}
          <button
            type="button"
            className="cbt-mobile-only"
            onClick={() => setShowMobilePalette(true)}
            aria-label="Open Question Palette"
            style={{
              background: "var(--bg-surface-elevated)",
              border: "1px solid var(--border-color)",
              color: "var(--text-main)",
              padding: "0.4rem",
              borderRadius: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Menu size={20} />
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                background: "var(--gradient-ember)",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <CheckSquare size={16} color="#ffffff" strokeWidth={2.5} />
            </div>
            <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--text-main)", letterSpacing: "-0.01em" }}>
              CBT Portal
            </span>
          </div>

          {/* Candidate Name Badge (Desktop & Tablet) */}
          <div
            className="cbt-tablet-and-desktop"
            style={{
              marginLeft: "0.5rem",
              padding: "0.25rem 0.65rem",
              background: "var(--bg-surface-elevated)",
              border: "1px solid var(--border-color)",
              borderRadius: "6px",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              maxWidth: "200px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <UserIcon size={12} style={{ flexShrink: 0 }} />
            <span style={{ fontWeight: 600, color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis" }}>
              {candidateName}
            </span>
          </div>
        </div>

        {/* Center: Examination Name (Desktop & Tablet) */}
        <div
          className="cbt-tablet-and-desktop"
          style={{
            fontWeight: 700,
            fontSize: "0.92rem",
            color: "var(--text-main)",
            textAlign: "center",
            maxWidth: "380px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {sessionData.test_title}
        </div>

        {/* Right: Timer & Submit Action */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          {/* Offline / Online Sync Indicator */}
          {!isOnline ? (
            <div
              title="Working offline. Responses are stored locally and will sync upon reconnection."
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--danger)",
                background: "var(--danger-bg)",
                padding: "0.25rem 0.5rem",
                borderRadius: "6px",
                border: "1px solid var(--danger-border)",
              }}
            >
              <WifiOff size={13} />
              <span className="cbt-tablet-and-desktop">Offline</span>
            </div>
          ) : saveStatus === "SYNCING" ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--warning)",
                background: "var(--warning-bg)",
                padding: "0.25rem 0.5rem",
                borderRadius: "6px",
                border: "1px solid var(--warning-border)",
              }}
            >
              <RefreshCw size={13} className="animate-spin" />
              <span className="cbt-tablet-and-desktop">Syncing</span>
            </div>
          ) : null}

          {/* Time Left Container with Clock Icon */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              background: "var(--bg-surface-elevated)",
              border: "1px solid var(--border-color)",
              borderRadius: "8px",
              padding: "0.3rem 0.65rem",
            }}
          >
            <Clock size={14} style={{ color: "var(--primary-500)", flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span className="cbt-tablet-and-desktop" style={{ fontSize: "0.6rem", color: "var(--text-muted)", lineHeight: 1 }}>
                Time Left
              </span>
              <ExamTimer
                expiresAtMs={expiresAtMs.current}
                serverOffsetMs={serverOffsetMs.current}
                isPaused={isExamPaused}
                onExpire={handleTimerExpire}
              />
            </div>
          </div>

          <ThemeToggle />

          {/* Submit Button */}
          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            aria-label="Submit Examination"
            style={{
              background: "var(--danger)",
              color: "#ffffff",
              border: "none",
              padding: "0.45rem 1rem",
              borderRadius: "8px",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              boxShadow: "0 2px 8px rgba(239, 68, 68, 0.35)",
              flexShrink: 0,
            }}
          >
            <span>Submit</span>
          </button>
        </div>
      </header>

      {/* =========================================================================
          2. MAIN BODY
          ========================================================================= */}
      <div
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* -----------------------------------------------------------------------
            LEFT COLUMN: Question Palette & Candidate Info (Desktop & Tablet)
            ----------------------------------------------------------------------- */}
        <aside className="cbt-desktop-aside-left">
          {/* Palette Legend */}
          <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border-color)" }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
              Question Palette
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", fontSize: "0.72rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />
                <span style={{ color: "var(--text-main)" }}>Answered ({summaryCounts.answered})</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "var(--primary-500)", flexShrink: 0 }} />
                <span style={{ color: "var(--text-main)" }}>Current</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#f97316", flexShrink: 0 }} />
                <span style={{ color: "var(--text-main)" }}>Review ({summaryCounts.review})</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "var(--bg-surface-elevated)", border: "1px solid var(--border-color)", flexShrink: 0 }} />
                <span style={{ color: "var(--text-muted)" }}>Unanswered</span>
              </div>
            </div>
          </div>

          {/* Palette Grid */}
          <div style={{ flex: 1, padding: "0.85rem", overflowY: "auto" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "0.55rem",
              }}
            >
              {sessionData.questions.map((q, idx) => {
                const status = getQuestionStatus(q);
                const isCurrent = idx === currentIndex;

                let bgColor = "var(--bg-surface-elevated)";
                let textColor = "var(--text-main)";
                let border = "1px solid var(--border-color)";

                if (isCurrent) {
                  bgColor = "var(--primary-500)";
                  textColor = "#ffffff";
                  border = "2px solid var(--primary-500)";
                } else if (status === "ANSWERED" || status === "ANSWERED_AND_REVIEW") {
                  bgColor = "#10b981";
                  textColor = "#ffffff";
                  border = "none";
                } else if (status === "MARKED_FOR_REVIEW") {
                  bgColor = "#f97316";
                  textColor = "#ffffff";
                  border = "none";
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => handleNavigateQuestion(idx)}
                    aria-label={`Jump to Question ${idx + 1}`}
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "8px",
                      background: bgColor,
                      color: textColor,
                      border: border,
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto",
                      transition: "all 0.15s ease",
                      boxShadow: isCurrent ? "0 0 10px rgba(99, 102, 241, 0.4)" : "none",
                    }}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* -----------------------------------------------------------------------
            CENTER COLUMN: Question Content & Options (Responsive for all devices)
            ----------------------------------------------------------------------- */}
        <section
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-main)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Question Subheader: Number, Type, Marks, Instructions */}
          <div
            style={{
              padding: "0.65rem 1.5rem",
              background: "var(--bg-surface)",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--text-main)" }}>
                Question {currentIndex + 1} of {sessionData.questions.length}
              </span>
              <span
                style={{
                  background: "rgba(99, 102, 241, 0.12)",
                  color: "var(--primary-500)",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "0.2rem 0.5rem",
                  borderRadius: "4px",
                  border: "1px solid rgba(99, 102, 241, 0.25)",
                }}
              >
                {currentQuestion?.question_type === "NUMERICAL"
                  ? "Numerical"
                  : currentQuestion?.question_type === "MULTIPLE_CHOICE"
                  ? "Multiple Choice"
                  : currentQuestion?.question_type === "TRUE_FALSE"
                  ? "True / False"
                  : currentQuestion?.question_type === "ASSERTION_REASON"
                  ? "Assertion & Reason"
                  : currentQuestion?.question_type === "MATCH_THE_FOLLOWING"
                  ? "Match Following"
                  : currentQuestion?.question_type === "FILL_BLANK"
                  ? "Fill in Blank"
                  : "MCQ"}
              </span>
              <span
                style={{
                  background: "var(--bg-surface-elevated)",
                  color: "var(--text-muted)",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  padding: "0.2rem 0.5rem",
                  borderRadius: "4px",
                  border: "1px solid var(--border-color)",
                }}
              >
                +{currentQuestion?.marks || 1} / -{currentQuestion?.negative_marks || 0}
              </span>
            </div>

            {/* Subheader Right Actions: Instructions Modal & Mobile Palette */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setShowInstructionsModal(true)}
                title="View Examination Instructions"
                style={{
                  background: "var(--bg-surface-elevated)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-muted)",
                  padding: "0.3rem 0.65rem",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
              >
                <HelpCircle size={14} />
                <span>Instructions</span>
              </button>

              <button
                type="button"
                className="cbt-mobile-only"
                onClick={() => setShowMobilePalette(true)}
                title="Open Question Palette"
                aria-label="Open Question Palette"
                style={{
                  background: "var(--bg-surface-elevated)",
                  border: "1px solid var(--border-color)",
                  color: "var(--primary-500)",
                  padding: "0.3rem 0.65rem",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
              >
                <LayoutGrid size={14} />
                <span>Palette</span>
              </button>
            </div>
          </div>

          {/* Scrollable Question Content Area */}
          <div
            className="cbt-question-scroll-area"
            style={{
              flex: 1,
              padding: "2rem 2.5rem",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {currentQuestion ? (
              <div style={{ maxWidth: "860px", margin: "0 auto" }}>
                {/* Question Statement */}
                <div
                  className="cbt-math-container"
                  style={{
                    fontSize: "1.1rem",
                    lineHeight: 1.65,
                    color: "var(--text-main)",
                    marginBottom: "2rem",
                    fontWeight: 500,
                  }}
                >
                  <MathRenderer content={currentQuestion.content} />
                </div>

                {/* Media Image Attachments if any */}
                {currentQuestion.media && currentQuestion.media.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginBottom: "1.75rem" }}>
                    {currentQuestion.media.map((m) => (
                      <img
                        key={m.id}
                        src={m.url}
                        alt={m.original_filename}
                        style={{
                          maxHeight: "260px",
                          maxWidth: "100%",
                          height: "auto",
                          borderRadius: "8px",
                          border: "1px solid var(--border-color)",
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Single Choice Option Cards (MCQ, ASSERTION_REASON, MATCH_THE_FOLLOWING, or fallback) */}
                {(["MCQ", "ASSERTION_REASON", "MATCH_THE_FOLLOWING"].includes(currentQuestion.question_type) ||
                  (!["NUMERICAL", "MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK"].includes(currentQuestion.question_type) &&
                    currentQuestion.options &&
                    currentQuestion.options.length > 0)) && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                    {currentQuestion.options.map((opt, optIdx) => {
                      const isSelected =
                        currentAnswer?.selected_option_id === opt.id ||
                        currentAnswer?.selected_option_ids === opt.id;
                      const optionLetter = String.fromCharCode(65 + optIdx); // A, B, C, D

                      return (
                        <div
                          key={opt.id}
                          onClick={() => handleSelectOption(opt.id)}
                          className={`cbt-option-card ${isSelected ? "selected" : ""}`}
                          role="radio"
                          aria-checked={isSelected}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleSelectOption(opt.id);
                            }
                          }}
                        >
                          {/* Circular Letter Badge */}
                          <div
                            style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "50%",
                              background: isSelected ? "var(--primary-500)" : "var(--bg-surface-elevated)",
                              color: isSelected ? "#ffffff" : "var(--text-main)",
                              border: isSelected ? "none" : "1px solid var(--border-color)",
                              fontWeight: 700,
                              fontSize: "0.85rem",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {optionLetter}
                          </div>

                          {/* Option Content */}
                          <div className="cbt-math-container" style={{ flex: 1, color: "var(--text-main)", fontSize: "0.95rem" }}>
                            <MathRenderer content={opt.content} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* True / False Question Type */}
                {currentQuestion.question_type === "TRUE_FALSE" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                    {currentQuestion.options && currentQuestion.options.length > 0 ? (
                      currentQuestion.options.map((opt, optIdx) => {
                        const isSelected =
                          currentAnswer?.selected_option_id === opt.id ||
                          currentAnswer?.selected_option_ids === opt.id;
                        const optionLetter = String.fromCharCode(65 + optIdx);

                        return (
                          <div
                            key={opt.id}
                            onClick={() => handleSelectOption(opt.id)}
                            className={`cbt-option-card ${isSelected ? "selected" : ""}`}
                            role="radio"
                            aria-checked={isSelected}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleSelectOption(opt.id);
                              }
                            }}
                          >
                            <div
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "50%",
                                background: isSelected ? "var(--primary-500)" : "var(--bg-surface-elevated)",
                                color: isSelected ? "#ffffff" : "var(--text-main)",
                                border: isSelected ? "none" : "1px solid var(--border-color)",
                                fontWeight: 700,
                                fontSize: "0.85rem",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              {optionLetter}
                            </div>
                            <div className="cbt-math-container" style={{ flex: 1, color: "var(--text-main)", fontSize: "0.95rem", fontWeight: 600 }}>
                              <MathRenderer content={opt.content} />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      // Dynamic True/False cards if no options array attached
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", maxWidth: "420px" }}>
                        {["True", "False"].map((tfVal) => {
                          const isSelected =
                            currentAnswer?.text_answer?.toLowerCase() === tfVal.toLowerCase() ||
                            currentAnswer?.selected_option_id === tfVal;
                          return (
                            <button
                              key={tfVal}
                              type="button"
                              onClick={() => handleTextChange(tfVal)}
                              className={`cbt-option-card ${isSelected ? "selected" : ""}`}
                              style={{
                                justifyContent: "center",
                                padding: "1.25rem 1rem",
                                fontWeight: 700,
                                fontSize: "1.05rem",
                                cursor: "pointer",
                                border: isSelected ? "2px solid var(--primary-500)" : "1px solid var(--border-color)",
                                background: isSelected ? "rgba(99, 102, 241, 0.15)" : "var(--bg-surface)",
                                color: isSelected ? "var(--primary-500)" : "var(--text-main)",
                                borderRadius: "10px",
                              }}
                            >
                              {tfVal}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Multiple Choice (Multi-Select Checkbox) Type */}
                {currentQuestion.question_type === "MULTIPLE_CHOICE" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                      Select all applicable correct options:
                    </div>
                    {currentQuestion.options.map((opt, optIdx) => {
                      const selectedIds = (currentAnswer?.selected_option_ids || currentAnswer?.selected_option_id || "")
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean);
                      const isSelected = selectedIds.includes(opt.id);
                      const optionLetter = String.fromCharCode(65 + optIdx);

                      return (
                        <div
                          key={opt.id}
                          onClick={() => handleToggleMultiOption(opt.id)}
                          className={`cbt-option-card ${isSelected ? "selected" : ""}`}
                          role="checkbox"
                          aria-checked={isSelected}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleToggleMultiOption(opt.id);
                            }
                          }}
                          style={{
                            border: isSelected ? "2px solid var(--primary-500)" : "1px solid var(--border-color)",
                            background: isSelected ? "rgba(99, 102, 241, 0.08)" : "var(--bg-surface)",
                          }}
                        >
                          {/* Square Checkbox Badge */}
                          <div
                            style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "6px",
                              background: isSelected ? "var(--primary-500)" : "var(--bg-surface-elevated)",
                              color: isSelected ? "#ffffff" : "var(--text-main)",
                              border: isSelected ? "none" : "1px solid var(--border-color)",
                              fontWeight: 700,
                              fontSize: "0.85rem",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {isSelected ? "✓" : optionLetter}
                          </div>

                          {/* Option Content */}
                          <div className="cbt-math-container" style={{ flex: 1, color: "var(--text-main)", fontSize: "0.95rem" }}>
                            <MathRenderer content={opt.content} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Numerical Input Type */}
                {currentQuestion.question_type === "NUMERICAL" && (
                  <div
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "12px",
                      padding: "1.5rem",
                      maxWidth: "440px",
                    }}
                  >
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.6rem" }}>
                      Enter Numerical / Decimal Answer:
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      placeholder="e.g. 42 or 3.14"
                      value={currentAnswer?.numerical_answer ?? ""}
                      onChange={(e) => handleNumericalChange(e.target.value)}
                      onBlur={flushNumericalDebounce}
                      style={{
                        width: "100%",
                        minHeight: "48px",
                        background: "var(--bg-surface-elevated)",
                        border: "1.5px solid var(--primary-500)",
                        borderRadius: "8px",
                        padding: "0.75rem 1rem",
                        color: "var(--text-main)",
                        fontSize: "1.2rem",
                        fontWeight: 700,
                        fontFamily: "monospace",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                )}

                {/* Fill in the Blank Type */}
                {currentQuestion.question_type === "FILL_BLANK" && (
                  <div
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "12px",
                      padding: "1.5rem",
                      maxWidth: "520px",
                    }}
                  >
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.6rem" }}>
                      Type your answer for the blank:
                    </label>
                    <input
                      type="text"
                      placeholder="Type your answer here..."
                      value={currentAnswer?.text_answer ?? ""}
                      onChange={(e) => handleTextChange(e.target.value)}
                      onBlur={flushTextDebounce}
                      style={{
                        width: "100%",
                        minHeight: "48px",
                        background: "var(--bg-surface-elevated)",
                        border: "1.5px solid var(--primary-500)",
                        borderRadius: "8px",
                        padding: "0.75rem 1rem",
                        color: "var(--text-main)",
                        fontSize: "1rem",
                        fontWeight: 600,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                )}

                {/* Mark for review checkbox */}
                <div style={{ marginTop: "1.5rem" }}>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      fontSize: "0.85rem",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={currentAnswer?.is_marked_for_review ?? false}
                      onChange={handleToggleMarkReview}
                      style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#f97316" }}
                    />
                    <span style={{ color: currentAnswer?.is_marked_for_review ? "#f97316" : "inherit", fontWeight: currentAnswer?.is_marked_for_review ? 600 : 400 }}>
                      Mark for review
                    </span>
                  </label>
                </div>
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)", textAlign: "center", marginTop: "4rem" }}>
                No question selected.
              </div>
            )}
          </div>

          {/* Desktop & Tablet Bottom Action Footer */}
          <footer className="cbt-desktop-footer">
            {/* Left: Clear Response */}
            <button
              type="button"
              onClick={handleClearClick}
              disabled={!currentQuestionHasAnswer}
              style={{
                background: "none",
                color: currentQuestionHasAnswer ? "var(--text-muted)" : "var(--border-color)",
                border: "none",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: currentQuestionHasAnswer ? "pointer" : "default",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
              }}
            >
              <RotateCcw size={14} />
              <span>Clear Response</span>
            </button>

            {/* Right: Previous & Save & Next */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={() => handleNavigateQuestion(currentIndex - 1)}
                disabled={currentIndex <= 0}
                style={{
                  background: "var(--bg-surface-elevated)",
                  color: "var(--text-main)",
                  border: "1px solid var(--border-color)",
                  padding: "0.55rem 1.25rem",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: currentIndex <= 0 ? "not-allowed" : "pointer",
                  opacity: currentIndex <= 0 ? 0.4 : 1,
                }}
              >
                Previous
              </button>

              <button
                type="button"
                onClick={handleSaveAndNext}
                style={{
                  background: isLastQuestion ? "#10b981" : "var(--primary-500)",
                  color: "#ffffff",
                  border: "none",
                  padding: "0.55rem 1.5rem",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: isLastQuestion
                    ? "0 2px 10px rgba(16, 185, 129, 0.35)"
                    : "0 2px 10px rgba(99, 102, 241, 0.35)",
                }}
              >
                {isLastQuestion ? "Save & Submit" : "Save & Next"}
              </button>
            </div>
          </footer>

          {/* Single Sticky Bottom Bar on Mobile (< 768px) */}
          <nav
            className="cbt-mobile-sticky-bar"
            aria-label="Mobile Question Navigation"
          >
            <button
              type="button"
              onClick={() => handleNavigateQuestion(currentIndex - 1)}
              disabled={currentIndex <= 0}
              aria-label="Previous Question"
              style={{
                minHeight: "44px",
                background: "var(--bg-surface-elevated)",
                color: "var(--text-main)",
                border: "1px solid var(--border-color)",
                padding: "0.5rem 0.85rem",
                borderRadius: "8px",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: currentIndex <= 0 ? "not-allowed" : "pointer",
                opacity: currentIndex <= 0 ? 0.35 : 1,
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
              }}
            >
              <ChevronLeft size={16} />
              <span className="cbt-mobile-btn-text">Prev</span>
            </button>

            <button
              type="button"
              onClick={handleToggleMarkReview}
              aria-label="Mark for Review"
              style={{
                minHeight: "44px",
                background: currentAnswer?.is_marked_for_review
                  ? "rgba(249, 115, 22, 0.18)"
                  : "var(--bg-surface-elevated)",
                color: currentAnswer?.is_marked_for_review ? "#f97316" : "var(--text-main)",
                border: currentAnswer?.is_marked_for_review
                  ? "1px solid #f97316"
                  : "1px solid var(--border-color)",
                padding: "0.5rem 0.85rem",
                borderRadius: "8px",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
              }}
            >
              <Flag size={14} />
              <span className="cbt-mobile-btn-text">Review</span>
            </button>

            <button
              type="button"
              onClick={handleSaveAndNext}
              aria-label={isLastQuestion ? "Save and Submit" : "Save and Next"}
              style={{
                minHeight: "44px",
                flex: 1,
                background: isLastQuestion ? "#10b981" : "var(--primary-500)",
                color: "#ffffff",
                border: "none",
                padding: "0.5rem 1rem",
                borderRadius: "8px",
                fontSize: "0.88rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.35rem",
                boxShadow: isLastQuestion
                  ? "0 2px 10px rgba(16, 185, 129, 0.4)"
                  : "0 2px 10px rgba(99, 102, 241, 0.4)",
              }}
            >
              <span>{isLastQuestion ? "Save & Submit" : "Save & Next"}</span>
              <ChevronRight size={16} />
            </button>
          </nav>
        </section>
      </div>

      {/* =========================================================================
          3. MOBILE QUESTION PALETTE BOTTOM SHEET
          ========================================================================= */}
      {showMobilePalette && (
        <div
          className="cbt-drawer-overlay"
          onClick={() => setShowMobilePalette(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(6px)",
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
          }}
        >
          <div
            className="cbt-drawer-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg-surface)",
              borderTop: "1px solid var(--border-color)",
              borderTopLeftRadius: "20px",
              borderTopRightRadius: "20px",
              paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 16px))",
              boxShadow: "var(--shadow-xl)",
            }}
          >
            {/* Sheet Handle & Title */}
            <div style={{ padding: "0.75rem 1.25rem 0.5rem", borderBottom: "1px solid var(--border-color)" }}>
              <div
                style={{
                  width: "40px",
                  height: "4px",
                  borderRadius: "2px",
                  background: "var(--border-color)",
                  margin: "0 auto 0.75rem",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--text-main)" }}>
                  Question Palette
                </div>
                <button
                  type="button"
                  onClick={() => setShowMobilePalette(false)}
                  aria-label="Close Palette"
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    background: "var(--bg-surface-elevated)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-main)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Legend */}
            <div
              style={{
                padding: "0.75rem 1.25rem",
                background: "var(--bg-surface-elevated)",
                borderBottom: "1px solid var(--border-color)",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.5rem",
                fontSize: "0.75rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />
                <span style={{ color: "var(--text-main)" }}>Answered ({summaryCounts.answered})</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "var(--primary-500)", flexShrink: 0 }} />
                <span style={{ color: "var(--text-main)" }}>Current</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#f97316", flexShrink: 0 }} />
                <span style={{ color: "var(--text-main)" }}>Review ({summaryCounts.review})</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "var(--bg-surface)", border: "1px solid var(--border-color)", flexShrink: 0 }} />
                <span style={{ color: "var(--text-muted)" }}>Unanswered</span>
              </div>
            </div>

            {/* Grid of Questions */}
            <div
              style={{
                padding: "1.25rem",
                overflowY: "auto",
                maxHeight: "45vh",
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: "0.65rem",
              }}
            >
              {sessionData.questions.map((q, idx) => {
                const status = getQuestionStatus(q);
                const isCurrent = idx === currentIndex;

                let bgColor = "var(--bg-surface-elevated)";
                let textColor = "var(--text-main)";
                let border = "1px solid var(--border-color)";

                if (isCurrent) {
                  bgColor = "var(--primary-500)";
                  textColor = "#ffffff";
                  border = "2px solid var(--primary-500)";
                } else if (status === "ANSWERED" || status === "ANSWERED_AND_REVIEW") {
                  bgColor = "#10b981";
                  textColor = "#ffffff";
                  border = "none";
                } else if (status === "MARKED_FOR_REVIEW") {
                  bgColor = "#f97316";
                  textColor = "#ffffff";
                  border = "none";
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    className="cbt-palette-btn"
                    onClick={() => {
                      handleNavigateQuestion(idx);
                      setShowMobilePalette(false);
                    }}
                    aria-label={`Jump to Question ${idx + 1}`}
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "10px",
                      background: bgColor,
                      color: textColor,
                      border: border,
                      fontSize: "0.92rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto",
                      boxShadow: isCurrent ? "0 0 10px rgba(99, 102, 241, 0.4)" : "none",
                    }}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Close Button at bottom */}
            <div style={{ padding: "0.75rem 1.25rem", borderTop: "1px solid var(--border-color)" }}>
              <button
                type="button"
                onClick={() => setShowMobilePalette(false)}
                style={{
                  width: "100%",
                  minHeight: "44px",
                  background: "var(--primary-500)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  cursor: "pointer",
                }}
              >
                Close Palette
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          4. SUBMIT CONFIRMATION MODAL
          ========================================================================= */}
      {showSubmitModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 70,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-color)",
              borderRadius: "16px",
              padding: "2rem 1.75rem",
              maxWidth: "420px",
              width: "100%",
              textAlign: "center",
              boxShadow: "var(--shadow-xl)",
            }}
          >
            {/* Warning Circle Icon */}
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.15)",
                border: "2px solid #ef4444",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1.25rem",
              }}
            >
              <AlertTriangle size={28} color="#ef4444" />
            </div>

            <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-main)", margin: "0 0 0.5rem 0" }}>
              Submit Examination?
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: 1.5, margin: "0 0 1.5rem 0" }}>
              Are you sure you want to finalize your submission? You will not be able to modify your answers once submitted.
            </p>

            {/* Summary Statistics List */}
            <div
              style={{
                background: "var(--bg-surface-elevated)",
                border: "1px solid var(--border-color)",
                borderRadius: "10px",
                padding: "1rem",
                marginBottom: "1.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
                fontSize: "0.85rem",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Total Questions</span>
                <strong style={{ color: "var(--text-main)" }}>{sessionData.questions.length}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Answered</span>
                <strong style={{ color: "#10b981" }}>{summaryCounts.answered}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Unanswered</span>
                <strong style={{ color: "#ef4444" }}>{summaryCounts.notAnswered + summaryCounts.notVisited}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Marked for Review</span>
                <strong style={{ color: "#f97316" }}>{summaryCounts.review}</strong>
              </div>
            </div>

            {/* Action Buttons: Cancel vs Submit */}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  minHeight: "44px",
                  background: "var(--bg-surface-elevated)",
                  color: "var(--text-main)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                }}
              >
                Continue Exam
              </button>
              <button
                type="button"
                onClick={() => submitExam(false)}
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  minHeight: "44px",
                  background: "#ef4444",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  boxShadow: "0 4px 14px rgba(239, 68, 68, 0.4)",
                }}
              >
                {isSubmitting ? "Submitting..." : "Yes, Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          5. TIME EXPIRED MODAL
          ========================================================================= */}
      {isTimeExpiredModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 80,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "var(--bg-surface)",
              border: "2px solid #ef4444",
              borderRadius: "16px",
              padding: "2.25rem 2rem",
              maxWidth: "420px",
              width: "100%",
              textAlign: "center",
              boxShadow: "var(--shadow-xl)",
            }}
          >
            <Clock size={48} color="#ef4444" style={{ margin: "0 auto 1rem" }} />
            <h2 style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text-main)", marginBottom: "0.5rem" }}>
              Time Has Expired!
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", lineHeight: 1.5, marginBottom: "1.5rem" }}>
              Your allocated examination time is complete. Your saved responses are being automatically submitted.
            </p>
            <div style={{ color: "#ef4444", fontSize: "0.85rem", fontWeight: 600 }}>
              Finalizing examination...
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          6. INSTRUCTIONS & DETAILS MODAL
          ========================================================================= */}
      {showInstructionsModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 75,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-color)",
              borderRadius: "16px",
              padding: "1.75rem",
              maxWidth: "440px",
              width: "100%",
              boxShadow: "var(--shadow-xl)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text-main)" }}>
                Examination Instructions
              </div>
              <button
                type="button"
                onClick={() => setShowInstructionsModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                <X size={18} />
              </button>
            </div>

            <ul style={{ margin: "0 0 1.5rem 0", paddingLeft: "1.25rem", color: "var(--text-main)", fontSize: "0.88rem", lineHeight: 1.6 }}>
              <li>Read each question carefully before choosing your response.</li>
              <li>Selected answers are automatically saved to the server.</li>
              <li>You can mark questions for review and return at any time.</li>
              <li>Use the Question Palette to jump directly to any question.</li>
              <li>Do not refresh or navigate away from the examination window.</li>
            </ul>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <button
                type="button"
                onClick={() => {
                  setShowInstructionsModal(false);
                  handleClearClick();
                }}
                disabled={!currentQuestionHasAnswer}
                style={{
                  minHeight: "42px",
                  background: "var(--bg-surface-elevated)",
                  color: currentQuestionHasAnswer ? "var(--text-main)" : "var(--text-muted)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: currentQuestionHasAnswer ? "pointer" : "default",
                  opacity: currentQuestionHasAnswer ? 1 : 0.5,
                }}
              >
                Clear Current Response
              </button>
              <button
                type="button"
                onClick={() => setShowInstructionsModal(false)}
                style={{
                  minHeight: "44px",
                  background: "var(--primary-500)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  cursor: "pointer",
                }}
              >
                Return to Exam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          7. CLEAR RESPONSE CONFIRMATION MODAL
          ========================================================================= */}
      {showClearConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 75,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-color)",
              borderRadius: "16px",
              padding: "1.75rem",
              maxWidth: "400px",
              width: "100%",
              boxShadow: "var(--shadow-xl)",
            }}
          >
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-main)", margin: "0 0 0.5rem 0" }}>
              Clear Question Response?
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: 1.5, margin: "0 0 1.5rem 0" }}>
              Your selected answer for Question {currentIndex + 1} will be cleared and marked as unattempted.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                style={{
                  minHeight: "40px",
                  background: "var(--bg-surface-elevated)",
                  color: "var(--text-main)",
                  border: "1px solid var(--border-color)",
                  padding: "0.5rem 1rem",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeClearResponse}
                style={{
                  minHeight: "40px",
                  background: "#ef4444",
                  color: "#ffffff",
                  border: "none",
                  padding: "0.5rem 1.25rem",
                  borderRadius: "8px",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                Clear Answer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          8. COMPLETE BLOCKING EXAM PAUSE OVERLAY MODAL
          ========================================================================= */}
      {isExamPaused && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(9, 10, 15, 0.94)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            padding: "1.5rem",
            userSelect: "none",
            pointerEvents: "auto",
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="exam-paused-modal-title"
        >
          <div
            style={{
              background: "var(--bg-surface)",
              border: "2px solid var(--amber-500, #f59e0b)",
              borderRadius: "20px",
              padding: "2.5rem 2rem",
              maxWidth: "480px",
              width: "100%",
              textAlign: "center",
              boxShadow: "0 25px 60px rgba(0, 0, 0, 0.8), 0 0 35px rgba(245, 158, 11, 0.25)",
            }}
          >
            {/* Pulsing Pause Icon Badge */}
            <div
              style={{
                width: "70px",
                height: "70px",
                borderRadius: "50%",
                background: "rgba(245, 158, 11, 0.15)",
                border: "2px solid #f59e0b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1.25rem",
                boxShadow: "0 0 24px rgba(245, 158, 11, 0.3)",
              }}
            >
              <Pause size={34} color="#f59e0b" strokeWidth={2.5} />
            </div>

            <h2
              id="exam-paused-modal-title"
              style={{
                fontSize: "1.5rem",
                fontWeight: 800,
                color: "var(--text-main)",
                margin: "0 0 0.6rem 0",
                letterSpacing: "-0.01em",
              }}
            >
              Exam Paused
            </h2>

            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.92rem",
                lineHeight: 1.6,
                margin: "0 0 1.5rem 0",
              }}
            >
              This examination has been temporarily paused by the proctor / administrator. All test interaction is locked, and your countdown timer is frozen.
            </p>

            {/* Frozen Time Remaining Card */}
            <div
              style={{
                background: "var(--bg-surface-elevated)",
                border: "1px solid var(--border-color)",
                borderRadius: "12px",
                padding: "1rem 1.25rem",
                marginBottom: "1.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <Clock size={20} color="#f59e0b" />
                <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-muted)" }}>
                  Remaining Time
                </span>
              </div>
              <ExamTimer
                expiresAtMs={expiresAtMs.current}
                serverOffsetMs={serverOffsetMs.current}
                isPaused={true}
              />
            </div>

            {/* Progress Safety Guarantee */}
            <div
              style={{
                background: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                borderRadius: "10px",
                padding: "0.75rem 1rem",
                fontSize: "0.82rem",
                color: "#10b981",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
              }}
            >
              <CheckSquare size={16} />
              <span>Your saved answers and progress are preserved safely.</span>
            </div>

            {/* Auto-Resume Polling Indicator */}
            <div
              style={{
                marginTop: "1.25rem",
                fontSize: "0.8rem",
                color: "var(--text-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.45rem",
              }}
            >
              <RefreshCw size={13} className="animate-spin" />
              <span>Waiting for administrator to resume examination...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
