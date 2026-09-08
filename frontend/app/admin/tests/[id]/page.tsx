"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import NextLink from "next/link";
import {
  api,
  Test,
  Subject,
  TestSeries,
  Question,
  TestAuditLog,
} from "@/lib/api";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { MathRenderer } from "@/components/MathRenderer";
import { RichMathEditor, RichMathEditorHandle } from "@/components/RichMathEditor";
import { normalizeMathContent, validateMathSyntax } from "@/lib/mathNormalizer";
import { cleanUniversalPaste, handleUniversalPasteEvent } from "@/lib/universalPasteEngine";
import { Toast, ToastType } from "@/components/Toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useAdminAutoRefresh } from "@/lib/hooks/useAdminAutoRefresh";
import { copyExamInvitation, copyExamLink, formatExamInvitation } from "@/lib/invitation";

import {
  FileText,
  Clock,
  CheckCircle2,
  Sliders,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  Send,
  X,
  Eye,
  AlertCircle,
  AlertTriangle,
  PenTool,
  Copy,
  History,
  Lock,
  Radio,
  Image as ImageIcon,
  Check,
  Calendar,
  Layers,
  HelpCircle,
  Edit3,
  CornerDownLeft,
  Zap,
  ArrowUpDown,
  FileCheck,
  ShieldCheck,
  StopCircle,
  RotateCcw,
  Pause,
  Play,
  XCircle,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Award,
  ExternalLink,
  Share2,
} from "lucide-react";

type CBTQuestionType =
  | "MCQ"
  | "MULTIPLE_CHOICE"
  | "NUMERICAL"
  | "TRUE_FALSE"
  | "ASSERTION_REASON"
  | "MATCH_THE_FOLLOWING"
  | "FILL_BLANK";

interface QuestionTypeMeta {
  type: CBTQuestionType;
  label: string;
  short: string;
  badgeBg: string;
  badgeColor: string;
  desc: string;
}

const CBT_QUESTION_TYPES: QuestionTypeMeta[] = [
  {
    type: "MCQ",
    label: "Single-choice MCQ",
    short: "MCQ",
    badgeBg: "rgba(99, 102, 241, 0.15)",
    badgeColor: "#818cf8",
    desc: "Single correct option among multiple choices",
  },
  {
    type: "MULTIPLE_CHOICE",
    label: "Multiple-choice",
    short: "MULTI",
    badgeBg: "rgba(168, 85, 247, 0.15)",
    badgeColor: "#c084fc",
    desc: "One or more correct options (Multi-correct)",
  },
  {
    type: "NUMERICAL",
    label: "Numerical / Integer",
    short: "NUM",
    badgeBg: "rgba(245, 158, 11, 0.15)",
    badgeColor: "#fbbf24",
    desc: "Numerical value with configurable tolerance",
  },
  {
    type: "TRUE_FALSE",
    label: "True / False",
    short: "T/F",
    badgeBg: "rgba(16, 185, 129, 0.15)",
    badgeColor: "#34d399",
    desc: "Binary True / False verification statement",
  },
  {
    type: "ASSERTION_REASON",
    label: "Assertion / Reason",
    short: "A/R",
    badgeBg: "rgba(236, 72, 153, 0.15)",
    badgeColor: "#f472b6",
    desc: "Assertion & Reason relationship analysis",
  },
  {
    type: "MATCH_THE_FOLLOWING",
    label: "Match Following",
    short: "MATCH",
    badgeBg: "rgba(14, 165, 233, 0.15)",
    badgeColor: "#38bdf8",
    desc: "Match items from Column I to Column II",
  },
  {
    type: "FILL_BLANK",
    label: "Fill in the Blank",
    short: "BLANK",
    badgeBg: "rgba(234, 179, 8, 0.15)",
    badgeColor: "#facc15",
    desc: "Direct numerical or text answer entry",
  },
];

function getQuestionTypeMeta(type: string): QuestionTypeMeta {
  return (
    CBT_QUESTION_TYPES.find((t) => t.type === type) || {
      type: "MCQ",
      label: type,
      short: type,
      badgeBg: "rgba(99, 102, 241, 0.15)",
      badgeColor: "#818cf8",
      desc: "",
    }
  );
}

export default function TestManagementWorkbenchPage() {
  return (
    <Suspense fallback={<div className="container" style={{ padding: "4rem 1rem", textAlign: "center", color: "var(--text-muted)" }}>Loading test paper...</div>}>
      <TestManagementWorkbenchContent />
    </Suspense>
  );
}

function TestManagementWorkbenchContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const testId = params.id as string;

  // Active sub-section: "questions" | "details" | "audit"
  const initialTab = searchParams.get("step") === "questions" ? "questions" : "questions";
  const [activeTab, setActiveTab] = useState<"questions" | "details" | "audit">(initialTab);

  const [test, setTest] = useState<Test | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State (Details & Settings)
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [topicsCovered, setTopicsCovered] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [testSeriesId, setTestSeriesId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);

  const [positiveMarks, setPositiveMarks] = useState(4.0);
  const [negativeMarks, setNegativeMarks] = useState(1.0);
  const [questionOrder, setQuestionOrder] = useState<"FIXED" | "RANDOM">("FIXED");
  const [optionOrder, setOptionOrder] = useState<"FIXED" | "RANDOM">("FIXED");
  const [resultVisibility, setResultVisibility] = useState<"IMMEDIATELY" | "HIDDEN" | "SCHEDULED">("IMMEDIATELY");
  const [showAnswers, setShowAnswers] = useState(true);
  const [showExplanation, setShowExplanation] = useState(true);
  const [allowResume, setAllowResume] = useState(true);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  // Questions in test
  const [questions, setQuestions] = useState<any[]>([]);

  // Metadata dropdowns
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [seriesList, setSeriesList] = useState<TestSeries[]>([]);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<TestAuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Student Exam Preview Modal
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const [previewQIndex, setPreviewQIndex] = useState<number>(0);

  // Unsaved changes & copy feedback
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Progressive disclosure for advanced settings
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);

  // Publishing Success Modal
  const [showPublishSummaryModal, setShowPublishSummaryModal] = useState<boolean>(false);
  const [publishScheduleMode, setPublishScheduleMode] = useState<"IMMEDIATE" | "SCHEDULED">("IMMEDIATE");
  const [isLiveCorrection, setIsLiveCorrection] = useState<boolean>(false);
  const [showPublishSuccessModal, setShowPublishSuccessModal] = useState<boolean>(false);
  const [publishedTestInfo, setPublishedTestInfo] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Interactive Student CBT Simulation State
  const [simAnswers, setSimAnswers] = useState<Record<number, string>>({});
  const [simMarkedReview, setSimMarkedReview] = useState<Set<number>>(new Set());
  const [simVisited, setSimVisited] = useState<Set<number>>(new Set([0]));
  const [simTimeRemaining, setSimTimeRemaining] = useState<number>(0);
  const [simSubmitted, setSimSubmitted] = useState<boolean>(false);
  const [showSimSubmitConfirm, setShowSimSubmitConfirm] = useState<boolean>(false);

  // Inline Add/Edit Question Modal
  const [showAddQuestionModal, setShowAddQuestionModal] = useState<boolean>(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"ADD" | "EDIT" | "DUPLICATE">("ADD");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [modalToast, setModalToast] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [showMoreSettings, setShowMoreSettings] = useState<boolean>(false);
  const [composerKey, setComposerKey] = useState<number>(() => Date.now());

  // Global Accessible Toast and Confirmation Modal
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const showToast = (message: string, type: ToastType = "info") => setToast({ message, type });
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: "danger" | "warning" | "primary";
    loading?: boolean;
    onConfirm: () => Promise<void> | void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Persistent defaults across consecutive questions (High authoring speed)
  const [lastQType, setLastQType] = useState<CBTQuestionType>("MCQ");
  const [lastMarks, setLastMarks] = useState<number>(4.0);
  const [lastNegativeMarks, setLastNegativeMarks] = useState<number>(1.0);
  const [lastDifficulty, setLastDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");

  // Current Question Composer fields
  const [qType, setQType] = useState<CBTQuestionType>("MCQ");
  const [qContent, setQContent] = useState("");
  const [qExplanation, setQExplanation] = useState("");
  const [qHint, setQHint] = useState("");
  const [qMarks, setQMarks] = useState<number>(4.0);
  const [qNegativeMarks, setQNegativeMarks] = useState<number>(1.0);
  const [qDifficulty, setQDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");

  // Options for MCQ / MULTIPLE_CHOICE / TRUE_FALSE / ASSERTION_REASON / MATCH_THE_FOLLOWING
  const [qOptions, setQOptions] = useState<Array<{ content: string; is_correct: boolean }>>([
    { content: "", is_correct: true },
    { content: "", is_correct: false },
    { content: "", is_correct: false },
    { content: "", is_correct: false },
  ]);

  // Numerical / Short Answer Fields
  const [qNumericalAnswer, setQNumericalAnswer] = useState<string>("");
  const [qNumericalTolerance, setQNumericalTolerance] = useState<string>("0.0");

  // Image Upload State
  const [uploadingImage, setUploadingImage] = useState(false);
  const [qImageUrl, setQImageUrl] = useState<string | null>(null);

  // Universal Paste & Question Editor State
  const [editorViewMode, setEditorViewMode] = useState<"visual" | "code">("visual");
  const [pastingMedia, setPastingMedia] = useState(false);

  // Focus & Rich Editor Refs
  const [activeEditorTarget, setActiveEditorTarget] = useState<{
    type: "question" | "option" | "hint" | "explanation";
    index?: number;
  }>({ type: "question" });
  const questionEditorRef = useRef<RichMathEditorHandle>(null);
  const optionEditorRefs = useRef<(RichMathEditorHandle | null)[]>([]);
  const hintEditorRef = useRef<RichMathEditorHandle>(null);
  const explanationEditorRef = useRef<RichMathEditorHandle>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, [testId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [testData, subjs, series] = await Promise.all([
        api.getTest(testId),
        api.getSubjects(),
        api.listTestSeries({ page_size: 100 }),
      ]);

      setTest(testData);
      setSubjects(subjs);
      setSeriesList(series.items || []);

      // Populate form state
      setTitle(testData.title);
      setCode(testData.code);
      setDescription(testData.description || "");
      setInstructions(testData.instructions || "");
      setTopicsCovered(testData.topics_covered || "");
      setSubjectId(testData.subject_id || "");
      setTestSeriesId(testData.test_series_id || "");
      setDurationMinutes(testData.duration_minutes);
      setPositiveMarks(testData.positive_marks);
      setNegativeMarks(testData.negative_marks);
      setQuestionOrder(testData.question_order);
      setOptionOrder(testData.option_order);
      setResultVisibility(testData.result_visibility);
      setShowAnswers(testData.show_answers);
      setShowExplanation(testData.show_explanation);
      setAllowResume(testData.allow_resume);
      setStartTime(testData.start_time ? testData.start_time.substring(0, 16) : "");
      setEndTime(testData.end_time ? testData.end_time.substring(0, 16) : "");

      // Questions
      const qs = (testData.questions || []).map((tq) => ({
        ...tq.question,
        test_question_id: tq.id,
        order_index: tq.order_index,
        marks: tq.marks ?? testData.positive_marks,
        negative_marks: tq.negative_marks ?? testData.negative_marks,
      }));
      setQuestions(qs);
    } catch (e: any) {
      setError(e.message || "Failed to load test");
    } finally {
      setLoading(false);
    }
  };

  const loadAuditHistory = async () => {
    setLoadingAudit(true);
    try {
      const logs = await api.getTestAuditLogs(testId);
      setAuditLogs(logs);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingAudit(false);
    }
  };

  // Silent background revalidation for candidate counts, status changes, and logs
  useAdminAutoRefresh({
    intervalMs: 5000,
    enabled: !isDirty && !showAddQuestionModal && !showPreviewModal && !showPublishSummaryModal && !showPublishSuccessModal && !confirmModal.isOpen,
    onRefresh: async () => {
      try {
        const freshTest = await api.getTest(testId);
        setTest(freshTest);
        if (activeTab === "audit") {
          const logs = await api.getTestAuditLogs(testId);
          setAuditLogs(logs);
        }
      } catch (e) {
        // Silent error handling for background polling
      }
    },
  });

  const isLive = test?.status === "LIVE" || test?.status === "PUBLISHED";
  const isDraft = test?.status === "DRAFT";
  const isScheduled = test?.status === "SCHEDULED";
  const isPaused = test?.status === "PAUSED";
  const isCompleted = test?.status === "COMPLETED" || test?.status === "CLOSED";
  const isCancelled = test?.status === "CANCELLED";
  const activeCandidatesCount = test?.active_candidates_count ?? 0;
  const hasActiveCandidates = activeCandidatesCount > 0;
  const totalCompletedCount = test?.total_submissions ?? test?.attempts_count ?? 0;
  const hasAttempts = (test?.attempts_count || 0) > 0 || (test?.total_participants || 0) > 0;
  const isStructuralLocked = (!isDraft && hasActiveCandidates) || isCompleted || isCancelled;

  const [copiedInvitation, setCopiedInvitation] = useState<boolean>(false);

  // 1-Click Access Code Copy Handler
  const handleCopyCode = async (codeToCopy: string) => {
    if (!codeToCopy) return;
    await navigator.clipboard.writeText(codeToCopy);
    setCopiedCode(true);
    showToast("Access code copied to clipboard.", "success");
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleCopyLink = async (codeToCopy: string) => {
    if (!codeToCopy) return;
    const ok = await copyExamLink(codeToCopy);
    if (ok) {
      setCopiedLink(true);
      showToast("Examination link copied successfully.", "success");
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleCopyInvitation = async () => {
    if (!test || !code) return;
    const ok = await copyExamInvitation({
      title: title || test.title,
      code: code,
      subject_name: test.subject_name,
      duration_minutes: durationMinutes,
      total_questions: questions.length,
      total_marks: calculatedTotalMarks,
      start_time: test.start_time,
      end_time: test.end_time,
      instructions: instructions || test.instructions,
    });
    if (ok) {
      setCopiedInvitation(true);
      showToast("Examination invitation copied successfully.", "success");
      setTimeout(() => setCopiedInvitation(false), 2500);
    }
  };

  // Student CBT Examination Simulation Countdown Timer
  useEffect(() => {
    if (!showPreviewModal) return;
    setSimTimeRemaining((durationMinutes || 60) * 60);
    setSimAnswers({});
    setSimMarkedReview(new Set());
    setSimVisited(new Set([0]));
    setSimSubmitted(false);
    setShowSimSubmitConfirm(false);
    setPreviewQIndex(0);

    const timer = setInterval(() => {
      setSimTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showPreviewModal, durationMinutes]);

  // Format seconds into MM:SS or HH:MM:SS
  const formatTimer = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    if (hrs > 0) return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    return `${pad(mins)}:${pad(secs)}`;
  };

  // Pre-Publishing Validation Evaluator (Requirement 7)
  const getPublishValidationErrors = (): string[] => {
    const errs: string[] = [];
    if (questions.length === 0) {
      errs.push("The examination paper contains 0 questions. Add at least one question before publishing.");
    }
    if (!durationMinutes || durationMinutes <= 0) {
      errs.push("Examination duration must be greater than 0 minutes.");
    }
    if (!subjectId) {
      errs.push("Please assign a valid subject to this examination.");
    }
    questions.forEach((q, idx) => {
      const qNum = idx + 1;
      if (!q.content || !q.content.trim()) {
        errs.push(`Question #${qNum}: Question statement content cannot be blank.`);
      } else {
        const mathVal = validateMathSyntax(q.content);
        if (!mathVal.isValid) {
          errs.push(`Question #${qNum}: Mathematical notation issue - ${mathVal.issues[0]?.errorMessage}`);
        }
      }

      const isChoiceBased = ["MCQ", "MULTIPLE_CHOICE", "TRUE_FALSE", "ASSERTION_REASON", "MATCH_THE_FOLLOWING"].includes(q.question_type);
      if (isChoiceBased) {
        if (!q.options || q.options.length < 2) {
          errs.push(`Question #${qNum} (${q.question_type}): Must have at least 2 answer choices.`);
        } else {
          const hasCorrect = q.options.some((o: any) => o.is_correct);
          if (!hasCorrect) {
            errs.push(`Question #${qNum} (${q.question_type}): No correct answer option has been selected.`);
          }
          const hasEmpty = q.options.some((o: any) => !o.content || !o.content.trim());
          if (hasEmpty) {
            errs.push(`Question #${qNum}: One or more option text descriptions are blank.`);
          }
          q.options.forEach((opt: any, optIdx: number) => {
            if (opt.content && opt.content.trim()) {
              const optMathVal = validateMathSyntax(opt.content);
              if (!optMathVal.isValid) {
                errs.push(`Question #${qNum} (Option ${String.fromCharCode(65 + optIdx)}): Math notation issue - ${optMathVal.issues[0]?.errorMessage}`);
              }
            }
          });
        }
      }
      if (q.question_type === "NUMERICAL") {
        if (q.numerical_answer === undefined || q.numerical_answer === null || q.numerical_answer === "") {
          errs.push(`Question #${qNum} (Numerical): Correct numerical answer value is missing.`);
        }
      }
    });
    return errs;
  };

  // Save Test Details & Settings
  const handleSaveDraft = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const payload: any = {
        title: title.trim(),
        description: description.trim() || null,
        instructions: instructions.trim() || null,
        topics_covered: topicsCovered.trim() || null,
        subject_id: subjectId || null,
        test_series_id: testSeriesId || null,
        duration_minutes: durationMinutes,
        positive_marks: positiveMarks,
        negative_marks: negativeMarks,
        question_order: questionOrder,
        option_order: optionOrder,
        result_visibility: resultVisibility,
        show_answers: showAnswers,
        show_explanation: showExplanation,
        allow_resume: allowResume,
        start_time: startTime ? new Date(startTime).toISOString() : null,
        end_time: endTime ? new Date(endTime).toISOString() : null,
      };

      const updated = await api.updateTest(testId, payload);
      setTest(updated);
      setIsDirty(false);
      setSuccessMsg("Test draft and configuration saved successfully.");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to save test settings.");
    } finally {
      setSaving(false);
    }
  };

  // Pre-Publish Validation Summary & Execution
  const handlePublish = () => {
    setPublishScheduleMode(startTime ? "SCHEDULED" : "IMMEDIATE");
    setShowPublishSummaryModal(true);
  };

  const executeConfirmPublish = async () => {
    const valErrors = getPublishValidationErrors();
    if (valErrors.length > 0) {
      alert("Please resolve the validation issues before publishing.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        title: title.trim(),
        description: description.trim() || null,
        instructions: instructions.trim() || null,
        topics_covered: topicsCovered.trim() || null,
        subject_id: subjectId || null,
        test_series_id: testSeriesId || null,
        duration_minutes: Number(durationMinutes) || 60,
        positive_marks: positiveMarks,
        negative_marks: negativeMarks,
        question_order: questionOrder,
        option_order: optionOrder,
        result_visibility: resultVisibility,
        show_answers: showAnswers,
        show_explanation: showExplanation,
        allow_resume: allowResume,
        start_time: publishScheduleMode === "SCHEDULED" && startTime ? new Date(startTime).toISOString() : null,
        end_time: publishScheduleMode === "SCHEDULED" && endTime ? new Date(endTime).toISOString() : null,
      };

      if (publishScheduleMode === "SCHEDULED" && !startTime) {
        alert("Please specify a valid scheduled start time.");
        setSaving(false);
        return;
      }

      await api.updateTest(testId, payload);

      const published = await api.publishTest(testId);
      setTest(published);
      setCode(published.code);
      setShowPublishSummaryModal(false);
      setIsDirty(false);
      setPublishedTestInfo(published);
      setShowPublishSuccessModal(true);
      loadAuditHistory();
    } catch (e: any) {
      setError(e.message || "Failed to publish test.");
    } finally {
      setSaving(false);
    }
  };

  // Conclude Live Examination
  const handleEndExam = () => {
    setConfirmModal({
      isOpen: true,
      title: "Conclude Examination",
      message: "Conclude this examination now? The test status will be marked as COMPLETED and no further student attempts will be accepted.",
      confirmLabel: "Conclude Test",
      variant: "warning",
      onConfirm: async () => {
        setSaving(true);
        try {
          const completed = await api.completeTest(testId);
          setTest(completed);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          setToast({ message: "Examination marked as COMPLETED.", type: "success" });
          loadAuditHistory();
        } catch (e: any) {
          setToast({ message: e.message || "Failed to conclude examination.", type: "error" });
        } finally {
          setSaving(false);
        }
      },
    });
  };

  // Restore Archived Test
  const handleRestoreTest = () => {
    setConfirmModal({
      isOpen: true,
      title: "Restore Examination",
      message: "Restore this archived test back to active draft status?",
      confirmLabel: "Restore Test",
      variant: "primary",
      onConfirm: async () => {
        setSaving(true);
        try {
          const restored = await api.restoreTest(testId);
          setTest(restored);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          setToast({ message: "Test paper restored successfully.", type: "success" });
          loadAuditHistory();
        } catch (e: any) {
          setToast({ message: e.message || "Failed to restore test.", type: "error" });
        } finally {
          setSaving(false);
        }
      },
    });
  };

  // Pause Live Examination
  const handlePauseExam = () => {
    setConfirmModal({
      isOpen: true,
      title: "Pause Examination",
      message: "Pause this examination now? New candidate entries and question answering will be frozen until resumed.",
      confirmLabel: "Pause Test",
      variant: "warning",
      onConfirm: async () => {
        setSaving(true);
        try {
          const paused = await api.pauseTest(testId);
          setTest(paused);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          setToast({ message: "Examination PAUSED. Student timers and answering are frozen.", type: "warning" });
          loadAuditHistory();
        } catch (e: any) {
          setToast({ message: e.message || "Failed to pause examination.", type: "error" });
        } finally {
          setSaving(false);
        }
      },
    });
  };

  // Resume Paused Examination
  const handleResumeExam = () => {
    setConfirmModal({
      isOpen: true,
      title: "Resume Examination",
      message: "Resume this examination? Active candidate timers will be extended by the pause duration and answering unlocked.",
      confirmLabel: "Resume Test",
      variant: "primary",
      onConfirm: async () => {
        setSaving(true);
        try {
          const resumed = await api.resumeTest(testId);
          setTest(resumed);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          setToast({ message: "Examination RESUMED successfully.", type: "success" });
          loadAuditHistory();
        } catch (e: any) {
          setToast({ message: e.message || "Failed to resume examination.", type: "error" });
        } finally {
          setSaving(false);
        }
      },
    });
  };

  // Cancel Examination
  const handleCancelExam = () => {
    setConfirmModal({
      isOpen: true,
      title: "Cancel Examination",
      message: "Permanently cancel this examination? Candidates will no longer be able to write or access the test. Historical results and logs will be preserved.",
      confirmLabel: "Cancel Exam",
      variant: "danger",
      onConfirm: async () => {
        setSaving(true);
        try {
          const cancelled = await api.cancelTest(testId, "Administrative cancellation");
          setTest(cancelled);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          setToast({ message: "Examination CANCELLED.", type: "warning" });
          loadAuditHistory();
        } catch (e: any) {
          setToast({ message: e.message || "Failed to cancel examination.", type: "error" });
        } finally {
          setSaving(false);
        }
      },
    });
  };

  // Move Scheduled Exam back to Draft
  const handleUnscheduleExam = () => {
    setConfirmModal({
      isOpen: true,
      title: "Move to Draft",
      message: "Move this scheduled examination back to DRAFT? You will be able to edit its questions and schedule settings.",
      confirmLabel: "Move to Draft",
      variant: "warning",
      onConfirm: async () => {
        setSaving(true);
        try {
          const draft = await api.unscheduleTest(testId);
          setTest(draft);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          setToast({ message: "Examination moved back to DRAFT.", type: "success" });
          loadAuditHistory();
        } catch (e: any) {
          setToast({ message: e.message || "Failed to unschedule examination.", type: "error" });
        } finally {
          setSaving(false);
        }
      },
    });
  };

  // Duplicate Examination as a new paper
  const handleDuplicateExam = async () => {
    setSaving(true);
    try {
      const duplicated = await api.duplicateTest(testId);
      router.push(`/admin/tests/${duplicated.id}`);
    } catch (e: any) {
      setError(e.message || "Failed to duplicate examination.");
      setSaving(false);
    }
  };

  // Permanently delete test paper
  const handleDeletePaper = () => {
    const deletableStatuses = ["DRAFT", "ARCHIVED", "CANCELLED"];
    if (!test || !deletableStatuses.includes(test.status)) {
      showToast(`Cannot delete a ${test?.status} test. Only DRAFT, ARCHIVED, or CANCELLED tests can be deleted.`, "error");
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: "⚠️ Permanently Delete Test Paper",
      message: `This will PERMANENTLY delete "${test?.title || "this test"}" and ALL associated data — questions, candidate attempts, answers, audit logs, and results. This action CANNOT be undone.\n\nAre you absolutely sure?`,
      confirmLabel: "Yes, Delete Permanently",
      variant: "danger",
      onConfirm: async () => {
        setSaving(true);
        try {
          await api.deleteTestPermanently(testId);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          setToast({ message: "Test paper permanently deleted.", type: "success" });
          // Redirect to tests list after a short delay so toast is visible
          setTimeout(() => router.push("/admin/tests"), 1200);
        } catch (e: any) {
          setToast({ message: e.message || "Failed to delete test paper.", type: "error" });
          setSaving(false);
        }
      },
    });
  };



  // Clean options generator per question type
  const getCleanOptionsForType = (type: CBTQuestionType) => {
    if (type === "TRUE_FALSE") {
      return [
        { content: "True", is_correct: true },
        { content: "False", is_correct: false },
      ];
    } else if (type === "ASSERTION_REASON") {
      return [
        { content: "Both (A) and (R) are true and (R) is the correct explanation of (A)", is_correct: true },
        { content: "Both (A) and (R) are true but (R) is not the correct explanation of (A)", is_correct: false },
        { content: "(A) is true but (R) is false", is_correct: false },
        { content: "(A) is false but (R) is true", is_correct: false },
      ];
    } else if (type === "MATCH_THE_FOLLOWING") {
      return [
        { content: "A-r, B-p, C-s, D-q", is_correct: true },
        { content: "A-p, B-r, C-q, D-s", is_correct: false },
        { content: "A-s, B-q, C-p, D-r", is_correct: false },
        { content: "A-q, B-s, C-r, D-p", is_correct: false },
      ];
    }
    return [
      { content: "", is_correct: true },
      { content: "", is_correct: false },
      { content: "", is_correct: false },
      { content: "", is_correct: false },
    ];
  };

  // Synchronous atomic reset for new question editor
  const resetNewQuestionState = (forcedType?: CBTQuestionType) => {
    const targetType = forcedType || lastQType || "MCQ";
    setEditingQuestionId(null);
    setEditingIndex(null);
    setModalMode("ADD");
    setModalToast(null);
    setDraftNotice(null);
    setShowMoreSettings(false);
    setQType(targetType);
    setQContent("");
    setQExplanation("");
    setQHint("");
    setQMarks(lastMarks ?? positiveMarks ?? 4.0);
    setQNegativeMarks(lastNegativeMarks ?? negativeMarks ?? 1.0);
    setQDifficulty(lastDifficulty ?? "MEDIUM");
    setQOptions(getCleanOptionsForType(targetType));
    setQNumericalAnswer("");
    setQNumericalTolerance("0.0");
    setQImageUrl(null);
    setUploadingImage(false);
    setEditorViewMode("visual");
    setComposerKey(Date.now());
    try {
      sessionStorage.removeItem(`cbt_draft_${testId}`);
    } catch (e) {}
  };

  // Open Add Question with guaranteed 100% fresh, blank state
  const openAddQuestion = () => {
    if (isStructuralLocked) {
      alert("Cannot add questions: structural modifications are locked " + (!isDraft ? `while examination is in ${test?.status} status.` : "because candidate attempts exist."));
      return;
    }
    setActiveTab("questions");
    resetNewQuestionState();
    setShowAddQuestionModal(true);
    setTimeout(() => {
      document.getElementById("question-composer-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
      questionEditorRef.current?.focus();
    }, 50);
  };

  // Helper to initialize options appropriately for a question type
  const initOptionsForType = (type: CBTQuestionType) => {
    setQOptions(getCleanOptionsForType(type));
  };

  // Switch Question Type with Smart Field Adaptation
  const handleSelectQuestionType = (newType: CBTQuestionType) => {
    setQType(newType);
    if (newType === "TRUE_FALSE") {
      if (qOptions.length !== 2 || !qOptions.some((o) => o.content.toLowerCase() === "true")) {
        setQOptions(getCleanOptionsForType("TRUE_FALSE"));
      }
    } else if (newType === "ASSERTION_REASON") {
      if (qOptions.length !== 4 || !qOptions[0]?.content.includes("(A)")) {
        setQOptions(getCleanOptionsForType("ASSERTION_REASON"));
      }
    } else if (newType === "MATCH_THE_FOLLOWING") {
      if (qOptions.length < 4 || !qOptions[0]?.content.includes("-")) {
        setQOptions(getCleanOptionsForType("MATCH_THE_FOLLOWING"));
      }
    } else if (newType === "MCQ" || newType === "MULTIPLE_CHOICE") {
      if (qOptions.length < 2) {
        setQOptions(getCleanOptionsForType("MCQ"));
      }
    }
  };

  // Templates for speed authoring
  const applyAssertionReasonTemplate = () => {
    const template = "Assertion (A): [Enter Assertion statement here]\nReason (R): [Enter Reason statement here]";
    setQContent(template);
    setQOptions(getCleanOptionsForType("ASSERTION_REASON"));
  };

  const applyMatchFollowingTemplate = () => {
    const template = "Match the items in Column I with those in Column II:\n\nColumn I:\n(A) Item 1\n(B) Item 2\n(C) Item 3\n(D) Item 4\n\nColumn II:\n(p) Match 1\n(q) Match 2\n(r) Match 3\n(s) Match 4";
    setQContent(template);
    setQOptions(getCleanOptionsForType("MATCH_THE_FOLLOWING"));
  };

  // Open Edit Question in Composer with deep-cloned state
  const openEditQuestion = (q: any, index: number) => {
    setActiveTab("questions");
    setIsLiveCorrection(Boolean(isLive));
    setModalMode("EDIT");
    setEditingQuestionId(q.id);
    setEditingIndex(index);
    setModalToast(null);
    setDraftNotice(null);
    setShowMoreSettings(Boolean(q.explanation || q.hint || (q.marks && q.marks !== positiveMarks)));

    const qtypeVal = (q.question_type || "MCQ") as CBTQuestionType;
    setQType(qtypeVal);
    setQContent(q.content || "");
    setQExplanation(q.explanation || "");
    setQHint(q.hint || "");
    setQMarks(Number(q.marks ?? positiveMarks));
    setQNegativeMarks(Number(q.negative_marks ?? negativeMarks));
    setQDifficulty(q.difficulty || "MEDIUM");

    if (qtypeVal === "NUMERICAL" || qtypeVal === "FILL_BLANK") {
      setQNumericalAnswer(q.numerical_answer != null ? String(q.numerical_answer) : "");
      setQNumericalTolerance(q.numerical_tolerance != null ? String(q.numerical_tolerance) : "0.0");
      setQOptions(getCleanOptionsForType(qtypeVal));
    } else {
      if (q.options && q.options.length > 0) {
        setQOptions(q.options.map((o: any) => ({ content: String(o.content || ""), is_correct: Boolean(o.is_correct) })));
      } else {
        setQOptions(getCleanOptionsForType(qtypeVal));
      }
      setQNumericalAnswer("");
      setQNumericalTolerance("0.0");
    }

    // Extract image url if present
    if (q.media && q.media.length > 0) {
      setQImageUrl(q.media[0].file_url || null);
    } else {
      const match = q.content ? q.content.match(/!\[.*?\]\((https?:\/\/[^\s)]+|\/media\/[^\s)]+)\)/) : null;
      setQImageUrl(match ? match[1] : null);
    }

    setComposerKey(Date.now());
    setShowAddQuestionModal(true);
    setTimeout(() => {
      document.getElementById("question-composer-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
      questionEditorRef.current?.focus();
    }, 50);
  };

  // Open Duplicate Question - immediately loads data for rapid variant authoring
  const openDuplicateQuestion = (q: any) => {
    if (isStructuralLocked) {
      alert("Cannot modify questions: structural modifications are locked " + (!isDraft ? `while examination is in ${test?.status} status.` : "because candidate attempts exist."));
      return;
    }
    setActiveTab("questions");
    setModalMode("DUPLICATE");
    setEditingQuestionId(null);
    setEditingIndex(null);
    setModalToast(null);
    setDraftNotice(null);
    setShowMoreSettings(Boolean(q.explanation || q.hint));

    const qtypeVal = (q.question_type || "MCQ") as CBTQuestionType;
    setQType(qtypeVal);
    setQContent(q.content ? `${q.content} (Copy)` : "");
    setQExplanation(q.explanation || "");
    setQHint(q.hint || "");
    setQMarks(Number(q.marks ?? positiveMarks));
    setQNegativeMarks(Number(q.negative_marks ?? negativeMarks));
    setQDifficulty(q.difficulty || "MEDIUM");

    if (qtypeVal === "NUMERICAL" || qtypeVal === "FILL_BLANK") {
      setQNumericalAnswer(q.numerical_answer != null ? String(q.numerical_answer) : "");
      setQNumericalTolerance(q.numerical_tolerance != null ? String(q.numerical_tolerance) : "0.0");
      setQOptions(getCleanOptionsForType(qtypeVal));
    } else {
      if (q.options && q.options.length > 0) {
        setQOptions(q.options.map((o: any) => ({ content: String(o.content || ""), is_correct: Boolean(o.is_correct) })));
      } else {
        setQOptions(getCleanOptionsForType(qtypeVal));
      }
      setQNumericalAnswer("");
      setQNumericalTolerance("0.0");
    }

    if (q.media && q.media.length > 0) {
      setQImageUrl(q.media[0].file_url || null);
    } else {
      const match = q.content ? q.content.match(/!\[.*?\]\((https?:\/\/[^\s)]+|\/media\/[^\s)]+)\)/) : null;
      setQImageUrl(match ? match[1] : null);
    }

    setComposerKey(Date.now());
    setShowAddQuestionModal(true);
    setTimeout(() => {
      document.getElementById("question-composer-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
      questionEditorRef.current?.focus();
    }, 50);
  };

  const closeAddQuestionModal = () => {
    setShowAddQuestionModal(false);
    setModalToast(null);
    setDraftNotice(null);
  };

  const insertSnippet = (snippet: string) => {
    if (activeEditorTarget.type === "question" && questionEditorRef.current) {
      questionEditorRef.current.insertMathSnippet(snippet);
    } else if (
      activeEditorTarget.type === "option" &&
      activeEditorTarget.index !== undefined &&
      optionEditorRefs.current[activeEditorTarget.index]
    ) {
      optionEditorRefs.current[activeEditorTarget.index]?.insertMathSnippet(snippet);
    } else if (activeEditorTarget.type === "hint" && hintEditorRef.current) {
      hintEditorRef.current.insertMathSnippet(snippet);
    } else if (activeEditorTarget.type === "explanation" && explanationEditorRef.current) {
      explanationEditorRef.current.insertMathSnippet(snippet);
    } else if (questionEditorRef.current) {
      questionEditorRef.current.insertMathSnippet(snippet);
    }
  };

  // Live question-level validation
  const getValidationError = (): string | null => {
    if (!qContent.trim()) {
      return "Question text / statement is required.";
    }

    const mathVal = validateMathSyntax(qContent);
    if (!mathVal.isValid) {
      return `Mathematical notation error in statement: ${mathVal.issues[0]?.errorMessage}`;
    }

    const isNumericalFamily =
      qType === "NUMERICAL" || qType === "FILL_BLANK";

    if (isNumericalFamily) {
      if (qNumericalAnswer.trim() === "" || isNaN(Number(qNumericalAnswer))) {
        return "Please specify a valid numerical answer.";
      }
    } else {
      const validOptions = qOptions.filter((o) => o.content.trim());
      if (validOptions.length < 2) {
        return "Please provide at least 2 non-empty options.";
      }
      const hasCorrect = validOptions.some((o) => o.is_correct);
      if (!hasCorrect) {
        return "Please mark at least one option as the correct answer.";
      }

      for (let i = 0; i < validOptions.length; i++) {
        const optVal = validateMathSyntax(validOptions[i].content);
        if (!optVal.isValid) {
          return `Mathematical notation error in Option ${String.fromCharCode(65 + i)}: ${optVal.issues[0]?.errorMessage}`;
        }
      }
    }
    return null;
  };

  // Save Question directly into Test (Supports 3 Actions: save_and_close, save_and_next, save_and_duplicate)
  const handleSaveQuestion = async (
    action: "save_and_close" | "save_and_next" | "save_and_duplicate"
  ) => {
    const valError = getValidationError();
    if (valError) {
      alert(valError);
      return;
    }

    const isNumericalFamily =
      qType === "NUMERICAL" || qType === "FILL_BLANK";

    setSaving(true);
    try {
      const payload: any = {
        question_type: qType,
        content: normalizeMathContent(qContent.trim()),
        explanation: qExplanation.trim() ? normalizeMathContent(qExplanation.trim()) : undefined,
        hint: qHint.trim() ? normalizeMathContent(qHint.trim()) : undefined,
        difficulty: qDifficulty,
        marks: Number(qMarks),
        negative_marks: Number(qNegativeMarks),
      };

      if (isNumericalFamily) {
        payload.numerical_answer = Number(qNumericalAnswer);
        payload.numerical_tolerance = Number(qNumericalTolerance || 0);
      } else {
        payload.options = qOptions
          .filter((o) => o.content.trim())
          .map((o, idx) => ({
            option_order: idx + 1,
            content: normalizeMathContent(o.content.trim()),
            is_correct: o.is_correct,
          }));
      }

      // Preserve persistent defaults for consecutive questions
      setLastQType(qType);
      setLastMarks(Number(qMarks));
      setLastNegativeMarks(Number(qNegativeMarks));
      setLastDifficulty(qDifficulty);

      if (modalMode === "EDIT" && editingQuestionId) {
        const updatedTest = await api.updateQuestionInline(testId, editingQuestionId, payload);
        setTest(updatedTest);
        const qs = (updatedTest.questions || []).map((tq) => ({
          ...tq.question,
          test_question_id: tq.id,
          order_index: tq.order_index,
          marks: tq.marks ?? updatedTest.positive_marks,
          negative_marks: tq.negative_marks ?? updatedTest.negative_marks,
        }));
        setQuestions(qs);
        setSuccessMsg("Question updated successfully.");
        setTimeout(() => setSuccessMsg(null), 2500);

        // Clear stored draft
        sessionStorage.removeItem(`cbt_draft_${testId}`);

        if (action === "save_and_close") {
          closeAddQuestionModal();
        } else if (action === "save_and_duplicate") {
          setModalToast("Saved! Switched to duplicate mode for next question.");
          setModalMode("DUPLICATE");
          setEditingQuestionId(null);
          setEditingIndex(null);
          setTimeout(() => {
            setModalToast(null);
            document.getElementById("question-composer-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
            questionEditorRef.current?.focus();
          }, 1200);
        } else {
          // save_and_next: full atomic reset for guaranteed fresh state
          setModalToast("Question updated! Continuing in add mode...");
          resetNewQuestionState();
          setTimeout(() => {
            setModalToast(null);
            document.getElementById("question-composer-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
            questionEditorRef.current?.focus();
          }, 1200);
        }
      } else {
        // ADD or DUPLICATE mode
        const updatedTest = await api.addQuestionInline(testId, payload);
        setTest(updatedTest);
        const qs = (updatedTest.questions || []).map((tq) => ({
          ...tq.question,
          test_question_id: tq.id,
          order_index: tq.order_index,
          marks: tq.marks ?? updatedTest.positive_marks,
          negative_marks: tq.negative_marks ?? updatedTest.negative_marks,
        }));
        setQuestions(qs);

        // Clear stored draft upon success
        sessionStorage.removeItem(`cbt_draft_${testId}`);
        setDraftNotice(null);

        if (action === "save_and_close") {
          closeAddQuestionModal();
          setSuccessMsg("Question added to examination.");
          setTimeout(() => setSuccessMsg(null), 2500);
        } else if (action === "save_and_duplicate") {
          // Save and duplicate: keep current question data intact in editor
          setModalToast("Saved! Cloned in editor for your next variation.");
          setModalMode("DUPLICATE");
          setTimeout(() => {
            setModalToast(null);
            document.getElementById("question-composer-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
            questionEditorRef.current?.focus();
          }, 1200);
        } else {
          // save_and_next: full atomic reset for guaranteed fresh state
          setModalToast(`Saved Q#${qs.length}! Ready for Q#${qs.length + 1}...`);
          resetNewQuestionState();
          setTimeout(() => {
            setModalToast(null);
            document.getElementById("question-composer-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
            questionEditorRef.current?.focus();
          }, 1200);
        }
      }
    } catch (err: any) {
      alert(err.message || "Failed to save question.");
    } finally {
      setSaving(false);
    }
  };

  // Auto-open Add Question if requested via URL query params (e.g. from /admin/tests/new)
  useEffect(() => {
    if (searchParams.get("auto_add") === "true" && !isLive && !loading) {
      openAddQuestion();
    }
  }, [searchParams, isLive, loading]);

  // Global Keyboard Shortcuts for High Authoring Speed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showAddQuestionModal) {
        if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
          e.preventDefault();
          handleSaveQuestion("save_and_duplicate");
        } else if (e.ctrlKey && e.key === "Enter") {
          e.preventDefault();
          handleSaveQuestion("save_and_next");
        } else if (e.altKey && (e.key === "s" || e.key === "S")) {
          e.preventDefault();
          handleSaveQuestion("save_and_close");
        } else if (e.key === "Escape") {
          e.preventDefault();
          closeAddQuestionModal();
        }
      } else {
        // Modal is closed: Alt+N opens Add Question
        if (e.altKey && (e.key === "n" || e.key === "N")) {
          e.preventDefault();
          if (!isLive) openAddQuestion();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    showAddQuestionModal,
    modalMode,
    qContent,
    qOptions,
    qNumericalAnswer,
    qType,
    qMarks,
    qNegativeMarks,
    qDifficulty,
    qExplanation,
    qHint,
    isLive,
    editingQuestionId,
    questions.length,
  ]);

  // Move Question Up/Down
  const moveQuestion = async (index: number, direction: "up" | "down") => {
    if (isStructuralLocked) {
      alert("Cannot reorder questions: structural modifications are locked " + (!isDraft ? `while examination is in ${test?.status} status.` : "because candidate attempts exist."));
      return;
    }
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    const newQuestions = [...questions];
    const temp = newQuestions[index];
    newQuestions[index] = newQuestions[targetIndex];
    newQuestions[targetIndex] = temp;

    setQuestions(newQuestions);

    try {
      const syncPayload = newQuestions.map((q, idx) => ({
        question_id: q.id,
        order_index: idx + 1,
        marks: q.marks,
        negative_marks: q.negative_marks,
      }));
      const updated = await api.syncTestQuestions(testId, syncPayload);
      setTest(updated);
    } catch (err: any) {
      alert(err.message || "Failed to update question sequence.");
      loadData();
    }
  };

  // Move Question directly to specific Position Number (1 to N)
  const moveToPosition = async (fromIndex: number) => {
    if (isStructuralLocked) {
      alert("Cannot reorder questions: structural modifications are locked " + (!isDraft ? `while examination is in ${test?.status} status.` : "because candidate attempts exist."));
      return;
    }
    const inputVal = prompt(
      `Move Question #${fromIndex + 1} to position (1 to ${questions.length}):`,
      String(fromIndex + 1)
    );
    if (!inputVal) return;
    const targetPos = parseInt(inputVal.trim(), 10);
    if (isNaN(targetPos) || targetPos < 1 || targetPos > questions.length) {
      alert(`Invalid position. Must be a number between 1 and ${questions.length}.`);
      return;
    }
    const toIndex = targetPos - 1;
    if (toIndex === fromIndex) return;

    const newQuestions = [...questions];
    const [movedItem] = newQuestions.splice(fromIndex, 1);
    newQuestions.splice(toIndex, 0, movedItem);

    setQuestions(newQuestions);

    try {
      const syncPayload = newQuestions.map((q, idx) => ({
        question_id: q.id,
        order_index: idx + 1,
        marks: q.marks,
        negative_marks: q.negative_marks,
      }));
      const updated = await api.syncTestQuestions(testId, syncPayload);
      setTest(updated);
      setSuccessMsg(`Moved question to position #${targetPos}`);
      setTimeout(() => setSuccessMsg(null), 2000);
    } catch (err: any) {
      alert(err.message || "Failed to reorder question.");
      loadData();
    }
  };

  // Delete Question from Test
  const deleteQuestionFromTest = (questionId: string) => {
    if (isStructuralLocked) {
      setToast({
        message: "Cannot delete questions: structural modifications are locked " + (!isDraft ? `while examination is in ${test?.status} status.` : "because candidate attempts exist."),
        type: "warning",
      });
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: "Remove Question",
      message: "Remove this question from the test paper?",
      confirmLabel: "Remove Question",
      variant: "danger",
      onConfirm: async () => {
        try {
          const updated = await api.removeQuestionFromTest(testId, questionId);
          setTest(updated);
          const qs = (updated.questions || []).map((tq) => ({
            ...tq.question,
            test_question_id: tq.id,
            order_index: tq.order_index,
            marks: tq.marks ?? updated.positive_marks,
            negative_marks: tq.negative_marks ?? updated.negative_marks,
          }));
          setQuestions(qs);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          setToast({ message: "Question removed from examination.", type: "success" });
        } catch (err: any) {
          setToast({ message: err.message || "Failed to remove question.", type: "error" });
          loadData();
        }
      },
    });
  };

  // Duplicate Question inside Test (copies complete configuration and opens editor immediately)
  const duplicateQuestionInTest = (q: any) => {
    openDuplicateQuestion(q);
  };

  // Image Upload Handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const media = await api.uploadMedia(file);
      setQImageUrl(media.url);
      // Append markdown image tag into question text if not already present
      if (!qContent.includes(media.url)) {
        const imgMd = `\n![Diagram](${media.url})\n`;
        setQContent((prev) => prev.trim() + imgMd);
      }
    } catch (err: any) {
      alert(err.message || "Failed to upload question diagram.");
    } finally {
      setUploadingImage(false);
      // Reset file input so user can re-select same file if desired
      if (imageFileInputRef.current) {
        imageFileInputRef.current.value = "";
      }
    }
  };

  // Remove attached image from question
  const handleRemoveImage = () => {
    if (qImageUrl) {
      const updated = qContent.split(`\n![Diagram](${qImageUrl})\n`).join("").split(`![Diagram](${qImageUrl})`).join("");
      setQContent(updated);
      setQImageUrl(null);
    }
  };

  // Universal Clipboard Paste Handler: Supports Direct Image Paste and Math/Physics/Chemistry Normalization
  const handleQuestionContentPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // 1. Check for pasted image in clipboard
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (file) {
            try {
              setUploadingImage(true);
              const media = await api.uploadMedia(file);
              setQImageUrl(media.url);
              const imgMd = `\n![Diagram](${media.url})\n`;
              setQContent((prev) => prev.trim() + imgMd);
              setModalToast("Image diagram attached from clipboard!");
              setTimeout(() => setModalToast(null), 2500);
            } catch (err: any) {
              alert("Failed to upload pasted image: " + (err.message || "Upload error"));
            } finally {
              setUploadingImage(false);
            }
            return;
          }
        }
      }
    }

    // 2. Universal Paste Engine (HTML from ChatGPT/Gemini/Word/Docs + Plain Text + Math/Physics/Chem)
    handleUniversalPasteEvent(
      e,
      qContent,
      (updated) => setQContent(updated),
      (msg) => {
        setModalToast(msg);
        setTimeout(() => setModalToast(null), 2500);
      }
    );
  };


  const calculatedTotalMarks = questions.reduce(
    (acc, q) => acc + Number(q.marks ?? positiveMarks ?? 0),
    0
  );

  // Google Forms-Inspired Question Composer Card
  const renderQuestionComposerCard = () => (
    <div
      key={composerKey}
      id="question-composer-card"
      className="card"
      style={{
        background: "var(--bg-surface)",
        border: "1.5px solid var(--primary-500)",
        borderLeft: "6px solid var(--primary-500)",
        borderRadius: "12px",
        padding: "1.35rem 1.5rem",
        boxShadow: "var(--shadow-md), 0 0 0 1px rgba(99, 102, 241, 0.15)",
        transition: "all 0.2s ease",
        position: "relative",
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSaveQuestion("save_and_next");
        }}
      >
        {/* 1. TOP CARD HEADER: Mode, Type Dropdown, Close */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
            paddingBottom: "0.75rem",
            borderBottom: "1px solid var(--border-color)",
            flexWrap: "wrap",
            gap: "0.6rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                background: "rgba(99, 102, 241, 0.12)",
                color: "var(--primary-600)",
                padding: "0.25rem 0.65rem",
                borderRadius: "6px",
                fontWeight: 700,
                fontSize: "0.82rem",
              }}
            >
              {modalMode === "EDIT" ? (
                <>
                  <Edit3 size={13} />
                  <span>Editing Question #{(editingIndex ?? 0) + 1}</span>
                </>
              ) : modalMode === "DUPLICATE" ? (
                <>
                  <Copy size={13} />
                  <span>Duplicate Question #{questions.length + 1}</span>
                </>
              ) : (
                <>
                  <Zap size={13} color="#f59e0b" />
                  <span>Question #{questions.length + 1}</span>
                </>
              )}
            </span>

            {draftNotice && (
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--primary-600)",
                  background: "rgba(99, 102, 241, 0.12)",
                  padding: "0.2rem 0.5rem",
                  borderRadius: "4px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <FileCheck size={12} />
                <span>Draft restored</span>
                <button
                  type="button"
                  onClick={() => { setDraftNotice(null); resetNewQuestionState(); }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#f87171",
                    cursor: "pointer",
                    fontSize: "0.72rem",
                    textDecoration: "underline",
                    padding: 0,
                    marginLeft: "0.25rem",
                  }}
                >
                  Discard
                </button>
              </span>
            )}
          </div>

          {/* Question Type Selector Dropdown (Google Forms signature control) */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>
              Question Type:
            </label>
            <select
              value={qType}
              onChange={(e) => !isLiveCorrection && handleSelectQuestionType(e.target.value as CBTQuestionType)}
              disabled={isLiveCorrection}
              className="input"
              style={{
                width: "auto",
                minWidth: "190px",
                padding: "0.4rem 0.75rem",
                fontSize: "0.84rem",
                fontWeight: 600,
                background: "var(--bg-input)",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                color: "var(--text-main)",
                cursor: isLiveCorrection ? "not-allowed" : "pointer",
              }}
            >
              {CBT_QUESTION_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={closeAddQuestionModal}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: "0.3rem",
                borderRadius: "4px",
                marginLeft: "0.25rem",
              }}
              title="Cancel & Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Administrative Errata Banner (if active live exam) */}
        {isLiveCorrection && (
          <div
            style={{
              padding: "0.6rem 0.85rem",
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              borderRadius: "6px",
              color: "#f59e0b",
              fontSize: "0.8rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "1rem",
            }}
          >
            <ShieldCheck size={16} style={{ flexShrink: 0 }} />
            <div>
              <strong>Administrative Errata Mode:</strong> Only typo corrections are permitted on live examinations. Scoring and question type are locked.
            </div>
          </div>
        )}

        {/* 2. QUESTION STATEMENT (The Dominant Field) */}
        <div style={{ marginBottom: "1.2rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.4rem",
              flexWrap: "wrap",
              gap: "0.4rem",
            }}
          >
            <label style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-main)", margin: 0 }}>
              Question Statement <span style={{ color: "var(--danger)" }}>*</span>
            </label>

            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
              {/* Quick Templates for special question types */}
              {qType === "ASSERTION_REASON" && (
                <button
                  type="button"
                  onClick={applyAssertionReasonTemplate}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: "0.74rem", padding: "0.2rem 0.5rem" }}
                  title="Insert Assertion (A) & Reason (R) boilerplate"
                >
                  + A&R Template
                </button>
              )}
              {qType === "MATCH_THE_FOLLOWING" && (
                <button
                  type="button"
                  onClick={applyMatchFollowingTemplate}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: "0.74rem", padding: "0.2rem 0.5rem" }}
                  title="Insert Column I & Column II matching template"
                >
                  + Match Matrix Template
                </button>
              )}

              {/* Unobtrusive Diagram Attachment */}
              <button
                type="button"
                onClick={() => imageFileInputRef.current?.click()}
                className="btn btn-secondary btn-sm"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.25rem 0.6rem",
                  fontSize: "0.76rem",
                  background: qImageUrl ? "rgba(16, 185, 129, 0.15)" : undefined,
                  borderColor: qImageUrl ? "rgba(16, 185, 129, 0.4)" : undefined,
                  color: qImageUrl ? "var(--success)" : undefined,
                }}
                title="Attach diagram or illustration to this question"
              >
                <ImageIcon size={13} />
                <span>{uploadingImage ? "Uploading..." : qImageUrl ? "Diagram Attached" : "Attach Diagram"}</span>
              </button>
              <input
                ref={imageFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: "none" }}
              />
            </div>
          </div>

          {/* Attached Diagram Preview Strip */}
          {qImageUrl && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.45rem 0.75rem",
                background: "var(--bg-surface-elevated)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "6px",
                marginBottom: "0.5rem",
              }}
            >
              <img
                src={qImageUrl}
                alt="Attached diagram"
                style={{
                  height: "48px",
                  maxWidth: "120px",
                  objectFit: "contain",
                  borderRadius: "4px",
                  background: "var(--bg-input)",
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.76rem", color: "var(--success)", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <Check size={13} />
                  <span>Diagram Attached</span>
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  Embedded in question statement & preview
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.35rem" }}>
                <button
                  type="button"
                  onClick={() => imageFileInputRef.current?.click()}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: "0.72rem", padding: "0.15rem 0.4rem" }}
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="btn btn-secondary btn-sm"
                  style={{ color: "#f87171", fontSize: "0.72rem", padding: "0.15rem 0.4rem" }}
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          {/* Math, Physics & Chemistry Quick Formatting Toolbar */}
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginBottom: "0.45rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.72rem", color: "var(--text-subtle)", marginRight: "0.2rem", fontWeight: 600 }}>Quick Insert:</span>
            {[
              { label: "a/b", title: "Fraction (a/b)", snippet: "$\\frac{a}{b}$" },
              { label: "x²", title: "Power / Superscript (x²)", snippet: "$x^2$" },
              { label: "x₁", title: "Subscript (x₁)", snippet: "$x_1$" },
              { label: "√x", title: "Square Root (√x)", snippet: "$\\sqrt{x}$" },
              { label: "α", title: "Alpha (α)", snippet: "$\\alpha$" },
              { label: "θ", title: "Theta (θ)", snippet: "$\\theta$" },
              { label: "π", title: "Pi (π)", snippet: "$\\pi$" },
              { label: "Δ", title: "Delta (Δ)", snippet: "$\\Delta$" },
              { label: "∫", title: "Integral (∫)", snippet: "$\\int_{a}^{b} f(x)\\,dx$" },
              { label: "Σ", title: "Summation (Σ)", snippet: "$\\sum_{i=1}^{n} x_i$" },
              { label: "⚗️ H₂O", title: "Chemistry Formula", snippet: "$\\ce{H2O}$" },
              { label: "⚗️ 2H₂+O₂→2H₂O", title: "Chemical Reaction", snippet: "$\\ce{2H2 + O2 -> 2H2O}$" },
              { label: "±", title: "Plus-Minus (±)", snippet: "$\\pm$" },
            ].map((chip, cIdx) => (
              <button
                key={cIdx}
                type="button"
                onClick={() => insertSnippet(chip.snippet)}
                className="btn btn-secondary btn-sm"
                style={{
                  fontSize: "0.74rem",
                  padding: "0.15rem 0.45rem",
                  height: "auto",
                  background: chip.label.startsWith("⚗️") ? "rgba(16, 185, 129, 0.12)" : undefined,
                  borderColor: chip.label.startsWith("⚗️") ? "rgba(16, 185, 129, 0.35)" : undefined,
                  color: chip.label.startsWith("⚗️") ? "#34d399" : undefined,
                  fontWeight: 500,
                }}
                title={chip.title}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Single Google Docs / Forms-Style Rich Question Editor (NO separate preview) */}
          <RichMathEditor
            ref={questionEditorRef}
            id="question-statement-editor"
            value={qContent}
            onChange={(val) => setQContent(val)}
            onFocus={() => setActiveEditorTarget({ type: "question" })}
            onImagePaste={async (file) => {
              try {
                setUploadingImage(true);
                const media = await api.uploadMedia(file);
                setQImageUrl(media.url);
                const imgMd = `\n![Diagram](${media.url})\n`;
                setQContent((prev) => prev.trim() + imgMd);
                setModalToast("Image diagram attached from clipboard!");
                setTimeout(() => setModalToast(null), 2500);
              } catch (err: any) {
                alert("Failed to upload pasted image: " + (err.message || "Upload error"));
              } finally {
                setUploadingImage(false);
              }
            }}
            placeholder="Type or paste question statement here... (Directly renders Math, Physics & Chemistry from ChatGPT, Gemini, Word, Google Docs or plain text)"
            minHeight="120px"
            required
          />
        </div>

        {/* 3. ANSWER / OPTIONS SECTION (Contextual to question type) */}

        {/* CASE A: MCQ / MULTIPLE_CHOICE / ASSERTION_REASON / MATCH_THE_FOLLOWING */}
        {(qType === "MCQ" || qType === "MULTIPLE_CHOICE" || qType === "ASSERTION_REASON" || qType === "MATCH_THE_FOLLOWING") && (
          <div style={{ marginBottom: "1.2rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.4rem" }}>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)" }}>
                {qType === "MULTIPLE_CHOICE"
                  ? "Options (Check all boxes that are correct answers):"
                  : "Options (Click the circle or letter to select the correct answer):"}
              </div>

              <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() =>
                    setQOptions([
                      { content: "", is_correct: true },
                      { content: "", is_correct: false },
                      { content: "", is_correct: false },
                      { content: "", is_correct: false },
                    ])
                  }
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: "0.72rem", padding: "0.15rem 0.45rem" }}
                  title="Reset to 4 empty options (A-D)"
                >
                  4 Choices (A-D)
                </button>

                {qType === "ASSERTION_REASON" && (
                  <button
                    type="button"
                    onClick={applyAssertionReasonTemplate}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.72rem", padding: "0.15rem 0.45rem" }}
                  >
                    Reset A/R Choices
                  </button>
                )}

                {qType === "MATCH_THE_FOLLOWING" && (
                  <button
                    type="button"
                    onClick={applyMatchFollowingTemplate}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.72rem", padding: "0.15rem 0.45rem" }}
                  >
                    Reset Match Choices
                  </button>
                )}
              </div>
            </div>

            {/* Option Rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
              {qOptions.map((opt, idx) => {
                const isMCQ = qType === "MCQ" || qType === "ASSERTION_REASON" || qType === "MATCH_THE_FOLLOWING";
                return (
                  <div key={idx} style={{ display: "flex", flexDirection: "column" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        padding: "0.25rem 0",
                      }}
                    >
                    {/* Radio / Checkbox Indicator Button */}
                    <button
                      type="button"
                      onClick={() => {
                        if (qType === "MULTIPLE_CHOICE") {
                          const next = [...qOptions];
                          next[idx].is_correct = !next[idx].is_correct;
                          setQOptions(next);
                        } else {
                          // Single correct selection
                          setQOptions(
                            qOptions.map((o, i) => ({
                              ...o,
                              is_correct: i === idx,
                            }))
                          );
                        }
                      }}
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: isMCQ ? "50%" : "6px",
                        border: opt.is_correct ? "2px solid var(--success)" : "1.5px solid var(--border-color)",
                        background: opt.is_correct ? "var(--success-bg)" : "var(--bg-input)",
                        color: opt.is_correct ? "var(--success)" : "var(--text-muted)",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.82rem",
                        flexShrink: 0,
                        transition: "all 0.15s ease",
                      }}
                      title={opt.is_correct ? "Correct answer (selected)" : "Click to mark as correct answer"}
                    >
                      {opt.is_correct ? (
                        <Check size={16} strokeWidth={2.8} />
                      ) : (
                        <span>{String.fromCharCode(65 + idx)}</span>
                      )}
                    </button>

                    {/* Option Content Rich Math Editor (Single in-place editing surface) */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <RichMathEditor
                        ref={(el) => {
                          optionEditorRefs.current[idx] = el;
                        }}
                        id={`option-editor-${idx}`}
                        inline={true}
                        value={opt.content}
                        onChange={(val) => {
                          const next = [...qOptions];
                          next[idx].content = val;
                          setQOptions(next);
                        }}
                        onFocus={() => setActiveEditorTarget({ type: "option", index: idx })}
                        onEnterPress={() => {
                          if (idx < qOptions.length - 1) {
                            optionEditorRefs.current[idx + 1]?.focus();
                          } else if (qOptions.length < 8) {
                            setQOptions([...qOptions, { content: "", is_correct: false }]);
                            setTimeout(() => optionEditorRefs.current[idx + 1]?.focus(), 50);
                          }
                        }}
                        placeholder={`Option ${String.fromCharCode(65 + idx)}... (Press Enter for next)`}
                        style={{
                          borderColor: opt.is_correct ? "var(--success)" : "var(--border-color)",
                        }}
                      />
                    </div>

                    {/* Remove Option Button */}
                    {qOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setQOptions(qOptions.filter((_, i) => i !== idx))}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-subtle)",
                          cursor: "pointer",
                          padding: "0.3rem",
                          borderRadius: "4px",
                        }}
                        title="Remove option"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>

            {/* Lightweight "+ Add option" button (Google Forms style) */}
            {qOptions.length < 8 && (
              <div style={{ marginTop: "0.6rem" }}>
                <button
                  type="button"
                  onClick={() => {
                    setQOptions([...qOptions, { content: "", is_correct: false }]);
                    setTimeout(() => {
                      optionEditorRefs.current[qOptions.length]?.focus();
                    }, 50);
                  }}
                  style={{
                    background: "none",
                    border: "1px dashed var(--border-color)",
                    borderRadius: "6px",
                    color: "var(--primary-600)",
                    padding: "0.45rem 0.9rem",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    transition: "all 0.15s ease",
                  }}
                >
                  <Plus size={14} />
                  <span>Add option</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* CASE B: TRUE_FALSE */}
        {qType === "TRUE_FALSE" && (
          <div style={{ marginBottom: "1.2rem" }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.5rem" }}>
              Select Correct Statement Value:
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={() =>
                  setQOptions([
                    { content: "True", is_correct: true },
                    { content: "False", is_correct: false },
                  ])
                }
                style={{
                  padding: "0.85rem",
                  borderRadius: "8px",
                  border: "2px solid",
                  borderColor: qOptions[0]?.is_correct ? "var(--success)" : "var(--border-color)",
                  background: qOptions[0]?.is_correct ? "var(--success-bg)" : "var(--bg-surface-elevated)",
                  color: qOptions[0]?.is_correct ? "var(--success)" : "var(--text-main)",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  transition: "all 0.15s ease",
                }}
              >
                {qOptions[0]?.is_correct && <Check size={18} />}
                <span>TRUE</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setQOptions([
                    { content: "True", is_correct: false },
                    { content: "False", is_correct: true },
                  ])
                }
                style={{
                  padding: "0.85rem",
                  borderRadius: "8px",
                  border: "2px solid",
                  borderColor: qOptions[1]?.is_correct ? "var(--success)" : "var(--border-color)",
                  background: qOptions[1]?.is_correct ? "var(--success-bg)" : "var(--bg-surface-elevated)",
                  color: qOptions[1]?.is_correct ? "var(--success)" : "var(--text-main)",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  transition: "all 0.15s ease",
                }}
              >
                {qOptions[1]?.is_correct && <Check size={18} />}
                <span>FALSE</span>
              </button>
            </div>
          </div>
        )}

        {/* CASE C: NUMERICAL / FILL_BLANK */}
        {(qType === "NUMERICAL" || qType === "FILL_BLANK") && (
          <div className="grid-2" style={{ marginBottom: "1.2rem" }}>
            <div>
              <label className="form-label" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                Correct Numerical / Expected Answer *
              </label>
              <input
                type="number"
                step="any"
                className="input"
                placeholder="e.g. 40.5"
                value={qNumericalAnswer}
                onChange={(e) => setQNumericalAnswer(e.target.value)}
                required
                style={{ background: "var(--bg-input)", borderColor: "var(--border-color)" }}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: "0.82rem" }}>
                Acceptable Tolerance (±)
              </label>
              <input
                type="number"
                step="any"
                className="input"
                placeholder="0.0"
                value={qNumericalTolerance}
                onChange={(e) => setQNumericalTolerance(e.target.value)}
                style={{ background: "var(--bg-input)", borderColor: "var(--border-color)" }}
              />
            </div>
          </div>
        )}

        {/* 4. COMPACT "MORE SETTINGS" EXPANDABLE ACCORDION */}
        <div
          onClick={() => setShowMoreSettings(!showMoreSettings)}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.55rem 0.85rem",
            background: "var(--bg-surface-elevated)",
            border: "1px solid var(--border-color)",
            borderRadius: "8px",
            cursor: "pointer",
            marginTop: "1rem",
            marginBottom: showMoreSettings ? "0.85rem" : 0,
            userSelect: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Sliders size={14} color="#818cf8" />
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-main)" }}>
              More settings & scoring overrides
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
              Marks: +{qMarks} / -{qNegativeMarks} • {qDifficulty} {qHint ? "• Hint set" : ""} {qExplanation ? "• Solution set" : ""}
            </span>
            {showMoreSettings ? <ChevronUp size={15} color="var(--text-muted)" /> : <ChevronDown size={15} color="var(--text-muted)" />}
          </div>
        </div>

        {showMoreSettings && (
          <div
            style={{
              padding: "1rem",
              background: "var(--bg-surface-elevated)",
              border: "1px solid var(--border-color)",
              borderRadius: "8px",
              marginBottom: "1rem",
            }}
          >
            <div className="grid-4" style={{ marginBottom: "0.85rem" }}>
              <div>
                <label className="form-label" style={{ fontSize: "0.8rem" }}>
                  Positive Marks {isLiveCorrection && <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>(Locked)</span>}
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  className="input"
                  value={qMarks}
                  onChange={(e) => setQMarks(Number(e.target.value))}
                  disabled={isLiveCorrection}
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: "0.8rem" }}>
                  Negative Marks {isLiveCorrection && <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>(Locked)</span>}
                </label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  className="input"
                  value={qNegativeMarks}
                  onChange={(e) => setQNegativeMarks(Number(e.target.value))}
                  disabled={isLiveCorrection}
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: "0.8rem" }}>Difficulty</label>
                <select
                  className="input"
                  value={qDifficulty}
                  onChange={(e: any) => setQDifficulty(e.target.value)}
                >
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </div>
              <div>
                <label className="form-label" style={{ fontSize: "0.8rem" }}>Hint (Optional)</label>
                <RichMathEditor
                  ref={hintEditorRef}
                  inline={true}
                  placeholder="Student hint..."
                  value={qHint}
                  onChange={(val) => setQHint(val)}
                  onFocus={() => setActiveEditorTarget({ type: "hint" })}
                />
              </div>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: "0.8rem" }}>
                Solution Explanation (Optional - Shown to candidate after evaluation)
              </label>
              <RichMathEditor
                ref={explanationEditorRef}
                placeholder="Detailed step-by-step solution..."
                value={qExplanation}
                onChange={(val) => setQExplanation(val)}
                minHeight="75px"
                onFocus={() => setActiveEditorTarget({ type: "explanation" })}
              />
            </div>
          </div>
        )}

        {/* 5. VALIDATION ALERT (Inline if any) */}
        {getValidationError() && (
          <div
            style={{
              padding: "0.5rem 0.85rem",
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              borderRadius: "6px",
              color: "#fbbf24",
              fontSize: "0.8rem",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              marginTop: "0.85rem",
            }}
          >
            <AlertCircle size={14} />
            <span>{getValidationError()}</span>
          </div>
        )}

        {/* 6. CARD FOOTER / ACTION BUTTONS */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid var(--border-color)",
            paddingTop: "1rem",
            marginTop: "1.2rem",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          {/* Left: Keyboard shortcuts & feedback toast */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <Zap size={12} color="#f59e0b" />
              <span>
                <kbd style={{ background: "var(--bg-surface-elevated)", border: "1px solid var(--border-color)", color: "var(--text-muted)", padding: "0.1rem 0.3rem", borderRadius: "3px" }}>Ctrl+Enter</kbd> Save & Next • <kbd style={{ background: "var(--bg-surface-elevated)", border: "1px solid var(--border-color)", color: "var(--text-muted)", padding: "0.1rem 0.3rem", borderRadius: "3px" }}>Alt+S</kbd> Save & Close • <kbd style={{ background: "var(--bg-surface-elevated)", border: "1px solid var(--border-color)", color: "var(--text-muted)", padding: "0.1rem 0.3rem", borderRadius: "3px" }}>Esc</kbd> Cancel
              </span>
            </span>
            {modalToast && (
              <span style={{ fontSize: "0.82rem", color: "#34d399", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Check size={14} /> {modalToast}
              </span>
            )}
          </div>

          {/* Right: Actions */}
          <div style={{ display: "flex", gap: "0.5rem", marginLeft: "auto", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={closeAddQuestionModal}
              className="btn btn-secondary"
              style={{ fontSize: "0.85rem" }}
            >
              Cancel (Esc)
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveQuestion("save_and_close")}
              className="btn btn-secondary"
              style={{ fontWeight: 600, fontSize: "0.85rem" }}
              title="Save and exit question composer (Alt+S)"
            >
              {saving ? "Saving..." : "Save & Close (Alt+S)"}
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveQuestion("save_and_duplicate")}
              className="btn btn-secondary"
              style={{ fontWeight: 600, fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
              title="Save and duplicate in composer for variation (Ctrl+Shift+D)"
            >
              <Copy size={13} />
              <span>Save & Duplicate</span>
            </button>

            {/* PRIMARY ACTION: Save & Add Next */}
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveQuestion("save_and_next")}
              className="btn btn-primary"
              style={{
                fontWeight: 700,
                fontSize: "0.88rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.55rem 1.15rem",
                background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                boxShadow: "0 4px 12px rgba(99, 102, 241, 0.4)",
              }}
              title="Save and continuously author next question (Ctrl+Enter)"
            >
              <Zap size={14} />
              <span>Save & Add Next (Ctrl+Enter)</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );

  if (loading) {
    return (
      <div className="container" style={{ padding: "4rem 1rem", textAlign: "center", color: "var(--text-muted)" }}>
        Loading examination paper...
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: "1.5rem", paddingBottom: "6.5rem" }}>
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Tests", href: "/admin/tests" },
          { label: test?.title || "Test Paper" },
        ]}
      />

      {/* Main Header Banner (Requirements 1 & 5) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginTop: "1rem",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--text-main)", margin: 0 }}>
              {test?.title}
            </h1>
            
            {/* Status Badge */}
            <span
              className={`badge ${
                isLive
                  ? "badge-success"
                  : test?.status === "SCHEDULED"
                  ? "badge-primary"
                  : test?.status === "PAUSED"
                  ? "badge-warning"
                  : test?.status === "CANCELLED"
                  ? "badge-danger"
                  : test?.status === "DRAFT"
                  ? "badge-warning"
                  : "badge"
              }`}
              style={{
                fontSize: "0.8rem",
                fontWeight: 700,
                background: test?.status === "PAUSED" ? "rgba(245, 158, 11, 0.2)" : test?.status === "CANCELLED" ? "rgba(239, 68, 68, 0.2)" : undefined,
                color: test?.status === "PAUSED" ? "#fbbf24" : test?.status === "CANCELLED" ? "#f87171" : undefined,
                border: test?.status === "PAUSED" ? "1px solid rgba(245, 158, 11, 0.4)" : test?.status === "CANCELLED" ? "1px solid rgba(239, 68, 68, 0.4)" : undefined,
              }}
            >
              {test?.status}
            </span>

            {/* Access Code with 1-Click Copy (Requirement 8) */}
            {code && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    background: "rgba(99, 102, 241, 0.18)",
                    color: "var(--primary-600)",
                    padding: "0.25rem 0.6rem",
                    borderRadius: "6px",
                    border: "1px solid rgba(99, 102, 241, 0.3)",
                  }}
                >
                  Access Code: {code}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyCode(code)}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                  title="Copy candidate access code"
                >
                  {copiedCode ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                  <span>{copiedCode ? "Copied!" : "Copy Code"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCopyLink(code)}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                  title="Copy direct student examination URL"
                >
                  {copiedLink ? <Check size={13} color="#34d399" /> : <ExternalLink size={13} />}
                  <span>{copiedLink ? "Link Copied!" : "Copy Link"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyInvitation}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                  title="Copy full WhatsApp/Email exam invitation text"
                >
                  {copiedInvitation ? <Check size={13} color="#34d399" /> : <Send size={13} />}
                  <span>{copiedInvitation ? "Invitation Copied!" : "Copy Invitation"}</span>
                </button>
              </div>
            )}
          </div>

          {/* Subtitle Information Bar (Subject, Topics, Duration, Questions, Marks, Saved State) */}
          <div style={{ display: "flex", gap: "0.85rem", color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "0.45rem", flexWrap: "wrap", alignItems: "center" }}>
            <span>Subject: <strong style={{ color: "var(--text-main)" }}>{test?.subject_name || "General"}</strong></span>
            <span>•</span>
            {topicsCovered && (
              <>
                <span>Topics: <strong style={{ color: "var(--text-main)" }}>{topicsCovered}</strong></span>
                <span>•</span>
              </>
            )}
            <span>Duration: <strong style={{ color: "var(--text-main)" }}>{durationMinutes} Mins</strong></span>
            <span>•</span>
            <span>Questions: <strong style={{ color: "var(--text-main)" }}>{questions.length}</strong></span>
            <span>•</span>
            <span>Total Marks: <strong style={{ color: "#34d399" }}>{calculatedTotalMarks}</strong></span>
            <span>•</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", color: isDirty ? "#fbbf24" : "#34d399" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: isDirty ? "#fbbf24" : "#34d399" }} />
              {isDirty ? "Unsaved changes" : "All changes saved"}
            </span>
          </div>
        </div>

        {/* Header Contextual Action Buttons (Requirement 5) */}
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
          {/* DRAFT STATE: Save Draft, Preview Exam, Publish */}
          {test?.status === "DRAFT" && (
            <>
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                title="Save examination draft and settings"
              >
                <Save size={15} />
                <span>{saving ? "Saving..." : "Save Draft"}</span>
              </button>

              <button
                onClick={() => {
                  setPreviewQIndex(0);
                  setShowPreviewModal(true);
                }}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                title="Simulate actual student-facing examination"
              >
                <Eye size={15} />
                <span>Preview Exam</span>
              </button>

              <button
                onClick={handlePublish}
                disabled={saving || questions.length === 0}
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: 700 }}
                title={questions.length === 0 ? "Add questions before publishing" : "Publish examination live"}
              >
                <Send size={15} />
                <span>Publish</span>
              </button>

              <button
                onClick={handleDeletePaper}
                disabled={saving}
                className="btn"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  color: "#f87171",
                }}
                title="Permanently delete this draft test paper and all its data"
              >
                <Trash2 size={15} />
                <span>Delete Paper</span>
              </button>
            </>
          )}

          {/* SCHEDULED STATE: Preview, Edit Schedule, Publish Live Now, Move to Draft, Cancel */}
          {test?.status === "SCHEDULED" && (
            <>
              <button
                onClick={() => {
                  setPreviewQIndex(0);
                  setShowPreviewModal(true);
                }}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <Eye size={15} />
                <span>Preview Exam</span>
              </button>

              <button
                onClick={() => setActiveTab("details")}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <Calendar size={15} />
                <span>Edit Schedule</span>
              </button>

              <button
                onClick={handlePublish}
                disabled={saving}
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: 700 }}
                title="Publish live immediately ahead of schedule"
              >
                <Send size={15} />
                <span>Publish Live Now</span>
              </button>

              <button
                onClick={handleUnscheduleExam}
                disabled={saving}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "#fbbf24" }}
                title="Move scheduled exam back to editable DRAFT"
              >
                <RotateCcw size={15} />
                <span>Move to Draft</span>
              </button>

              <button
                onClick={handleCancelExam}
                disabled={saving}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "#f87171" }}
                title="Cancel examination"
              >
                <XCircle size={15} />
                <span>Cancel Exam</span>
              </button>
            </>
          )}

          {/* LIVE STATE: Preview, Results, Pause, End Exam, Cancel */}
          {isLive && (
            <>
              <button
                onClick={() => {
                  setPreviewQIndex(0);
                  setShowPreviewModal(true);
                }}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <Eye size={15} />
                <span>Preview Exam</span>
              </button>

              <NextLink
                href={`/admin/results?test_id=${testId}`}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <CheckCircle2 size={15} />
                <span>Results & Analytics</span>
              </NextLink>

              <button
                onClick={handlePauseExam}
                disabled={saving}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "#fbbf24" }}
                title="Pause live examination"
              >
                <Pause size={15} />
                <span>Pause Exam</span>
              </button>

              <button
                onClick={handleEndExam}
                disabled={saving}
                className="btn"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontWeight: 700,
                  background: "rgba(239, 68, 68, 0.2)",
                  border: "1px solid var(--danger)",
                  color: "#f87171",
                }}
                title="Conclude live exam immediately"
              >
                <StopCircle size={15} />
                <span>End Exam</span>
              </button>

              <button
                onClick={handleCancelExam}
                disabled={saving}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "#f87171" }}
                title="Cancel examination"
              >
                <XCircle size={15} />
                <span>Cancel</span>
              </button>
            </>
          )}

          {/* PAUSED STATE: Resume, Results, End Exam, Cancel */}
          {isPaused && (
            <>
              <button
                onClick={handleResumeExam}
                disabled={saving}
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "#10b981", borderColor: "#10b981", color: "var(--text-main)", fontWeight: 700 }}
                title="Resume paused examination"
              >
                <Play size={15} />
                <span>Resume Exam</span>
              </button>

              <NextLink
                href={`/admin/results?test_id=${testId}`}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <CheckCircle2 size={15} />
                <span>Results & Analytics</span>
              </NextLink>

              <button
                onClick={handleEndExam}
                disabled={saving}
                className="btn"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontWeight: 700,
                  background: "rgba(239, 68, 68, 0.2)",
                  border: "1px solid var(--danger)",
                  color: "#f87171",
                }}
                title="Conclude exam"
              >
                <StopCircle size={15} />
                <span>End Exam</span>
              </button>

              <button
                onClick={handleCancelExam}
                disabled={saving}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "#f87171" }}
                title="Cancel examination"
              >
                <XCircle size={15} />
                <span>Cancel</span>
              </button>
            </>
          )}

          {/* COMPLETED STATE: Preview, Results, Duplicate */}
          {test?.status === "COMPLETED" && (
            <>
              <button
                onClick={() => {
                  setPreviewQIndex(0);
                  setShowPreviewModal(true);
                }}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <Eye size={15} />
                <span>Preview Exam</span>
              </button>

              <NextLink
                href={`/admin/results?test_id=${testId}`}
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <CheckCircle2 size={15} />
                <span>View Results</span>
              </NextLink>

              <button
                onClick={handleDuplicateExam}
                disabled={saving}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                title="Create a duplicate editable copy of this completed exam"
              >
                <Copy size={15} />
                <span>Duplicate Paper</span>
              </button>

              <button
                onClick={handleDeletePaper}
                disabled={saving}
                className="btn"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  color: "#f87171",
                }}
                title="Permanently delete this completed test paper and all its data"
              >
                <Trash2 size={15} />
                <span>Delete Paper</span>
              </button>
            </>
          )}

          {/* CANCELLED STATE: Results, Duplicate */}
          {test?.status === "CANCELLED" && (
            <>
              <NextLink
                href={`/admin/results?test_id=${testId}`}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <CheckCircle2 size={15} />
                <span>View Results</span>
              </NextLink>

              <button
                onClick={handleDuplicateExam}
                disabled={saving}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                title="Duplicate paper as new draft"
              >
                <Copy size={15} />
                <span>Duplicate Paper</span>
              </button>

              <button
                onClick={handleDeletePaper}
                disabled={saving}
                className="btn"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  color: "#f87171",
                }}
                title="Permanently delete this cancelled test paper and all its data"
              >
                <Trash2 size={15} />
                <span>Delete Paper</span>
              </button>
            </>
          )}

          {/* ARCHIVED STATE: Preview, Restore Test */}
          {test?.status === "ARCHIVED" && (
            <>
              <button
                onClick={() => {
                  setPreviewQIndex(0);
                  setShowPreviewModal(true);
                }}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <Eye size={15} />
                <span>Preview Exam</span>
              </button>

              <button
                onClick={handleRestoreTest}
                disabled={saving}
                className="btn btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                title="Restore archived exam back to active status"
              >
                <RotateCcw size={15} />
                <span>Restore Test</span>
              </button>

              <button
                onClick={handleDeletePaper}
                disabled={saving}
                className="btn"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  color: "#f87171",
                }}
                title="Permanently delete this archived test paper and all its data"
              >
                <Trash2 size={15} />
                <span>Delete Paper</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* PAUSED Status Alert */}
      {isPaused && (
        <div
          style={{
            padding: "0.85rem 1.25rem",
            background: "rgba(245, 158, 11, 0.12)",
            border: "1px solid rgba(245, 158, 11, 0.35)",
            borderRadius: "8px",
            color: "#fbbf24",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            fontSize: "0.9rem",
          }}
        >
          <Pause size={18} />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <div>
              <strong>Examination is PAUSED:</strong> Candidate timers are frozen and submissions are paused. Click <strong>Resume Exam</strong> in the top action bar to resume the examination.
            </div>
            <div style={{ fontSize: "0.82rem", opacity: 0.9 }}>
              {hasActiveCandidates ? (
                <span>⚠️ <strong>{activeCandidatesCount} candidate(s) currently active / paused.</strong> Modifying duration will dynamically extend active candidate timers.</span>
              ) : (
                <span>🟢 <strong>0 active candidates</strong> ({totalCompletedCount} completed/exited). Examination settings and duration can be freely adjusted.</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CANCELLED Status Alert */}
      {isCancelled && (
        <div
          style={{
            padding: "0.85rem 1.25rem",
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            borderRadius: "8px",
            color: "#f87171",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            fontSize: "0.9rem",
          }}
        >
          <XCircle size={18} />
          <div>
            <strong>Examination is CANCELLED:</strong> Candidates cannot enter or attempt this examination. Preserved results and audit records remain accessible.
          </div>
        </div>
      )}

      {/* Structural Lock Alert */}
      {isStructuralLocked && !isPaused && !isCancelled && (
        <div
          style={{
            padding: "0.85rem 1.25rem",
            background: isLive ? "rgba(16, 185, 129, 0.1)" : "rgba(99, 102, 241, 0.1)",
            border: `1px solid ${isLive ? "rgba(16, 185, 129, 0.3)" : "rgba(99, 102, 241, 0.3)"}`,
            borderRadius: "8px",
            color: isLive ? "var(--success)" : "var(--primary-600)",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            fontSize: "0.9rem",
          }}
        >
          <Lock size={18} />
          <div>
            <strong>Structural modifications locked:</strong> Adding, removing, or reordering questions is locked {hasActiveCandidates ? `while ${activeCandidatesCount} candidate(s) are actively taking the examination.` : isLive ? "while the examination is LIVE to protect candidate score integrity." : `while the examination is in ${test?.status} status.`}
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "0.85rem 1.25rem",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid var(--danger)",
            borderRadius: "8px",
            color: "var(--danger)",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div
          style={{
            padding: "0.85rem 1.25rem",
            background: "rgba(16, 185, 129, 0.12)",
            border: "1px solid var(--success)",
            borderRadius: "8px",
            color: "#34d399",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Primary Section Navigation Tabs */}
      <div className="nav-underline-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "questions"}
          onClick={() => setActiveTab("questions")}
          className={`nav-underline-tab ${activeTab === "questions" ? "active" : ""}`}
        >
          <FileText size={16} />
          <span>Questions ({questions.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "details"}
          onClick={() => setActiveTab("details")}
          className={`nav-underline-tab ${activeTab === "details" ? "active" : ""}`}
        >
          <Sliders size={16} />
          <span>Test Details & Settings</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "audit"}
          onClick={() => {
            setActiveTab("audit");
            loadAuditHistory();
          }}
          className={`nav-underline-tab ${activeTab === "audit" ? "active" : ""}`}
        >
          <History size={16} />
          <span>Audit History</span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: QUESTIONS WORKFLOW (PRIMARY WORKING AREA)
          ========================================================================= */}
      {activeTab === "questions" && (
        <div>
          {/* Top Question Toolbar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1.25rem",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--text-main)", margin: 0 }}>
                Questions in this Examination
              </h2>
              <p style={{ margin: "0.15rem 0 0 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                Add questions directly into the test paper or reorder them.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <button
                onClick={openAddQuestion}
                disabled={isLive}
                className="btn btn-primary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  fontWeight: 700,
                  opacity: isLive ? 0.6 : 1,
                  cursor: isLive ? "not-allowed" : "pointer",
                }}
              >
                <Plus size={16} />
                <span>Add Question</span>
              </button>
            </div>
          </div>

          {/* Ordered Question Cards Workspace */}
          {questions.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {questions.map((q, idx) => {
                if (showAddQuestionModal && modalMode === "EDIT" && editingIndex === idx) {
                  return (
                    <React.Fragment key={q.id || idx}>
                      {renderQuestionComposerCard()}
                    </React.Fragment>
                  );
                }

                const meta = getQuestionTypeMeta(q.question_type);
                // Check if there is an image in question media or content
                const imgMatch = q.content ? q.content.match(/!\[.*?\]\((https?:\/\/[^\s)]+|\/media\/[^\s)]+)\)/) : null;
                const thumbUrl = (q.media && q.media.length > 0) ? q.media[0].file_url : (imgMatch ? imgMatch[1] : null);

                return (
                  <div
                    key={q.id || idx}
                    id={`q-card-${idx}`}
                    className="card q-card-responsive"
                  >
                      {/* Left: Reordering Controls & Automatic Numbering */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "0.25rem",
                          minWidth: "36px",
                          flexShrink: 0,
                        }}
                      >
                        {!isLive && (
                          <button
                            type="button"
                            onClick={() => moveQuestion(idx, "up")}
                            disabled={idx === 0}
                            style={{
                              background: "none",
                              border: "none",
                              color: idx === 0 ? "var(--text-subtle)" : "var(--text-muted)",
                              cursor: idx === 0 ? "default" : "pointer",
                              padding: "0.2rem",
                            }}
                            title="Move question up"
                          >
                            <ArrowUp size={15} />
                          </button>
                        )}

                        <span
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "50%",
                            background: "rgba(99, 102, 241, 0.12)",
                            color: "var(--primary-600)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.85rem",
                            fontWeight: 700,
                          }}
                        >
                          {idx + 1}
                        </span>

                        {!isLive && (
                          <>
                            <button
                              type="button"
                              onClick={() => moveQuestion(idx, "down")}
                              disabled={idx === questions.length - 1}
                              style={{
                                background: "none",
                                border: "none",
                                color: idx === questions.length - 1 ? "var(--text-subtle)" : "var(--text-muted)",
                                cursor: idx === questions.length - 1 ? "default" : "pointer",
                                padding: "0.2rem",
                              }}
                              title="Move question down"
                            >
                              <ArrowDown size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveToPosition(idx)}
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--text-muted)",
                                cursor: "pointer",
                                padding: "0.15rem",
                                marginTop: "0.1rem",
                              }}
                              title="Move to specific position #"
                            >
                              <ArrowUpDown size={13} />
                            </button>
                          </>
                        )}
                      </div>

                      {/* Middle: Question Content & Metadata */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                          {/* Type Badge */}
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              padding: "0.15rem 0.5rem",
                              borderRadius: "4px",
                              background: meta.badgeBg,
                              color: meta.badgeColor,
                            }}
                          >
                            {meta.label}
                          </span>

                          {/* Marks Badge */}
                          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                            Marks: <strong style={{ color: "#34d399" }}>+{q.marks || positiveMarks}</strong> / <strong style={{ color: "#f87171" }}>-{q.negative_marks || negativeMarks}</strong>
                          </span>

                          {/* Difficulty Badge */}
                          <span
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 600,
                              padding: "0.1rem 0.4rem",
                              borderRadius: "4px",
                              background:
                                q.difficulty === "EASY"
                                  ? "rgba(16, 185, 129, 0.12)"
                                  : q.difficulty === "HARD"
                                  ? "rgba(239, 68, 68, 0.12)"
                                  : "rgba(245, 158, 11, 0.12)",
                              color:
                                q.difficulty === "EASY"
                                  ? "#34d399"
                                  : q.difficulty === "HARD"
                                  ? "#f87171"
                                  : "#fbbf24",
                            }}
                          >
                            {q.difficulty || "MEDIUM"}
                          </span>

                          {thumbUrl && (
                            <span
                              style={{
                                fontSize: "0.72rem",
                                color: "var(--text-muted)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.25rem",
                                background: "var(--bg-surface-elevated)",
                                padding: "0.15rem 0.4rem",
                                borderRadius: "4px",
                              }}
                            >
                              <ImageIcon size={11} />
                              <span>Image</span>
                            </span>
                          )}

                          {q.hint && (
                            <span style={{ fontSize: "0.72rem", color: "#60a5fa" }}>
                              • Has Hint
                            </span>
                          )}

                          {q.explanation && (
                            <span style={{ fontSize: "0.72rem", color: "#a78bfa" }}>
                              • Has Solution
                            </span>
                          )}
                        </div>

                        {/* Image Thumbnail Preview (if attached) */}
                        {thumbUrl && (
                          <div style={{ marginBottom: "0.65rem" }}>
                            <img
                              src={thumbUrl}
                              alt="Question Diagram"
                              style={{
                                maxHeight: "90px",
                                maxWidth: "100%",
                                borderRadius: "6px",
                                border: "1px solid var(--border-color)",
                                objectFit: "contain",
                                background: "var(--bg-input)",
                              }}
                            />
                          </div>
                        )}

                        {/* Question Content */}
                        <div
                          style={{
                            fontSize: "0.95rem",
                            color: "var(--text-main)",
                            lineHeight: 1.5,
                            marginBottom: "0.75rem",
                            wordBreak: "break-word",
                          }}
                        >
                          <MathRenderer text={q.content} />
                        </div>

                        {/* Options Summary for Choice Questions (Symmetrical 2-column Grid) */}
                        {q.options && q.options.length > 0 && (
                          <div className="q-options-grid">
                            {q.options.map((opt: any, oIdx: number) => (
                              <div
                                key={opt.id || oIdx}
                                style={{
                                  fontSize: "0.85rem",
                                  padding: "0.55rem 0.75rem",
                                  borderRadius: "6px",
                                  border: "1px solid",
                                  borderColor: opt.is_correct ? "rgba(16, 185, 129, 0.4)" : "var(--border-color)",
                                  background: opt.is_correct ? "rgba(16, 185, 129, 0.08)" : "var(--bg-input)",
                                  color: opt.is_correct ? "#34d399" : "var(--text-main)",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.5rem",
                                  minWidth: 0,
                                  wordBreak: "break-word",
                                }}
                              >
                                <span style={{ fontWeight: 700, flexShrink: 0, color: opt.is_correct ? "#34d399" : "var(--text-muted)" }}>
                                  {String.fromCharCode(65 + oIdx)}.
                                </span>
                                <div style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                                  <MathRenderer inline text={opt.content} />
                                </div>
                                {opt.is_correct && <Check size={14} style={{ marginLeft: "auto", flexShrink: 0, color: "#34d399" }} />}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Numerical / Fill Blank Display */}
                        {(q.question_type === "NUMERICAL" || q.question_type === "FILL_BLANK") && (
                          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", background: "var(--bg-surface-elevated)", padding: "0.4rem 0.75rem", borderRadius: "6px", display: "inline-block" }}>
                            Correct Numerical Value: <strong style={{ color: "#34d399" }}><MathRenderer inline text={String(q.numerical_answer || "")} /></strong> (Tolerance: ±{q.numerical_tolerance || 0})
                          </div>
                        )}

                        {/* Expandable Hint & Solution Explanation on Question Card */}
                        {(q.hint || q.explanation) && (
                          <div style={{ marginTop: "0.6rem", paddingTop: "0.45rem", borderTop: "1px dashed var(--border-color)", fontSize: "0.82rem", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                            {q.hint && (
                              <div style={{ display: "flex", gap: "0.4rem", alignItems: "baseline" }}>
                                <span style={{ color: "var(--primary-600)", fontWeight: 600, flexShrink: 0 }}>Hint:</span>
                                <MathRenderer inline text={q.hint} />
                              </div>
                            )}
                            {q.explanation && (
                              <div style={{ display: "flex", gap: "0.4rem", alignItems: "baseline" }}>
                                <span style={{ color: "#34d399", fontWeight: 600, flexShrink: 0 }}>Explanation:</span>
                                <MathRenderer inline text={q.explanation} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right: Actions Column */}
                      {!isLive && (
                        <div className="q-card-actions" style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => openEditQuestion(q, idx)}
                            className="btn btn-secondary btn-sm"
                            title="Edit question in composer"
                            style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                          >
                            <Edit3 size={13} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicateQuestionInTest(q)}
                            className="btn btn-secondary btn-sm"
                            title="Duplicate question (copies all parameters)"
                            style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                          >
                            <Copy size={13} />
                            <span>Duplicate</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteQuestionFromTest(q.id)}
                            className="btn btn-secondary btn-sm"
                            style={{ color: "#f87171" }}
                            title="Delete question from test"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Inline Question Composer Card for ADD / DUPLICATE mode */}
                {showAddQuestionModal && (modalMode === "ADD" || modalMode === "DUPLICATE") && (
                  renderQuestionComposerCard()
                )}

                {!showAddQuestionModal && !isLive && (
                  <div style={{ marginTop: "0.5rem", textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={openAddQuestion}
                      className="btn btn-secondary"
                      style={{
                        width: "100%",
                        padding: "0.85rem",
                        borderStyle: "dashed",
                        borderWidth: "1.5px",
                        borderColor: "rgba(99, 102, 241, 0.4)",
                        background: "rgba(99, 102, 241, 0.05)",
                        color: "var(--primary-600)",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                      }}
                      title="Add next question (Alt+N)"
                    >
                      <Plus size={16} />
                      <span>Add Next Question (Alt+N)</span>
                    </button>
                  </div>
                )}
            </div>
          ) : (
            <div>
              {showAddQuestionModal ? (
                renderQuestionComposerCard()
              ) : (
                <div className="card" style={{ padding: "3.5rem 1rem", textAlign: "center" }}>
                  <FileText size={40} color="var(--text-muted)" style={{ opacity: 0.4, marginBottom: "0.75rem" }} />
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0 0 0.5rem 0", color: "var(--text-main)" }}>
                    No Questions Added Yet
                  </h3>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", maxWidth: "420px", margin: "0 auto 1.5rem auto" }}>
                    Begin composing this examination by clicking <strong>Add Question</strong>. You can enter questions directly without leaving this page.
                  </p>
                  <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
                    <button onClick={openAddQuestion} className="btn btn-primary">
                      <Plus size={16} />
                      <span>Add First Question</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: TEST DETAILS & CONFIGURATION (Requirement 2 & Progressive Disclosure)
          ========================================================================= */}
      {activeTab === "details" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Card 1: Core Test Details */}
          <div className="card" style={{ padding: "1.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.75rem" }}>
              <div>
                <h2 style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--text-main)", margin: 0 }}>
                  General Examination Details
                </h2>
                <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  Essential information displayed to students before starting the examination.
                </p>
              </div>

              <button
                onClick={handleSaveDraft}
                disabled={saving || isLive}
                className="btn btn-primary btn-sm"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <Save size={14} />
                <span>{saving ? "Saving..." : "Save Changes"}</span>
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div>
                <label className="form-label" style={{ fontWeight: 600 }}>Test Title *</label>
                <input
                  type="text"
                  className="input"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setIsDirty(true);
                  }}
                  disabled={isLive}
                  placeholder="e.g. Physics Grand Mock Test - Mechanics"
                />
              </div>

              <div className="grid-2">
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Subject *</label>
                  <select
                    className="input"
                    value={subjectId}
                    onChange={(e) => {
                      setSubjectId(e.target.value);
                      setIsDirty(true);
                    }}
                    disabled={isLive}
                  >
                    <option value="">Select Subject</option>
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name} ({sub.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Duration (Minutes) *</label>
                  <input
                    type="number"
                    min="1"
                    className="input"
                    value={durationMinutes}
                    onChange={(e) => {
                      setDurationMinutes(Number(e.target.value));
                      setIsDirty(true);
                    }}
                    disabled={isLive || isCompleted || isCancelled}
                  />
                  {hasActiveCandidates && (
                    <div style={{ fontSize: "0.74rem", color: "var(--warning-text, #f59e0b)", marginTop: "0.2rem" }}>
                      ⚠️ Changing duration will extend active timers for {activeCandidatesCount} candidate(s).
                    </div>
                  )}
                </div>
              </div>

              <div className="grid-2">
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Default Positive Marks per Question</label>
                  <input
                    type="number"
                    step="0.5"
                    className="input"
                    value={positiveMarks}
                    onChange={(e) => {
                      setPositiveMarks(Number(e.target.value));
                      setIsDirty(true);
                    }}
                    disabled={isLive || hasActiveCandidates || isCompleted || isCancelled}
                  />
                  <div style={{ fontSize: "0.74rem", color: "var(--text-subtle)", marginTop: "0.2rem" }}>
                    {hasActiveCandidates ? "Locked while candidates are actively taking the examination." : "New questions inherit this default. Individual questions can override."}
                  </div>
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Default Negative Marks per Question</label>
                  <input
                    type="number"
                    step="0.25"
                    className="input"
                    value={negativeMarks}
                    onChange={(e) => {
                      setNegativeMarks(Number(e.target.value));
                      setIsDirty(true);
                    }}
                    disabled={isLive || hasActiveCandidates || isCompleted || isCancelled}
                  />
                  <div style={{ fontSize: "0.74rem", color: "var(--text-subtle)", marginTop: "0.2rem" }}>
                    {hasActiveCandidates ? "Locked while candidates are actively taking the examination." : "Deducted for incorrect responses. Individual questions can override."}
                  </div>
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: 600 }}>Topics Covered</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Enter topics as comma-separated tags (e.g. Kinematics, Newton Laws, Friction)..."
                  value={topicsCovered}
                  onChange={(e) => {
                    setTopicsCovered(e.target.value);
                    setIsDirty(true);
                  }}
                  disabled={isLive}
                />
              </div>

              <div>
                <label className="form-label">Test Series (Optional)</label>
                <select
                  className="input"
                  value={testSeriesId}
                  onChange={(e) => {
                    setTestSeriesId(e.target.value);
                    setIsDirty(true);
                  }}
                  disabled={isLive}
                >
                  <option value="">Standalone Test (No Series)</option>
                  {seriesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid-2">
                <div>
                  <label className="form-label">Description (Optional)</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Brief description of the test paper syllabus or objectives..."
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setIsDirty(true);
                    }}
                  />
                </div>
                <div>
                  <label className="form-label">Instructions for Candidate</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Rules and guidelines shown to students before starting..."
                    value={instructions}
                    onChange={(e) => {
                      setInstructions(e.target.value);
                      setIsDirty(true);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Schedule & Availability */}
          <div className="card" style={{ padding: "1.75rem" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "0.3rem" }}>
              Examination Schedule & Availability
            </h2>
            <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              Define when student candidates are permitted to start and complete their attempts.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "1.25rem" }}>
              {/* Option 1: Immediate / Open Exam */}
              <div
                onClick={() => {
                  if (isLive) return;
                  setStartTime("");
                  setEndTime("");
                  setIsDirty(true);
                }}
                style={{
                  padding: "0.85rem",
                  borderRadius: "8px",
                  border: !startTime && !endTime ? "2px solid var(--primary-500)" : "1px solid var(--border-color)",
                  background: !startTime && !endTime ? "rgba(99, 102, 241, 0.12)" : "var(--bg-surface-elevated)",
                  cursor: isLive ? "not-allowed" : "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: !startTime && !endTime ? "var(--primary-600)" : "var(--text-main)", marginBottom: "0.3rem" }}>
                  Immediate / Open Exam
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                  Candidates can attempt anytime immediately once published.
                </div>
              </div>

              {/* Option 2: Fixed Window */}
              <div
                onClick={() => {
                  if (isLive) return;
                  if (!startTime) {
                    const now = new Date();
                    now.setHours(now.getHours() + 1, 0, 0, 0);
                    setStartTime(now.toISOString().substring(0, 16));
                    const end = new Date(now.getTime() + durationMinutes * 60000);
                    setEndTime(end.toISOString().substring(0, 16));
                    setIsDirty(true);
                  }
                }}
                style={{
                  padding: "0.85rem",
                  borderRadius: "8px",
                  border: startTime && endTime ? "2px solid var(--primary-500)" : "1px solid var(--border-color)",
                  background: startTime && endTime ? "rgba(99, 102, 241, 0.12)" : "var(--bg-surface-elevated)",
                  cursor: isLive ? "not-allowed" : "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: startTime && endTime ? "var(--primary-600)" : "var(--text-main)", marginBottom: "0.3rem" }}>
                  Fixed Start & End Window
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                  Synchronous batch test. Candidates must attempt within the strict calendar window.
                </div>
              </div>

              {/* Option 3: Flexible Start with Expiration */}
              <div
                onClick={() => {
                  if (isLive) return;
                  if (!startTime) {
                    const now = new Date();
                    now.setHours(now.getHours() + 1, 0, 0, 0);
                    setStartTime(now.toISOString().substring(0, 16));
                    setIsDirty(true);
                  }
                  if (!endTime) {
                    const exp = new Date(Date.now() + 48 * 3600000);
                    setEndTime(exp.toISOString().substring(0, 16));
                    setIsDirty(true);
                  }
                }}
                style={{
                  padding: "0.85rem",
                  borderRadius: "8px",
                  border: startTime && !endTime ? "2px solid var(--primary-500)" : "1px solid var(--border-color)",
                  background: startTime && !endTime ? "rgba(99, 102, 241, 0.12)" : "var(--bg-surface-elevated)",
                  cursor: isLive ? "not-allowed" : "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: startTime && !endTime ? "var(--primary-600)" : "var(--text-main)", marginBottom: "0.3rem" }}>
                  Fixed Start (Open-Ended)
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                  Opens at a scheduled date and time, remaining accessible until manually concluded or archived.
                </div>
              </div>
            </div>

            <div className="grid-2">
              <div>
                <label className="form-label" style={{ fontWeight: 600 }}>Scheduled Start Date & Time</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    setIsDirty(true);
                  }}
                  disabled={isLive}
                />
                <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)", marginTop: "0.25rem" }}>
                  Leave empty for an immediate, self-paced examination.
                </div>
              </div>
              <div>
                <label className="form-label" style={{ fontWeight: 600 }}>Scheduled End Date & Time / Expiration</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    setIsDirty(true);
                  }}
                  disabled={isLive}
                />
                <div style={{ fontSize: "0.75rem", color: "var(--text-subtle)", marginTop: "0.25rem" }}>
                  Optional expiration timestamp after which attempts cannot be submitted.
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Progressive Disclosure: Advanced Examination Rules & Security */}
          <div className="card" style={{ padding: "1.5rem" }}>
            <div
              onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <div>
                <h2 style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--text-main)", margin: 0, display: "flex", alignItems: "center", gap: "0.45rem" }}>
                  <Sliders size={16} color="#818cf8" />
                  <span>Advanced Examination Rules & Candidate Security</span>
                </h2>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                  Randomization, candidate reconnection, and post-submission evaluation visibility.
                </div>
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: "0.78rem" }}
              >
                {showAdvancedSettings ? "Hide Advanced Rules ▲" : "Show Advanced Rules ▼"}
              </button>
            </div>

            {showAdvancedSettings && (
              <div style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "1px solid var(--border-color)", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div className="grid-2">
                  <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.85rem", background: "var(--bg-surface-elevated)", border: "1px solid var(--border-color)", borderRadius: "8px", cursor: isLive ? "not-allowed" : "pointer" }}>
                    <input
                      type="checkbox"
                      checked={questionOrder === "RANDOM"}
                      onChange={(e) => {
                        setQuestionOrder(e.target.checked ? "RANDOM" : "FIXED");
                        setIsDirty(true);
                      }}
                      disabled={isLive}
                      style={{ width: "16px", height: "16px" }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)" }}>
                        Randomize Question Order
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        Questions are shuffled independently for each candidate.
                      </div>
                    </div>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.85rem", background: "var(--bg-surface-elevated)", border: "1px solid var(--border-color)", borderRadius: "8px", cursor: isLive ? "not-allowed" : "pointer" }}>
                    <input
                      type="checkbox"
                      checked={optionOrder === "RANDOM"}
                      onChange={(e) => {
                        setOptionOrder(e.target.checked ? "RANDOM" : "FIXED");
                        setIsDirty(true);
                      }}
                      disabled={isLive}
                      style={{ width: "16px", height: "16px" }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)" }}>
                        Randomize Option Order
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        Shuffles option choices (A, B, C, D) per candidate.
                      </div>
                    </div>
                  </label>
                </div>

                <div className="grid-2">
                  <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.85rem", background: "var(--bg-surface-elevated)", border: "1px solid var(--border-color)", borderRadius: "8px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={allowResume}
                      onChange={(e) => {
                        setAllowResume(e.target.checked);
                        setIsDirty(true);
                      }}
                      style={{ width: "16px", height: "16px" }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)" }}>
                        Allow Candidate Resume & Reconnection
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        Permits candidates to reconnect if network disconnects.
                      </div>
                    </div>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.85rem", background: "var(--bg-surface-elevated)", border: "1px solid var(--border-color)", borderRadius: "8px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={showAnswers}
                      onChange={(e) => {
                        setShowAnswers(e.target.checked);
                        setIsDirty(true);
                      }}
                      style={{ width: "16px", height: "16px" }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)" }}>
                        Show Correct Answers Post-Exam
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        Allows candidate to inspect correct answers after submission.
                      </div>
                    </div>
                  </label>
                </div>

                <div className="grid-2">
                  <div>
                    <label className="form-label" style={{ fontWeight: 600 }}>Result Visibility</label>
                    <select
                      className="input"
                      value={resultVisibility}
                      onChange={(e: any) => {
                        setResultVisibility(e.target.value);
                        setIsDirty(true);
                      }}
                    >
                      <option value="IMMEDIATELY">Immediately after submission</option>
                      <option value="HIDDEN">Hidden (Teacher release only)</option>
                      <option value="SCHEDULED">Scheduled after exam window closes</option>
                    </select>
                  </div>

                  <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.85rem", background: "var(--bg-surface-elevated)", border: "1px solid var(--border-color)", borderRadius: "8px", cursor: "pointer", marginTop: "1.4rem" }}>
                    <input
                      type="checkbox"
                      checked={showExplanation}
                      onChange={(e) => {
                        setShowExplanation(e.target.checked);
                        setIsDirty(true);
                      }}
                      style={{ width: "16px", height: "16px" }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-main)" }}>
                        Show Solution Explanations
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        Display step-by-step solutions in candidate review script.
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: AUDIT HISTORY / LOGS
          ========================================================================= */}
      {activeTab === "audit" && (
        <div className="card" style={{ padding: "1.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.75rem" }}>
            <div>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--text-main)", margin: 0 }}>
                Test Modification Audit Log
              </h2>
              <p style={{ margin: "0.15rem 0 0 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                Trace of all administrative actions, question additions, reordering, and publishing events.
              </p>
            </div>
            <button onClick={loadAuditHistory} className="btn btn-secondary btn-sm">
              Refresh Logs
            </button>
          </div>

          {loadingAudit ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
              Loading audit records...
            </div>
          ) : auditLogs.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  style={{
                    padding: "0.85rem 1rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-surface-elevated)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#818cf8" }}>
                      {log.action}
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-subtle)" }}>
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.9rem", color: "var(--text-main)" }}>
                    {log.details}
                  </div>
                  <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
                    Admin: <strong>{log.admin_name}</strong>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
              No audit logs found for this test paper.
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          MINIMAL BOTTOM ACTION BAR (Save Draft | Preview | Publish)
          ========================================================================= */}
      <div className="test-editor-bottom-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Status: <strong style={{ color: "var(--text-main)" }}>{test?.status}</strong>
          </span>
          {isLive && (
            <span style={{ fontSize: "0.78rem", color: "#34d399", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
              <Lock size={12} /> Structural Changes Locked
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {/* Save Draft */}
          <button
            onClick={handleSaveDraft}
            disabled={saving || isLive}
            className="btn btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <Save size={15} />
            <span>{saving ? "Saving..." : "Save Draft"}</span>
          </button>

          {/* Preview Test */}
          <button
            onClick={() => {
              setPreviewQIndex(0);
              setShowPreviewModal(true);
            }}
            className="btn btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <Eye size={15} />
            <span>Preview</span>
          </button>

          {/* Publish */}
          {!isLive && (
            <button
              onClick={handlePublish}
              disabled={saving}
              className="btn btn-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                fontWeight: 700,
                padding: "0.6rem 1.25rem",
              }}
            >
              <Send size={15} />
              <span>{saving ? "Publishing..." : "Publish"}</span>
            </button>
          )}
        </div>
      </div>
      {/* Question Composer is rendered inline directly inside the Test Builder as a Google Forms-style card */}

      {/* =========================================================================
          MODAL: STUDENT EXAM WINDOW PREVIEW SIMULATOR (Requirement 6)
          ========================================================================= */}
      {showPreviewModal && test && (
        <div className="modal-overlay" onClick={() => setShowPreviewModal(false)}>
          <div
            className="modal-content"
            style={{
              maxWidth: "1080px",
              padding: "0",
              background: "var(--bg-main)",
              overflow: "hidden",
              borderRadius: "14px",
              border: "1px solid var(--border-color)",
              boxShadow: "0 25px 60px rgba(0, 0, 0, 0.85)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Exam Header */}
            <div
              style={{
                background: "var(--bg-surface-elevated)",
                borderBottom: "1px solid var(--border-color)",
                padding: "0.85rem 1.5rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.75rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span
                  style={{
                    background: "rgba(245, 158, 11, 0.2)",
                    color: "#fbbf24",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    padding: "0.2rem 0.6rem",
                    borderRadius: "4px",
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    letterSpacing: "0.06em",
                  }}
                >
                  STUDENT CBT SIMULATOR
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", color: "var(--text-main)", fontWeight: 700 }}>
                    {test.title}
                  </h3>
                  <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                    Subject: <strong>{subjects.find((s) => s.id === subjectId)?.name || "General"}</strong> • Total Questions: {questions.length} • Marks: {calculatedTotalMarks} • Simulation mode (no real submission recorded)
                  </div>
                </div>
              </div>

              {/* Countdown Timer & Close Action */}
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <div
                  style={{
                    background: simTimeRemaining < 300 ? "rgba(239, 68, 68, 0.2)" : "rgba(99, 102, 241, 0.18)",
                    border: `1px solid ${simTimeRemaining < 300 ? "rgba(239, 68, 68, 0.5)" : "rgba(99, 102, 241, 0.4)"}`,
                    color: simTimeRemaining < 300 ? "#f87171" : "var(--primary-600)",
                    padding: "0.45rem 0.9rem",
                    borderRadius: "8px",
                    fontFamily: "monospace",
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    letterSpacing: "0.05em",
                  }}
                  title="Simulated Examination Countdown Timer"
                >
                  <Clock size={16} />
                  <span>{formatTimer(simTimeRemaining)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  style={{
                    background: "var(--bg-surface-elevated)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "0.45rem",
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="Exit Preview"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Exam Simulation Main Body */}
            {simSubmitted ? (
              /* Simulation Score Card View */
              <div style={{ padding: "3rem 2rem", textAlign: "center", maxWidth: "620px", margin: "0 auto" }}>
                {(() => {
                  let simScore = 0;
                  let simCorrect = 0;
                  let simWrong = 0;
                  let simUnattempted = 0;

                  questions.forEach((q, idx) => {
                    const ans = simAnswers[idx];
                    const pMarks = Number(q.marks ?? positiveMarks ?? 4);
                    const nMarks = Number(q.negative_marks ?? negativeMarks ?? 1);

                    if (ans === undefined || ans === "") {
                      simUnattempted++;
                    } else if (q.question_type === "NUMERICAL" || q.question_type === "FILL_BLANK") {
                      const val = parseFloat(ans);
                      const expected = parseFloat(q.numerical_answer || "0");
                      const tol = parseFloat(q.numerical_tolerance || "0");
                      if (!isNaN(val) && Math.abs(val - expected) <= tol) {
                        simScore += pMarks;
                        simCorrect++;
                      } else {
                        simScore -= nMarks;
                        simWrong++;
                      }
                    } else if (q.question_type === "MULTIPLE_CHOICE") {
                      const selectedArr = ans.split("||");
                      const correctOpts = (q.options || []).filter((o: any) => o.is_correct).map((o: any) => o.content);
                      const isAllRight = correctOpts.length === selectedArr.length && correctOpts.every((c: string) => selectedArr.includes(c));
                      if (isAllRight) {
                        simScore += pMarks;
                        simCorrect++;
                      } else {
                        simScore -= nMarks;
                        simWrong++;
                      }
                    } else {
                      const correctOpt = (q.options || []).find((o: any) => o.is_correct);
                      if (correctOpt && correctOpt.content === ans) {
                        simScore += pMarks;
                        simCorrect++;
                      } else {
                        simScore -= nMarks;
                        simWrong++;
                      }
                    }
                  });

                  const pct = calculatedTotalMarks > 0 ? Math.round((simScore / calculatedTotalMarks) * 100) : 0;

                  return (
                    <div>
                      <div
                        style={{
                          width: "64px",
                          height: "64px",
                          borderRadius: "50%",
                          background: "rgba(16, 185, 129, 0.15)",
                          color: "#34d399",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          margin: "0 auto 1.25rem",
                          border: "1px solid rgba(16, 185, 129, 0.3)",
                        }}
                      >
                        <CheckCircle2 size={36} />
                      </div>

                      <h2 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text-main)", marginBottom: "0.4rem" }}>
                        Exam Simulation Completed
                      </h2>
                      <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.75rem" }}>
                        This preview simulated candidate responses and score evaluation. No candidate record or submission was stored.
                      </p>

                      <div
                        style={{
                          background: "var(--bg-surface-elevated)",
                          border: "1px solid var(--border-color)",
                          borderRadius: "12px",
                          padding: "1.5rem",
                          marginBottom: "2rem",
                        }}
                      >
                        <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
                          Simulated Score
                        </div>
                        <div style={{ fontSize: "2.4rem", fontWeight: 800, color: simScore >= 0 ? "#34d399" : "#f87171" }}>
                          {simScore} <span style={{ fontSize: "1.2rem", color: "var(--text-muted)", fontWeight: 500 }}>/ {calculatedTotalMarks} Marks</span>
                        </div>
                        <div style={{ fontSize: "0.95rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                          Accuracy: <strong style={{ color: "var(--text-main)" }}>{pct}%</strong>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(3, 1fr)",
                            gap: "0.75rem",
                            marginTop: "1.25rem",
                            paddingTop: "1.25rem",
                            borderTop: "1px solid var(--border-color)",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: "0.75rem", color: "#34d399" }}>Correct</div>
                            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-main)" }}>{simCorrect}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: "0.75rem", color: "#f87171" }}>Incorrect</div>
                            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-main)" }}>{simWrong}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Unattempted</div>
                            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-main)" }}>{simUnattempted}</div>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setSimAnswers({});
                            setSimMarkedReview(new Set());
                            setSimVisited(new Set([0]));
                            setSimSubmitted(false);
                            setPreviewQIndex(0);
                            setSimTimeRemaining((durationMinutes || 60) * 60);
                          }}
                          className="btn btn-secondary"
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                        >
                          <RotateCcw size={15} />
                          <span>Restart Simulation</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowPreviewModal(false)}
                          className="btn btn-primary"
                        >
                          Close Preview
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              /* Interactive Active Exam Screen */
              <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", minHeight: "520px" }}>
                {/* Left Area: Active Question Workspace */}
                <div
                  style={{
                    padding: "1.5rem 2rem",
                    borderRight: "1px solid var(--border-color)",
                    overflowY: "auto",
                    maxHeight: "72vh",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  {questions.length > 0 ? (
                    <div>
                      {(() => {
                        const curQ = questions[previewQIndex] || questions[0];
                        if (!curQ) return <div>Question unavailable.</div>;

                        const curAns = simAnswers[previewQIndex];
                        const isMarked = simMarkedReview.has(previewQIndex);

                        return (
                          <div>
                            {/* Question Title Bar */}
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "1.25rem",
                                borderBottom: "1px solid var(--border-color)",
                                paddingBottom: "0.75rem",
                                flexWrap: "wrap",
                                gap: "0.5rem",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                                <span style={{ fontWeight: 800, color: "var(--text-main)", fontSize: "1.1rem" }}>
                                  Question {previewQIndex + 1}
                                </span>
                                <span
                                  style={{
                                    fontSize: "0.72rem",
                                    padding: "0.15rem 0.5rem",
                                    borderRadius: "4px",
                                    background: "var(--bg-surface-elevated)",
                                    color: "var(--text-muted)",
                                    fontWeight: 600,
                                  }}
                                >
                                  {curQ.question_type}
                                </span>
                                {isMarked && (
                                  <span
                                    style={{
                                      fontSize: "0.72rem",
                                      padding: "0.15rem 0.5rem",
                                      borderRadius: "4px",
                                      background: "rgba(168, 85, 247, 0.2)",
                                      color: "#c084fc",
                                      fontWeight: 600,
                                    }}
                                  >
                                    Marked for Review
                                  </span>
                                )}
                              </div>

                              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                                Marking Scheme: <strong style={{ color: "#34d399" }}>+{curQ.marks || positiveMarks}</strong> /{" "}
                                <strong style={{ color: "#f87171" }}>-{curQ.negative_marks || negativeMarks}</strong>
                              </div>
                            </div>

                            {/* Question Statement Content */}
                            <div
                              style={{
                                fontSize: "1.05rem",
                                lineHeight: 1.7,
                                color: "var(--text-main)",
                                marginBottom: "1.5rem",
                              }}
                            >
                              <MathRenderer text={curQ.content} />
                            </div>

                            {/* Question Diagram if present */}
                            {curQ.image_url && (
                              <div style={{ marginBottom: "1.5rem" }}>
                                <img
                                  src={curQ.image_url}
                                  alt="Question diagram"
                                  style={{
                                    maxWidth: "100%",
                                    maxHeight: "260px",
                                    objectFit: "contain",
                                    borderRadius: "8px",
                                    border: "1px solid var(--border-color)",
                                    background: "rgba(0,0,0,0.3)",
                                  }}
                                />
                              </div>
                            )}

                            {/* Interactive Options Area: MCQ / Single Choice / Assertion / Match / True-False */}
                            {(curQ.question_type === "MCQ" ||
                              curQ.question_type === "TRUE_FALSE" ||
                              curQ.question_type === "ASSERTION_REASON" ||
                              curQ.question_type === "MATCH_THE_FOLLOWING") &&
                              curQ.options &&
                              curQ.options.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.75rem" }}>
                                  {curQ.options.map((opt: any, idx: number) => {
                                    const isSelected = curAns === opt.content;
                                    return (
                                      <div
                                        key={opt.id || idx}
                                        onClick={() => {
                                          setSimAnswers((prev) => ({ ...prev, [previewQIndex]: opt.content }));
                                        }}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "0.85rem",
                                          padding: "0.85rem 1.15rem",
                                          border: isSelected ? "2px solid #6366f1" : "1px solid var(--border-color)",
                                          borderRadius: "8px",
                                          background: isSelected ? "rgba(99, 102, 241, 0.16)" : "var(--bg-input)",
                                          cursor: "pointer",
                                          transition: "all 0.15s ease",
                                        }}
                                      >
                                        <div
                                          style={{
                                            width: "26px",
                                            height: "26px",
                                            borderRadius: "50%",
                                            border: isSelected ? "2px solid var(--primary-500)" : "2px solid var(--border-color)",
                                            background: isSelected ? "#6366f1" : "transparent",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: "0.82rem",
                                            fontWeight: 700,
                                            color: isSelected ? "#ffffff" : "#94a3b8",
                                            flexShrink: 0,
                                          }}
                                        >
                                          {String.fromCharCode(65 + idx)}
                                        </div>
                                        <div style={{ fontSize: "0.95rem", color: isSelected ? "#ffffff" : "var(--text-main)" }}>
                                          <MathRenderer text={opt.content} />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                            {/* Interactive Options Area: MULTIPLE_CHOICE (Multi-select) */}
                            {curQ.question_type === "MULTIPLE_CHOICE" && curQ.options && (
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.75rem" }}>
                                {curQ.options.map((opt: any, idx: number) => {
                                  const selectedArr = curAns ? curAns.split("||") : [];
                                  const isChecked = selectedArr.includes(opt.content);
                                  return (
                                    <div
                                      key={opt.id || idx}
                                      onClick={() => {
                                        let nextArr = [...selectedArr];
                                        if (isChecked) {
                                          nextArr = nextArr.filter((c) => c !== opt.content);
                                        } else {
                                          nextArr.push(opt.content);
                                        }
                                        setSimAnswers((prev) => ({
                                          ...prev,
                                          [previewQIndex]: nextArr.join("||"),
                                        }));
                                      }}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "0.85rem",
                                        padding: "0.85rem 1.15rem",
                                        border: isChecked ? "2px solid #6366f1" : "1px solid var(--border-color)",
                                        borderRadius: "8px",
                                        background: isChecked ? "rgba(99, 102, 241, 0.16)" : "var(--bg-input)",
                                        cursor: "pointer",
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: "24px",
                                          height: "24px",
                                          borderRadius: "4px",
                                          border: isChecked ? "2px solid var(--primary-500)" : "2px solid var(--border-color)",
                                          background: isChecked ? "#6366f1" : "transparent",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          color: "var(--text-main)",
                                          flexShrink: 0,
                                        }}
                                      >
                                        {isChecked && <Check size={16} />}
                                      </div>
                                      <div style={{ fontSize: "0.95rem", color: isChecked ? "#ffffff" : "var(--text-main)" }}>
                                        <MathRenderer text={opt.content} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Interactive Options Area: NUMERICAL / FILL_BLANK */}
                            {(curQ.question_type === "NUMERICAL" ||
                              curQ.question_type === "FILL_BLANK") && (
                              <div style={{ marginBottom: "1.75rem", padding: "1.25rem", background: "var(--bg-surface-elevated)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                                <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.6rem", fontWeight: 600 }}>
                                  Enter Candidate Numerical / Value Response:
                                </label>
                                <input
                                  type="text"
                                  placeholder="Type response..."
                                  className="input"
                                  style={{ maxWidth: "260px", fontSize: "1.1rem", fontFamily: "monospace", fontWeight: 700 }}
                                  value={curAns || ""}
                                  onChange={(e) => {
                                    setSimAnswers((prev) => ({ ...prev, [previewQIndex]: e.target.value }));
                                  }}
                                />
                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
                                  Candidate can use keyboard or on-screen keypad to enter numerical responses.
                                </div>
                              </div>
                            )}

                            {/* CBT Exam Action Controls Footer */}
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginTop: "2rem",
                                paddingTop: "1.25rem",
                                borderTop: "1px solid var(--border-color)",
                                flexWrap: "wrap",
                                gap: "0.6rem",
                              }}
                            >
                              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Save & Next
                                    setSimVisited((prev) => {
                                      const next = new Set(prev);
                                      next.add(previewQIndex + 1);
                                      return next;
                                    });
                                    if (previewQIndex < questions.length - 1) {
                                      setPreviewQIndex(previewQIndex + 1);
                                    }
                                  }}
                                  className="btn btn-primary btn-sm"
                                  style={{ fontWeight: 700, padding: "0.5rem 1rem" }}
                                >
                                  Save & Next
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    // Mark for Review & Next
                                    setSimMarkedReview((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(previewQIndex)) next.delete(previewQIndex);
                                      else next.add(previewQIndex);
                                      return next;
                                    });
                                    setSimVisited((prev) => {
                                      const next = new Set(prev);
                                      next.add(previewQIndex + 1);
                                      return next;
                                    });
                                    if (previewQIndex < questions.length - 1) {
                                      setPreviewQIndex(previewQIndex + 1);
                                    }
                                  }}
                                  className="btn btn-secondary btn-sm"
                                  style={{
                                    fontWeight: 600,
                                    borderColor: isMarked ? "#a855f7" : "var(--border-color)",
                                    color: isMarked ? "#c084fc" : "var(--text-main)",
                                  }}
                                >
                                  {isMarked ? "Unmark Review & Next" : "Mark for Review & Next"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    // Clear Response
                                    setSimAnswers((prev) => {
                                      const next = { ...prev };
                                      delete next[previewQIndex];
                                      return next;
                                    });
                                  }}
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: "0.82rem", color: "var(--text-subtle)" }}
                                  disabled={!curAns}
                                >
                                  Clear Response
                                </button>
                              </div>

                              <div style={{ display: "flex", gap: "0.5rem" }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const prevIdx = Math.max(0, previewQIndex - 1);
                                    setSimVisited((prev) => {
                                      const next = new Set(prev);
                                      next.add(prevIdx);
                                      return next;
                                    });
                                    setPreviewQIndex(prevIdx);
                                  }}
                                  disabled={previewQIndex === 0}
                                  className="btn btn-secondary btn-sm"
                                >
                                  Previous
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextIdx = Math.min(questions.length - 1, previewQIndex + 1);
                                    setSimVisited((prev) => {
                                      const next = new Set(prev);
                                      next.add(nextIdx);
                                      return next;
                                    });
                                    setPreviewQIndex(nextIdx);
                                  }}
                                  disabled={previewQIndex === questions.length - 1}
                                  className="btn btn-secondary btn-sm"
                                >
                                  Next
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
                      No questions in this test paper yet. Add questions in the Test Builder to preview.
                    </div>
                  )}
                </div>

                {/* Right Column: NTA Question Palette Sidebar */}
                <div
                  style={{
                    padding: "1.25rem",
                    background: "var(--bg-surface-elevated)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    overflowY: "auto",
                    maxHeight: "72vh",
                  }}
                >
                  <div>
                    {/* Candidate Identity Preview */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.65rem",
                        paddingBottom: "1rem",
                        marginBottom: "1rem",
                        borderBottom: "1px solid var(--border-color)",
                      }}
                    >
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          background: "rgba(99, 102, 241, 0.2)",
                          color: "var(--primary-600)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "0.85rem",
                        }}
                      >
                        TP
                      </div>
                      <div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-main)" }}>
                          Teacher Preview
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                          Candidate Console Sim
                        </div>
                      </div>
                    </div>

                    {/* Question Palette Header */}
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.75rem", letterSpacing: "0.05em" }}>
                      Question Palette
                    </div>

                    {/* Question Palette Number Buttons */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: "0.45rem",
                        marginBottom: "1.25rem",
                      }}
                    >
                      {questions.map((_, idx) => {
                        const hasAns = simAnswers[idx] !== undefined && simAnswers[idx] !== "";
                        const isMarked = simMarkedReview.has(idx);
                        const isCur = idx === previewQIndex;

                        let bg = "var(--bg-input)";
                        let color = "var(--text-muted)";
                        let border = "1px solid var(--border-color)";

                        if (isMarked && hasAns) {
                          bg = "rgba(168, 85, 247, 0.35)";
                          color = "#e9d5ff";
                          border = "1px solid #a855f7";
                        } else if (isMarked) {
                          bg = "rgba(168, 85, 247, 0.2)";
                          color = "#c084fc";
                          border = "1px solid #8b5cf6";
                        } else if (hasAns) {
                          bg = "#10b981";
                          color = "#ffffff";
                          border = "1px solid #059669";
                        } else if (simVisited.has(idx)) {
                          bg = "#ef4444";
                          color = "#ffffff";
                          border = "1px solid #dc2626";
                        }

                        if (isCur) {
                          border = "2px solid var(--primary-500)";
                        }

                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setSimVisited((prev) => {
                                const next = new Set(prev);
                                next.add(idx);
                                return next;
                              });
                              setPreviewQIndex(idx);
                            }}
                            style={{
                              width: "100%",
                              aspectRatio: "1/1",
                              borderRadius: "6px",
                              border,
                              background: bg,
                              color,
                              fontWeight: 700,
                              fontSize: "0.82rem",
                              cursor: "pointer",
                              transition: "all 0.1s ease",
                              position: "relative",
                            }}
                            title={`Jump to Question #${idx + 1}`}
                          >
                            {idx + 1}
                            {isMarked && hasAns && (
                              <span
                                style={{
                                  position: "absolute",
                                  top: "2px",
                                  right: "2px",
                                  width: "6px",
                                  height: "6px",
                                  borderRadius: "50%",
                                  background: "#34d399",
                                }}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* NTA Palette Legend Counters */}
                    <div
                      style={{
                        padding: "0.75rem",
                        background: "var(--bg-surface-elevated)",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.45rem",
                        fontSize: "0.75rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "#10b981" }} />
                          <span style={{ color: "var(--text-muted)" }}>Answered:</span>
                        </div>
                        <strong style={{ color: "#34d399" }}>
                          {Object.keys(simAnswers).filter((k) => simAnswers[Number(k)] && !simMarkedReview.has(Number(k))).length}
                        </strong>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "#ef4444" }} />
                          <span style={{ color: "var(--text-muted)" }}>Not Answered:</span>
                        </div>
                        <strong style={{ color: "#f87171" }}>
                          {questions.filter((_, i) => simVisited.has(i) && !simAnswers[i] && !simMarkedReview.has(i)).length}
                        </strong>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "#8b5cf6" }} />
                          <span style={{ color: "var(--text-muted)" }}>Marked Review:</span>
                        </div>
                        <strong style={{ color: "#c084fc" }}>
                          {simMarkedReview.size}
                        </strong>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "rgba(255,255,255,0.15)" }} />
                          <span style={{ color: "var(--text-muted)" }}>Not Visited:</span>
                        </div>
                        <strong style={{ color: "#94a3b8" }}>
                          {Math.max(0, questions.length - simVisited.size)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
                    <button
                      type="button"
                      onClick={() => setShowSimSubmitConfirm(true)}
                      className="btn btn-success"
                      style={{ width: "100%", justifyContent: "center", fontWeight: 700 }}
                    >
                      Submit Examination
                    </button>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-subtle)", textAlign: "center", marginTop: "0.4rem" }}>
                      Evaluates simulated student test
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Confirmation Overlay in Preview */}
            {showSimSubmitConfirm && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0, 0, 0, 0.8)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 200,
                  backdropFilter: "blur(4px)",
                }}
              >
                <div
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "12px",
                    padding: "1.75rem",
                    maxWidth: "440px",
                    width: "90%",
                    textAlign: "center",
                    boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
                  }}
                >
                  <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--text-main)", fontSize: "1.2rem", fontWeight: 700 }}>
                    Submit Examination?
                  </h3>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
                    Are you sure you want to end your simulated examination? You will receive an instant simulated score breakdown.
                  </p>

                  <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
                    <button
                      type="button"
                      onClick={() => setShowSimSubmitConfirm(false)}
                      className="btn btn-secondary"
                    >
                      Return to Exam
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSimSubmitConfirm(false);
                        setSimSubmitted(true);
                      }}
                      className="btn btn-success"
                      style={{ fontWeight: 700 }}
                    >
                      Yes, Submit Exam
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: PRE-PUBLISH VALIDATION & CONFIRMATION SUMMARY (Requirement 7)
          ========================================================================= */}
      {showPublishSummaryModal && (
        <div className="modal-overlay" onClick={() => setShowPublishSummaryModal(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: "620px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(99, 102, 241, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary-600)" }}>
                  <Send size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--text-main)", fontWeight: 700 }}>
                    Publish Examination Confirmation
                  </h3>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    Pre-publishing validation and exam checklist
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPublishSummaryModal(false)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Test Paper Summary Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "0.75rem",
                marginBottom: "1.25rem",
              }}
            >
              <div style={{ padding: "0.85rem", background: "var(--bg-surface-elevated)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>Questions Count</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-main)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <CheckCircle2 size={16} color="#34d399" />
                  <span>{questions.length} Questions</span>
                </div>
              </div>

              <div style={{ padding: "0.85rem", background: "var(--bg-surface-elevated)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>Total Calculated Marks</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#34d399" }}>
                  {calculatedTotalMarks} Marks
                </div>
              </div>

              <div style={{ padding: "0.85rem", background: "var(--bg-surface-elevated)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>Duration</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-main)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <Clock size={16} color="#60a5fa" />
                  <span>{durationMinutes} Minutes</span>
                </div>
              </div>

              <div style={{ padding: "0.85rem", background: "var(--bg-surface-elevated)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>Subject</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {subjects.find((s) => s.id === subjectId)?.name || "General"}
                </div>
              </div>
            </div>

            {/* Schedule & Timing Overview */}
            <div
              style={{
                padding: "0.85rem 1rem",
                borderRadius: "8px",
                background: "rgba(99, 102, 241, 0.08)",
                border: "1px solid rgba(99, 102, 241, 0.25)",
                marginBottom: "1.25rem",
              }}
            >
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--primary-600)", textTransform: "uppercase", marginBottom: "0.35rem" }}>
                Schedule & Availability
              </div>
              <div style={{ fontSize: "0.88rem", color: "var(--text-main)" }}>
                {startTime ? (
                  <div>
                    <div><strong>Scheduled Start:</strong> {new Date(startTime).toLocaleString()}</div>
                    {endTime && <div><strong>Scheduled End:</strong> {new Date(endTime).toLocaleString()}</div>}
                  </div>
                ) : (
                  <div><strong>Immediate / Open:</strong> Examination goes LIVE immediately for students.</div>
                )}
              </div>
            </div>

            {/* Pre-Publish Live Validation Checklist (Requirement 7) */}
            {(() => {
              const valErrors = getPublishValidationErrors();
              if (valErrors.length > 0) {
                return (
                  <div
                    style={{
                      padding: "1rem",
                      background: "rgba(239, 68, 68, 0.12)",
                      border: "1px solid rgba(239, 68, 68, 0.4)",
                      borderRadius: "8px",
                      marginBottom: "1.5rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", color: "#f87171", fontWeight: 700, fontSize: "0.88rem", marginBottom: "0.5rem" }}>
                      <AlertCircle size={17} />
                      <span>Validation Issues Found ({valErrors.length})</span>
                    </div>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0 0 0.65rem 0" }}>
                      Please resolve the following issues in your paper before publishing:
                    </p>
                    <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.82rem", color: "#fca5a5", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      {valErrors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                );
              }

              return (
                <div
                  style={{
                    padding: "0.85rem 1rem",
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.35)",
                    borderRadius: "8px",
                    color: "#34d399",
                    fontSize: "0.85rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "1.5rem",
                  }}
                >
                  <CheckCircle2 size={18} />
                  <span>
                    <strong>Validation passed!</strong> All {questions.length} questions and exam rules are properly configured and ready for students.
                  </span>
                </div>
              );
            })()}

            {/* Candidate Access Code Notice */}
            <div
              style={{
                padding: "0.85rem 1rem",
                borderRadius: "8px",
                background: "rgba(16, 185, 129, 0.06)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
                marginBottom: "1.5rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#34d399", textTransform: "uppercase" }}>
                  Candidate Access Code
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                  Unique access code generated automatically on publish
                </div>
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  color: "#34d399",
                  background: "rgba(16, 185, 129, 0.18)",
                  padding: "0.25rem 0.65rem",
                  borderRadius: "6px",
                  letterSpacing: "0.08em",
                }}
              >
                {code || "AUTO-GEN"}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={() => setShowPublishSummaryModal(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmPublish}
                disabled={saving || getPublishValidationErrors().length > 0}
                className="btn btn-primary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontWeight: 700,
                  opacity: getPublishValidationErrors().length > 0 ? 0.5 : 1,
                  cursor: getPublishValidationErrors().length > 0 ? "not-allowed" : "pointer",
                }}
              >
                <Send size={15} />
                <span>{saving ? "Publishing..." : "Confirm & Publish Live"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: PUBLISHING RESULT SUCCESS STATE (Requirements 8 & 9)
          ========================================================================= */}
      {showPublishSuccessModal && publishedTestInfo && (
        <div className="modal-overlay" onClick={() => setShowPublishSuccessModal(false)}>
          <div
            className="modal-content"
            style={{
              maxWidth: "580px",
              textAlign: "center",
              padding: "2rem",
              borderRadius: "14px",
              boxShadow: "0 25px 60px rgba(0, 0, 0, 0.85)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                background: "rgba(16, 185, 129, 0.15)",
                color: "#34d399",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1.25rem",
                border: "1px solid rgba(16, 185, 129, 0.35)",
              }}
            >
              <CheckCircle2 size={34} />
            </div>

            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-main)", marginBottom: "0.4rem" }}>
              Examination Published Successfully!
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.75rem" }}>
              <strong>{publishedTestInfo.title}</strong> is now live and ready for candidates. Share the access code below with your students.
            </p>

            {/* Highlighted Candidate Access Code Banner */}
            <div
              style={{
                background: "rgba(16, 185, 129, 0.08)",
                border: "2px dashed rgba(16, 185, 129, 0.45)",
                borderRadius: "12px",
                padding: "1.4rem",
                marginBottom: "1.75rem",
              }}
            >
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#34d399", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
                Candidate Access Code
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: "2.1rem",
                  fontWeight: 800,
                  color: "var(--text-main)",
                  letterSpacing: "0.12em",
                  marginBottom: "0.75rem",
                  textShadow: "0 2px 10px rgba(16, 185, 129, 0.4)",
                }}
              >
                {publishedTestInfo.code || code}
              </div>
              <div style={{ display: "flex", gap: "0.6rem", justifyContent: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => handleCopyCode(publishedTestInfo.code || code)}
                  className="btn btn-secondary btn-sm"
                  style={{
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    borderColor: copiedCode ? "#10b981" : "rgba(16, 185, 129, 0.4)",
                    color: copiedCode ? "#34d399" : "var(--text-main)",
                    background: copiedCode ? "rgba(16, 185, 129, 0.2)" : "var(--bg-surface-elevated)",
                    padding: "0.45rem 1rem",
                  }}
                >
                  {copiedCode ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copiedCode ? "Access Code Copied!" : "Copy Access Code"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyLink(publishedTestInfo.code || code)}
                  className="btn btn-secondary btn-sm"
                  style={{
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    borderColor: copiedLink ? "#10b981" : "rgba(99, 102, 241, 0.4)",
                    color: copiedLink ? "#34d399" : "var(--primary-600)",
                    background: copiedLink ? "rgba(16, 185, 129, 0.2)" : "rgba(99, 102, 241, 0.1)",
                    padding: "0.45rem 1rem",
                  }}
                >
                  {copiedLink ? <Check size={16} /> : <ExternalLink size={16} />}
                  <span>{copiedLink ? "Student URL Copied!" : "Copy Student Link"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyInvitation}
                  className="btn btn-secondary btn-sm"
                  style={{
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    borderColor: copiedInvitation ? "#10b981" : "rgba(249, 115, 22, 0.4)",
                    color: copiedInvitation ? "#34d399" : "var(--ember-500)",
                    background: copiedInvitation ? "rgba(16, 185, 129, 0.2)" : "rgba(249, 115, 22, 0.1)",
                    padding: "0.45rem 1rem",
                  }}
                >
                  {copiedInvitation ? <Check size={16} /> : <Send size={16} />}
                  <span>{copiedInvitation ? "Invitation Copied!" : "Copy Invitation"}</span>
                </button>
              </div>
            </div>

            {/* Quick Spec Summary Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "0.75rem",
                marginBottom: "2rem",
              }}
            >
              <div style={{ padding: "0.75rem", background: "var(--bg-surface-elevated)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Questions</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-main)" }}>{questions.length}</div>
              </div>
              <div style={{ padding: "0.75rem", background: "var(--bg-surface-elevated)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Total Marks</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#34d399" }}>{calculatedTotalMarks}</div>
              </div>
              <div style={{ padding: "0.75rem", background: "var(--bg-surface-elevated)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Duration</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#60a5fa" }}>{durationMinutes}m</div>
              </div>
            </div>

            {/* Action Buttons: Copy, Preview Exam, Open Test, Go to Tests */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              <a
                href={`/exam?code=${encodeURIComponent(publishedTestInfo.code || code)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.45rem",
                  fontWeight: 700,
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  textDecoration: "none",
                  padding: "0.65rem 1rem",
                  borderRadius: "8px",
                  boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
                }}
              >
                <ExternalLink size={16} />
                <span>Open Student Portal in New Tab</span>
              </a>

              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowPublishSuccessModal(false);
                    setShowPreviewModal(true);
                  }}
                  className="btn btn-secondary"
                  style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", fontWeight: 600 }}
                >
                  <Eye size={16} />
                  <span>Preview Exam</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPublishSuccessModal(false)}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Stay in Test Builder
                </button>
              </div>

              <button
                type="button"
                onClick={() => router.push("/admin/tests")}
                className="btn btn-secondary"
                style={{ width: "100%", justifyContent: "center", fontSize: "0.85rem" }}
              >
                Go to Tests Management
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Accessible Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        variant={confirmModal.variant}
        loading={confirmModal.loading}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Accessible Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
