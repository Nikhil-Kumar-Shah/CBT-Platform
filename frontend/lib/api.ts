/**
 * API client for CBT Platform backend.
 * Uses relative /api/v1 paths (proxied to FastAPI backend by Next.js rewrites).
 * Credentials (HttpOnly session cookies) are sent automatically with `credentials: 'include'`.
 */

export interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
  role: string;
  status: string;
  last_login_at?: string;
  created_at: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Topic {
  id: string;
  subject_id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface MediaItem {
  id: string;
  question_id?: string;
  storage_key: string;
  url: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  width: number;
  height: number;
  display_order: number;
  created_at: string;
}

export interface QuestionOption {
  id?: string;
  option_order: number;
  content: string;
  is_correct: boolean;
}

export interface Question {
  id: string;
  question_type: "MCQ" | "NUMERICAL";
  subject_id: string;
  topic_id?: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  content: string;
  explanation?: string;
  marks: number;
  negative_marks: number;
  numerical_answer?: number;
  numerical_tolerance?: number;
  status: "ACTIVE" | "ARCHIVED";
  created_by?: string;
  created_at: string;
  updated_at: string;
  options: QuestionOption[];
  media: MediaItem[];
  subject_name?: string;
  subject_code?: string;
  topic_name?: string;
}

export interface QuestionListResponse {
  items: Question[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface TestQuestionItem {
  id: string;
  test_id: string;
  question_id: string;
  order_index: number;
  marks?: number;
  negative_marks?: number;
  question?: Question;
}

export interface Test {
  id: string;
  title: string;
  code: string;
  description?: string;
  instructions?: string;
  topics_covered?: string;
  test_series_id?: string;
  test_series_name?: string;
  series_order?: number;
  subject_id?: string;
  subject_name?: string;
  duration_minutes: number;
  status: "DRAFT" | "SCHEDULED" | "LIVE" | "COMPLETED" | "ARCHIVED" | "PUBLISHED" | "CLOSED" | "PAUSED" | "CANCELLED";
  positive_marks: number;
  negative_marks: number;
  question_order: "FIXED" | "RANDOM";
  option_order: "FIXED" | "RANDOM";
  result_visibility: "IMMEDIATELY" | "HIDDEN" | "SCHEDULED";
  show_answers: boolean;
  show_explanation: boolean;
  allow_resume: boolean;
  start_time?: string;
  end_time?: string;
  published_at?: string;
  paused_at?: string;
  cancelled_at?: string;
  cancel_reason?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  question_count: number;
  total_marks: number;
  attempts_count: number;
  total_participants?: number;
  total_submissions?: number;
  active_candidates_count?: number;
  difficulty_breakdown: { [key: string]: number };
  questions: TestQuestionItem[];
}

export interface TestAuditLog {
  id: string;
  test_id: string;
  user_id: string;
  admin_name: string;
  action: string;
  details: string;
  created_at: string;
}

export interface ScoreDistributionBucket {
  range_label: string;
  count: number;
  percentage: number;
}

export interface OptionDistributionItem {
  option_id: string;
  option_label: string;
  content_preview: string;
  selection_count: number;
  selection_percentage: number;
  is_correct: boolean;
}

export interface QuestionPerformanceItem {
  question_id: string;
  order_index: number;
  question_type: string;
  preview: string;
  max_marks?: number;
  attempted_count?: number;
  correct_count?: number;
  incorrect_count?: number;
  unattempted_count?: number;
  correct_percentage: number;
  incorrect_percentage: number;
  unattempted_percentage: number;
  accuracy_percentage?: number;
  total_attempts: number;
  average_marks?: number;
  difficulty?: "EASY" | "MODERATE" | "DIFFICULT" | "MEDIUM" | "HARD" | string;
  is_easiest?: boolean;
  is_most_difficult?: boolean;
  option_distribution?: OptionDistributionItem[];
  average_numerical_value?: number;
}

export interface StudentSubmissionSummary {
  attempt_id: string;
  rank: number;
  student_name: string;
  roll_number?: string;
  status?: string; // 'SUBMITTED' | 'IN_PROGRESS'
  score: number;
  total_marks: number;
  percentage: number;
  accuracy?: number;
  correct_count: number;
  incorrect_count: number;
  unattempted_count: number;
  time_taken_seconds: number;
  submitted_at?: string;
  integrity_events_count?: number;
  review_recommended?: boolean;
}

export interface TestAnalyticsResponse {
  test_id: string;
  test_title: string;
  test_code: string;
  subject_name?: string;
  test_status?: string;
  total_participants: number;
  completed_submissions: number;
  in_progress_count?: number;
  not_started_count?: number;
  expired_count?: number;
  total_questions?: number;
  total_marks?: number;
  duration_minutes?: number;
  average_score: number;
  highest_score: number;
  lowest_score: number;
  median_score: number;
  average_percentage: number;
  average_accuracy?: number;
  completion_rate: number;
  submission_rate?: number;
  average_time_seconds: number;
  score_distribution: ScoreDistributionBucket[];
  question_performance: QuestionPerformanceItem[];
  easiest_questions: QuestionPerformanceItem[];
  most_difficult_questions: QuestionPerformanceItem[];
  student_submissions: StudentSubmissionSummary[];
}

export interface StudentAnswerDetail {
  question_id: string;
  order_index: number;
  question_content: string;
  question_type: string;
  student_answer: string;
  correct_answer: string;
  is_correct: boolean;
  status?: string;
  marks_awarded: number;
  max_marks?: number;
  explanation?: string;
}

export interface AttemptIntegrityEventItem {
  id: string;
  attempt_id: string;
  event_type: string;
  timestamp: string;
  client_timestamp?: string | null;
  duration_seconds?: number | null;
  metadata_json?: string | null;
  session_id?: string | null;
}

export interface AttemptIntegritySummary {
  attempt_id: string;
  total_events: number;
  fullscreen_exits: number;
  tab_switches: number;
  multiple_tab_detections: number;
  inactivity_warnings: number;
  network_interruptions: number;
  refresh_count: number;
  total_inactive_seconds: number;
  review_recommended: boolean;
  review_reasons: string[];
  events: AttemptIntegrityEventItem[];
}

export interface RecordIntegrityEventsRequest {
  events: Array<{
    event_type: string;
    client_timestamp?: string;
    duration_seconds?: number;
    metadata_json?: string;
    session_id?: string;
  }>;
}

export interface StudentSubmissionDetail {
  attempt_id: string;
  test_id: string;
  test_title: string;
  subject_name?: string;
  student_name: string;
  roll_number?: string;
  score: number;
  total_marks: number;
  percentage: number;
  accuracy?: number;
  correct_count?: number;
  incorrect_count?: number;
  unattempted_count?: number;
  time_taken_seconds: number;
  submitted_at?: string;
  answers: StudentAnswerDetail[];
  integrity_summary?: AttemptIntegritySummary;
}

export interface AccessCodeVerifyResponse {
  test_id: string;
  title: string;
  code: string;
  description?: string;
  subject_name?: string;
  duration_minutes: number;
  total_marks: number;
  total_questions: number;
  instructions?: string;
  allow_resume: boolean;
  result_visibility: string;
  status?: string;
  start_time?: string | null;
  end_time?: string | null;
  server_time?: string | null;
  server_now?: string | null;
  is_lobby_open?: boolean;
  starts_in_seconds?: number;
  can_start?: boolean;
  has_active_attempt?: boolean;
  active_attempt_id?: string;
  active_session_id?: string;
}

export interface AttemptQuestionOptionItem {
  id: string;
  option_order: number;
  content: string;
}

export interface AttemptQuestionItem {
  id: string;
  question_type: "MCQ" | "NUMERICAL" | string;
  content: string;
  marks: number;
  negative_marks: number;
  order_index: number;
  options: AttemptQuestionOptionItem[];
  media?: MediaItem[];
}

export interface AttemptAnswerItem {
  question_id: string;
  selected_option_id?: string | null;
  selected_option_ids?: string | null;
  numerical_answer?: number | null;
  text_answer?: string | null;
  is_marked_for_review: boolean;
  is_visited: boolean;
  time_spent_seconds?: number;
}

export interface AttemptSessionStateResponse {
  attempt_id: string;
  session_id: string;
  test_id?: string;
  test_title?: string;
  duration_minutes?: number;
  candidate_name?: string;
  candidate_email?: string | null;
  candidate_phone?: string | null;
  roll_number?: string | null;
  remaining_seconds?: number;
  time_remaining_seconds?: number;
  expires_at: string;
  expired_at?: string | null;
  server_now?: string;
  server_time?: string;
  status: string;
  current_question_index: number;
  instructions?: string;
  result_visibility?: string;
  is_paused?: boolean;
  submission_reason?: string | null;
  test?: AccessCodeVerifyResponse;
  questions: AttemptQuestionItem[];
  answers: Record<string, AttemptAnswerItem>;
  marked_for_review?: string[];
}

export interface AttemptSaveAnswerRequest {
  session_id: string;
  question_id: string;
  selected_option_id?: string | null;
  selected_option_ids?: string | null;
  numerical_answer?: number | null;
  text_answer?: string | null;
  is_marked_for_review?: boolean;
  is_visited?: boolean;
  time_spent_seconds?: number;
  current_question_index?: number;
  client_timestamp?: string;
  version?: number;
}

export interface AttemptSaveAnswerResponse {
  saved?: boolean;
  status?: string;
  server_time?: string;
  server_now?: string;
  remaining_seconds?: number;
  time_remaining_seconds?: number;
  is_expired?: boolean;
  is_paused?: boolean;
  is_marked_for_review?: boolean;
}

export interface AttemptHeartbeatRequest {
  session_id: string;
  current_question_index: number;
  time_spent_delta_seconds?: number;
}

export interface AttemptHeartbeatResponse {
  valid?: boolean;
  status: string;
  remaining_seconds?: number;
  time_remaining_seconds?: number;
  server_now?: string;
  server_time?: string;
  is_expired: boolean;
  is_paused?: boolean;
  submission_reason?: string | null;
  is_active?: boolean;
}

export interface AttemptSubmitRequest {
  session_id: string;
  final_answers?: AttemptSaveAnswerRequest[];
  forced_by_expiry?: boolean;
}

export interface AttemptOptionResultItem {
  id: string;
  option_order: number;
  content: string;
  is_correct?: boolean | null;
  is_selected: boolean;
}

export interface AttemptResultItem {
  question_id: string;
  order_index: number;
  question_content: string;
  question_type: string;
  options?: AttemptOptionResultItem[];
  candidate_answer: string;
  correct_answer?: string | null;
  is_correct?: boolean | null;
  marks_awarded: number;
  max_marks?: number;
  negative_marks?: number;
  explanation?: string | null;
}

export interface AttemptResultResponse {
  attempt_id: string;
  test_title: string;
  candidate_name: string;
  student_name?: string;
  roll_number?: string | null;
  total_questions?: number;
  answered_count?: number;
  unanswered_count?: number;
  score?: number | null;
  total_marks?: number | null;
  percentage?: number | null;
  accuracy?: number | null;
  correct_count?: number | null;
  incorrect_count?: number | null;
  unattempted_count?: number | null;
  time_taken_seconds?: number | null;
  status: string;
  is_auto_expired?: boolean;
  submission_reason?: string | null;
  submitted_at?: string | null;
  expired_at?: string | null;
  result_visibility: string;
  show_results?: boolean;
  show_answers?: boolean;
  show_explanation?: boolean;
  answers?: AttemptResultItem[];
  message?: string;
}

export interface TestListResponse {
  items: Test[];
  total: number;
  page: number;
  page_size: number;
}

export interface TestSummaryInSeries {
  id: string;
  title: string;
  code: string;
  duration_minutes: number;
  status: string;
  series_order?: number;
  subject_name?: string;
  total_marks?: number;
  question_count: number;
  created_at: string;
}

export interface TestSeries {
  id: string;
  name: string;
  code: string;
  description?: string;
  thumbnail_url?: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  created_by: string;
  created_at: string;
  updated_at: string;
  test_count: number;
  published_test_count: number;
  total_attempts: number;
  tests: TestSummaryInSeries[];
}

export interface TestSeriesListResponse {
  items: TestSeries[];
  total: number;
  page: number;
  page_size: number;
}

export interface RecentTestItem {
  id: string;
  title: string;
  code: string;
  series_name?: string;
  status: string;
  question_count: number;
  attempts_count: number;
  created_at: string;
}

export interface RecentActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
}

export interface DashboardStats {
  total_tests: number;
  published_tests: number;
  draft_tests: number;
  closed_tests: number;
  total_attempts: number;
  total_questions: number;
  total_series: number;
  live_tests?: number;
  scheduled_tests?: number;
  completed_tests?: number;
  total_candidates?: number;
  total_submissions?: number;
  needs_attention?: number;
  recent_tests: RecentTestItem[];
  recent_activity: RecentActivityItem[];
}

export class ApiError extends Error {
  status: number;
  code?: string;
  detail: string;
  isNetworkError: boolean;
  isTimeout: boolean;
  isAuthError: boolean;
  data?: any;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      detail?: string;
      isNetworkError?: boolean;
      isTimeout?: boolean;
      data?: any;
    } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status || 0;
    this.code = options.code;
    this.detail = options.detail || message;
    this.isNetworkError = Boolean(options.isNetworkError);
    this.isTimeout = Boolean(options.isTimeout);
    this.isAuthError = options.status === 401 || options.status === 403;
    this.data = options.data;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  skipDeduplication?: boolean;
  skipCache?: boolean;
  cacheTtlMs?: number;
}

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

const apiGetCache = new Map<string, CacheEntry>();

export function clearApiCache(endpointPrefix?: string) {
  if (!endpointPrefix) {
    apiGetCache.clear();
    return;
  }
  apiGetCache.forEach((_, key) => {
    if (key.startsWith(endpointPrefix)) {
      apiGetCache.delete(key);
    }
  });
}

const inFlightGetRequests = new Map<string, Promise<any>>();
type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function notifyUnauthorized() {
  unauthorizedListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error("Error in onUnauthorized listener", e);
    }
  });
}

const API_BASE =
  typeof window === "undefined"
    ? process.env.INTERNAL_API_URL || "http://127.0.0.1:8000/api/v1"
    : "/api/v1";

function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const isGet = method === "GET";

  // Pre-aborted signal check
  if (options.signal?.aborted) {
    return Promise.reject(
      new ApiError("Request was cancelled", {
        status: 499,
        detail: "Operation cancelled.",
      })
    );
  }

  // Check client-side in-memory cache for fast tab navigation (10s TTL default)
  const shouldCache = isGet && !options.skipCache && !endpoint.startsWith("/health");
  if (shouldCache) {
    const cached = apiGetCache.get(endpoint);
    const ttl = options.cacheTtlMs ?? 10000;
    if (cached && Date.now() - cached.timestamp < ttl) {
      return Promise.resolve(cached.data as T);
    }
  }

  // Request deduplication for simultaneous in-flight GET calls
  if (isGet && !options.skipDeduplication) {
    const existing = inFlightGetRequests.get(endpoint);
    if (existing) {
      return existing as Promise<T>;
    }
  }

  const exec = async (): Promise<T> => {
    const url = `${API_BASE}${endpoint}`;
    const headers = new Headers(options.headers || {});

    if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    const timeoutMs = options.timeoutMs ?? 15000;
    const controller = new AbortController();
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    // Chain external abort signal if provided
    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: "include", // Send session cookies
        signal: controller.signal,
      });

      if (!response.ok) {
        // Health endpoints return structured diagnostic payloads with 503 when degraded/offline
        if (response.status === 503 && endpoint.startsWith("/health")) {
          try {
            const healthJson = await response.json();
            if (healthJson && (healthJson.subsystems || healthJson.status)) {
              return healthJson as T;
            }
          } catch (_) {}
        }

        let errorDetail = `Request failed (${response.status})`;
        let errorCode: string | undefined;
        let errorData: any = undefined;
        try {
          const errJson = await response.json();
          errorData = errJson;
          if (errJson.detail) {
            errorDetail = typeof errJson.detail === "string" ? errJson.detail : JSON.stringify(errJson.detail);
          }
          if (errJson.code) {
            errorCode = errJson.code;
          }
        } catch (_) {}

        if (response.status === 401 && !endpoint.startsWith("/auth/login")) {
          notifyUnauthorized();
        }

        throw new ApiError(errorDetail, {
          status: response.status,
          code: errorCode,
          detail: errorDetail,
          data: errorData,
        });
      }

      if (response.status === 204) {
        return null as T;
      }

      return await response.json();
    } catch (err: any) {
      if (err instanceof ApiError) {
        throw err;
      }

      if (timedOut) {
        throw new ApiError(`Request to ${endpoint} timed out after ${timeoutMs}ms`, {
          status: 408,
          isTimeout: true,
          detail: "Request timed out. Please check your connection and try again.",
        });
      }

      if (err.name === "AbortError" || controller.signal.aborted || options.signal?.aborted) {
        throw new ApiError("Request was cancelled", {
          status: 499,
          detail: "Operation cancelled.",
        });
      }

      throw new ApiError(err?.message || "Network connection error", {
        status: 0,
        isNetworkError: true,
        detail: "Unable to connect to the server. Please check your connection and try again.",
      });
    } finally {
      clearTimeout(timer);
    }
  };

  if (isGet) {
    const promise = exec()
      .then((data) => {
        if (shouldCache) {
          apiGetCache.set(endpoint, {
            data,
            timestamp: Date.now(),
            ttl: options.cacheTtlMs ?? 10000,
          });
        }
        return data;
      })
      .finally(() => {
        inFlightGetRequests.delete(endpoint);
      });

    if (!options.skipDeduplication) {
      inFlightGetRequests.set(endpoint, promise);
    }
    return promise;
  }

  // Any non-GET mutation (POST/PUT/DELETE/PATCH) clears cached reads to ensure immediate freshness
  return exec().then((result) => {
    clearApiCache();
    return result;
  });
}

export const api = {
  // Auth & Faculty User Management
  login: (username_or_email: string, password: string) =>
    request<User>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username_or_email, password }),
      timeoutMs: 30000,
    }),

  logout: () =>
    request<{ message: string }>("/auth/logout", {
      method: "POST",
    }),

  getMe: () => request<User>("/auth/me"),

  changePassword: (data: { current_password: string; new_password: string }) =>
    request<{ message: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getUsers: () => request<User[]>("/auth/users"),

  createUser: (data: {
    username: string;
    email: string;
    display_name: string;
    password: string;
    role?: string;
  }) =>
    request<User>("/auth/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateUser: (
    userId: string,
    data: {
      display_name?: string;
      email?: string;
      role?: string;
      status?: string;
      password?: string;
    }
  ) =>
    request<User>(`/auth/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Dashboard
  getDashboardStats: () => request<DashboardStats>("/dashboard/stats"),

  // Subjects
  getSubjects: (status?: string) => {
    const q = status ? `?status=${status}` : "";
    return request<Subject[]>(`/subjects${q}`);
  },

  createSubject: (data: { name: string; code?: string }) =>
    request<Subject>("/subjects", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteSubject: (id: string, permanent: boolean = true) =>
    request<void>(`/subjects/${id}?permanent=${permanent}`, {
      method: "DELETE",
    }),

  // Topics
  getTopics: (subject_id?: string, status?: string) => {
    const params = new URLSearchParams();
    if (subject_id) params.append("subject_id", subject_id);
    if (status) params.append("status", status);
    const q = params.toString() ? `?${params.toString()}` : "";
    return request<Topic[]>(`/topics${q}`);
  },

  createTopic: (data: { subject_id: string; name: string }) =>
    request<Topic>("/topics", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Questions
  getQuestions: (params: {
    search?: string;
    subject_id?: string;
    topic_id?: string;
    question_type?: string;
    difficulty?: string;
    status?: string;
    page?: number;
    page_size?: number;
  }) => {
    const query = new URLSearchParams();
    if (params.search) query.append("search", params.search);
    if (params.subject_id) query.append("subject_id", params.subject_id);
    if (params.topic_id) query.append("topic_id", params.topic_id);
    if (params.question_type) query.append("question_type", params.question_type);
    if (params.difficulty) query.append("difficulty", params.difficulty);
    if (params.status) query.append("status", params.status);
    if (params.page) query.append("page", String(params.page));
    if (params.page_size) query.append("page_size", String(params.page_size));

    return request<QuestionListResponse>(`/questions?${query.toString()}`);
  },

  getQuestion: (id: string) => request<Question>(`/questions/${id}`),

  createQuestion: (data: any) =>
    request<Question>("/questions", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateQuestion: (id: string, data: any) =>
    request<Question>(`/questions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  archiveQuestion: (id: string) =>
    request<void>(`/questions/${id}`, {
      method: "DELETE",
    }),

  // Media
  uploadMedia: async (file: File, options: { question_id?: string; exam_id?: string } = {}): Promise<MediaItem> => {
    const formData = new FormData();
    formData.append("file", file);
    if (options.question_id) formData.append("question_id", options.question_id);
    if (options.exam_id) formData.append("exam_id", options.exam_id);
    return request<MediaItem>("/media", {
      method: "POST",
      body: formData,
    });
  },

  deleteMedia: (id: string) =>
    request<void>(`/media/${id}`, {
      method: "DELETE",
    }),

  // Tests
  listTests: (
    params: {
      status?: string;
      series_id?: string;
      subject_id?: string;
      search?: string;
      page?: number;
      page_size?: number;
    } = {},
    options: RequestOptions = {}
  ) => {
    const query = new URLSearchParams();
    if (params.status) query.append("status", params.status);
    if (params.series_id) query.append("series_id", params.series_id);
    if (params.subject_id) query.append("subject_id", params.subject_id);
    if (params.search) query.append("search", params.search);
    if (params.page) query.append("page", String(params.page));
    if (params.page_size) query.append("page_size", String(params.page_size));

    return request<TestListResponse>(`/tests?${query.toString()}`, options);
  },

  getTest: (id: string) => request<Test>(`/tests/${id}`),

  createTest: (data: any) =>
    request<Test>("/tests", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateTest: (id: string, data: any) =>
    request<Test>(`/tests/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  archiveTest: (id: string) =>
    request<Test>(`/tests/${id}`, {
      method: "DELETE",
    }),

  deleteTestPermanently: (id: string) =>
    request<void>(`/tests/${id}/permanent`, {
      method: "DELETE",
    }),

  duplicateTest: (id: string) =>
    request<Test>(`/tests/${id}/duplicate`, {
      method: "POST",
    }),

  publishTest: (id: string) =>
    request<Test>(`/tests/${id}/publish`, {
      method: "POST",
    }),

  completeTest: (id: string) =>
    request<Test>(`/tests/${id}/complete`, {
      method: "POST",
    }),

  concludeTest: (id: string) =>
    request<Test>(`/tests/${id}/conclude`, {
      method: "POST",
    }),

  rescheduleTest: (id: string, startTime: string, endTime?: string) =>
    request<Test>(`/tests/${id}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ start_time: startTime, end_time: endTime }),
    }),

  unscheduleTest: (id: string) =>
    request<Test>(`/tests/${id}/unschedule`, {
      method: "POST",
    }),

  pauseTest: (id: string) =>
    request<Test>(`/tests/${id}/pause`, {
      method: "POST",
    }),

  resumeTest: (id: string) =>
    request<Test>(`/tests/${id}/resume`, {
      method: "POST",
    }),

  cancelTest: (id: string, reason?: string) =>
    request<Test>(`/tests/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  restoreTest: (id: string) =>
    request<Test>(`/tests/${id}/restore`, {
      method: "POST",
    }),

  removeQuestionFromTest: (testId: string, questionId: string) =>
    request<Test>(`/tests/${testId}/questions/${questionId}`, {
      method: "DELETE",
    }),

  syncTestQuestions: (id: string, questions: { question_id: string; order_index: number; marks?: number; negative_marks?: number }[]) =>
    request<Test>(`/tests/${id}/questions`, {
      method: "PUT",
      body: JSON.stringify({ questions }),
    }),

  addQuestionInline: (id: string, data: any) =>
    request<Test>(`/tests/${id}/questions/inline`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  batchAddQuestionsInline: (id: string, questions: any[]) =>
    request<Test>(`/tests/${id}/questions/batch`, {
      method: "POST",
      body: JSON.stringify({ questions }),
    }),

  updateQuestionInline: (testId: string, questionId: string, data: any) =>
    request<Test>(`/tests/${testId}/questions/${questionId}/inline`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getTestAuditLogs: (id: string) =>
    request<TestAuditLog[]>(`/tests/${id}/audit-logs`),

  getTestAnalytics: (id: string) =>
    request<TestAnalyticsResponse>(`/tests/${id}/analytics`),

  getStudentSubmissionDetail: (attemptId: string) =>
    request<StudentSubmissionDetail>(`/tests/attempts/${attemptId}/detail`),

  exportCandidatesCsv: async (testId: string, testCode: string = "test") => {
    const response = await fetch(`${API_BASE}/tests/${testId}/results/export/csv`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("Failed to export candidates CSV.");
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${testCode}_candidate_results.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  exportQuestionsCsv: async (testId: string, testCode: string = "test") => {
    const response = await fetch(`${API_BASE}/tests/${testId}/questions/export/csv`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("Failed to export question analysis CSV.");
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${testCode}_question_analysis.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  // Test Series
  listTestSeries: (params: { status?: string; search?: string; page?: number; page_size?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.append("status", params.status);
    if (params.search) query.append("search", params.search);
    if (params.page) query.append("page", String(params.page));
    if (params.page_size) query.append("page_size", String(params.page_size));

    return request<TestSeriesListResponse>(`/test-series?${query.toString()}`);
  },

  getTestSeries: (id: string) => request<TestSeries>(`/test-series/${id}`),

  createTestSeries: (data: { name: string; code?: string; description?: string; thumbnail_url?: string; status?: string }) =>
    request<TestSeries>("/test-series", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateTestSeries: (id: string, data: any) =>
    request<TestSeries>(`/test-series/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  archiveTestSeries: (id: string) =>
    request<TestSeries>(`/test-series/${id}`, {
      method: "DELETE",
    }),

  addTestToSeries: (seriesId: string, testId: string) =>
    request<TestSeries>(`/test-series/${seriesId}/tests/${testId}`, {
      method: "POST",
    }),

  removeTestFromSeries: (seriesId: string, testId: string) =>
    request<TestSeries>(`/test-series/${seriesId}/tests/${testId}`, {
      method: "DELETE",
    }),

  reorderSeriesTests: (seriesId: string, testIds: string[]) =>
    request<TestSeries>(`/test-series/${seriesId}/tests/reorder`, {
      method: "PUT",
      body: JSON.stringify({ test_ids: testIds }),
    }),

  // Student CBT Attempts (Phase 4)
  verifyAccessCode: (accessCode: string) =>
    request<AccessCodeVerifyResponse>(`/attempts/verify-access?access_code=${encodeURIComponent(accessCode)}`),

  startAttempt: (data: {
    access_code: string;
    candidate_name: string;
    candidate_email?: string;
    candidate_phone?: string;
    roll_number?: string;
    client_session_id?: string;
  }) =>
    request<AttemptSessionStateResponse>("/attempts/start", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getAttemptState: (attemptId: string, sessionId?: string) => {
    const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
    return request<AttemptSessionStateResponse>(`/attempts/${attemptId}/state${query}`);
  },

  saveAttemptAnswer: (attemptId: string, data: AttemptSaveAnswerRequest) =>
    request<AttemptSaveAnswerResponse>(`/attempts/${attemptId}/answers`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  heartbeatAttempt: (attemptId: string, data: AttemptHeartbeatRequest) =>
    request<AttemptHeartbeatResponse>(`/attempts/${attemptId}/heartbeat`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  submitAttempt: (attemptId: string, data: AttemptSubmitRequest) =>
    request<AttemptResultResponse>(`/attempts/${attemptId}/submit`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getAttemptResult: (attemptId: string, sessionId?: string) => {
    const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
    return request<AttemptResultResponse>(`/attempts/${attemptId}/result${query}`);
  },

  recordIntegrityEvents: (attemptId: string, data: RecordIntegrityEventsRequest) =>
    request<AttemptIntegrityEventItem[]>(`/attempts/${attemptId}/integrity-events`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getAttemptIntegrity: (attemptId: string) =>
    request<AttemptIntegritySummary>(`/attempts/${attemptId}/integrity`),

  // System Health
  getSystemHealth: () => request<SystemHealthResponse>("/health"),
  getDatabaseHealth: () => request<DatabaseHealthResponse>("/health/database"),

  // Universal Audit Center
  listAuditEvents: (params?: AuditFilterParams) => {
    const q = new URLSearchParams();
    if (params) {
      if (params.search) q.append("search", params.search);
      if (params.category) q.append("category", params.category);
      if (params.severity) q.append("severity", params.severity);
      if (params.actor) q.append("actor", params.actor);
      if (params.resource_type) q.append("resource_type", params.resource_type);
      if (params.start_time) q.append("start_time", params.start_time);
      if (params.end_time) q.append("end_time", params.end_time);
      if (params.page) q.append("page", String(params.page));
      if (params.page_size) q.append("page_size", String(params.page_size));
    }
    const query = q.toString() ? `?${q.toString()}` : "";
    return request<AuditEventListResponse>(`/audit${query}`);
  },
  getAuditEvent: (id: string) => request<AuditEvent>(`/audit/${id}`),
};

export interface SubsystemStatus {
  status: "OPERATIONAL" | "DEGRADED" | "OFFLINE" | "UNKNOWN";
  message: string;
  latency_ms?: number | null;
  last_checked_at: string;
}

export interface DatabaseHealthResponse {
  status: "OPERATIONAL" | "DEGRADED" | "OFFLINE" | "UNKNOWN";
  connected: boolean;
  latency_ms: number;
  message: string;
  server_time: string;
}

export interface SystemHealthResponse {
  status: "OPERATIONAL" | "DEGRADED" | "OFFLINE" | "UNKNOWN" | string;
  system_status?: string;
  environment?: string;
  server_time: string;
  uptime_seconds: number;
  uptime_human: string;
  last_successful_check: string;
  last_failed_check?: string | null;
  database: {
    status: "OPERATIONAL" | "DEGRADED" | "OFFLINE" | "UNKNOWN" | string;
    connected: boolean;
    latency_ms: number;
    message: string;
  };
  database_details?: {
    status: string;
    connected: boolean;
    latency_ms: number;
    message: string;
  };
  api: {
    status: "OPERATIONAL" | "DEGRADED" | "OFFLINE" | "UNKNOWN" | string;
    latency_ms: number;
    message: string;
  };
  subsystems: {
    application_server: SubsystemStatus;
    database: SubsystemStatus;
    api: SubsystemStatus;
    frontend: SubsystemStatus;
    authentication: SubsystemStatus;
    exam_service: SubsystemStatus;
    autosave: SubsystemStatus;
    submission_and_evaluation: SubsystemStatus;
    integrity_monitoring: SubsystemStatus;
    file_media_storage: SubsystemStatus;
  };
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  event_type: string;
  category: "ADMIN" | "QUESTIONS" | "CANDIDATES" | "EXAM" | "SECURITY" | "SYSTEM";
  severity: "INFO" | "WARNING" | "CRITICAL";
  actor: string;
  actor_type: string;
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  description: string;
  ip_address?: string | null;
  session_id?: string | null;
  details?: Record<string, any> | null;
}

export interface AuditEventListResponse {
  items: AuditEvent[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface AuditFilterParams {
  search?: string;
  category?: string;
  severity?: string;
  actor?: string;
  resource_type?: string;
  start_time?: string;
  end_time?: string;
  page?: number;
  page_size?: number;
}

