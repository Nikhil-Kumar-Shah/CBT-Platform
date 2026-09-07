export interface ExamInvitationData {
  title: string;
  code: string;
  subject_name?: string | null;
  subject_code?: string | null;
  duration_minutes: number;
  total_questions?: number;
  total_marks?: number;
  start_time?: string | null;
  end_time?: string | null;
  instructions?: string | null;
}

export function formatExamInvitation(test: ExamInvitationData, origin?: string): string {
  const baseOrigin = origin || (typeof window !== "undefined" ? window.location.origin : "");
  const examLink = `${baseOrigin}/exam?code=${encodeURIComponent(test.code)}`;

  const subjName = test.subject_name || "General";
  const subjCode = test.subject_code ? test.subject_code : "EXAM01";
  const testTitle = test.title;
  const examCode = test.code;
  const duration = `${test.duration_minutes} minutes`;
  const questions = test.total_questions !== undefined ? `${test.total_questions}` : "As specified";
  const marks = test.total_marks !== undefined ? `${test.total_marks}` : "As specified";

  let scheduleLines = "";
  if (test.start_time) {
    try {
      const d = new Date(test.start_time);
      const dateStr = d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
      const startTimeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      let endTimeStr = "";
      if (test.end_time) {
        endTimeStr = new Date(test.end_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      } else {
        const endD = new Date(d.getTime() + test.duration_minutes * 60000);
        endTimeStr = endD.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      }
      scheduleLines = `Date: ${dateStr}\nTime: ${startTimeStr} - ${endTimeStr}\n`;
    } catch {
      scheduleLines = `Scheduled Start: ${test.start_time}\n`;
    }
  }

  return `Hello,

You are invited to appear for the following examination.

Subject: ${subjName}
Subject Code: ${subjCode}

Examination: ${testTitle}
Examination Code: ${examCode}

${scheduleLines}Duration: ${duration}
Questions: ${questions}
Total Marks: ${marks}

Examination Access Link:
${examLink}

Please use the examination access code provided above and enter your candidate details before starting the examination.

Please ensure that you join before the scheduled start time and follow all examination instructions.

Regards,
Examination Administrator`;
}

export async function copyExamLink(code: string): Promise<boolean> {
  if (!code) return false;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/exam?code=${encodeURIComponent(code)}`;
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

export async function copyExamInvitation(test: ExamInvitationData): Promise<boolean> {
  if (!test || !test.code) return false;
  const text = formatExamInvitation(test);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
