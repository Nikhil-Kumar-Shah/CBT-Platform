"use client";

import React, { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import "katex/dist/contrib/mhchem.mjs";
import { normalizeMathContent } from "@/lib/mathNormalizer";

export interface MathRendererProps {
  content?: string;
  text?: string;
  className?: string;
  inline?: boolean;
  showErrors?: boolean; // If true (teacher preview mode), highlights syntax warnings. If false (student view), strips raw artifacts cleanly.
}

/**
 * Safely escapes HTML special characters.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Clean human-readable fallback for broken or unparseable LaTeX commands,
 * ensuring students NEVER see raw LaTeX control codes, escape characters, or parser errors.
 */
function cleanBrokenLatexForStudents(rawMath: string): string {
  let cleaned = rawMath;
  // Handle chemistry \ce{...}
  cleaned = cleaned.replace(/\\ce\{([^{}]*)\}/g, "$1");
  // Replace common commands with plain text equivalents
  cleaned = cleaned.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1 / $2)");
  cleaned = cleaned.replace(/\\sqrt\{([^{}]*)\}/g, "√($1)");
  cleaned = cleaned.replace(/\\text\{([^{}]*)\}/g, "$1");
  cleaned = cleaned.replace(/\\times/g, "×");
  cleaned = cleaned.replace(/\\div/g, "÷");
  cleaned = cleaned.replace(/\\le/g, "≤");
  cleaned = cleaned.replace(/\\ge/g, "≥");
  cleaned = cleaned.replace(/\\ne/g, "≠");
  cleaned = cleaned.replace(/\\pm/g, "±");
  cleaned = cleaned.replace(/\\alpha/g, "α");
  cleaned = cleaned.replace(/\\beta/g, "β");
  cleaned = cleaned.replace(/\\theta/g, "θ");
  cleaned = cleaned.replace(/\\pi/g, "π");
  cleaned = cleaned.replace(/\\int/g, "∫");
  cleaned = cleaned.replace(/\\sum/g, "∑");
  cleaned = cleaned.replace(/\\[a-zA-Z]+/g, ""); // Strip any remaining unparseable backslash commands
  cleaned = cleaned.replace(/[\{\}]/g, ""); // Remove bare curly braces
  return escapeHtml(cleaned.trim());
}

/**
 * Safely renders plain text, detecting and embedding markdown images (![alt](url))
 * as responsive, styled image elements instead of escaping them into raw strings.
 */
function renderPlainTextWithImages(plainText: string, inline: boolean): string {
  const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
  const parts = plainText.split(imgRegex);

  if (parts.length === 1) {
    const escaped = escapeHtml(plainText);
    return inline ? escaped : escaped.replace(/\n/g, "<br />");
  }

  let result = "";
  for (let i = 0; i < parts.length; i += 3) {
    const textSegment = parts[i];
    if (textSegment) {
      const escaped = escapeHtml(textSegment);
      result += inline ? escaped : escaped.replace(/\n/g, "<br />");
    }

    if (i + 2 < parts.length) {
      const altText = parts[i + 1] || "";
      const rawUrl = parts[i + 2] || "";
      const cleanUrl = rawUrl.trim();
      const isSafeUrl =
        cleanUrl.startsWith("http://") ||
        cleanUrl.startsWith("https://") ||
        cleanUrl.startsWith("/api/") ||
        cleanUrl.startsWith("data:image/") ||
        cleanUrl.startsWith("/");

      if (isSafeUrl) {
        const escapedUrl = escapeHtml(cleanUrl);
        const escapedAlt = escapeHtml(altText || "Question Diagram");
        if (inline) {
          result += `<img src="${escapedUrl}" alt="${escapedAlt}" style="max-height: 48px; max-width: 140px; vertical-align: middle; border-radius: 4px; display: inline-block; margin: 0 4px; border: 1px solid var(--border-color);" loading="lazy" />`;
        } else {
          result += `<div class="cbt-diagram-wrapper" style="margin: 0.85rem 0; text-align: center; width: 100%; display: flex; flex-direction: column; align-items: center;"><img src="${escapedUrl}" alt="${escapedAlt}" class="cbt-diagram-img" style="max-width: 100%; max-height: 420px; width: auto; height: auto; object-fit: contain; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-surface-elevated); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.15);" loading="lazy" />${altText && altText.toLowerCase() !== "diagram" && altText.trim().length > 0 ? `<span style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.35rem; display: block;">${escapedAlt}</span>` : ""}</div>`;
        }
      }
    }
  }

  return result;
}

/**
 * Parses and renders LaTeX equations ($inline$, $$display$$, \(inline\), \[display\]) using KaTeX.
 * Automatically normalizes Unicode math and AI-generated formatting.
 * Guaranteed student safety: raw LaTeX and parser errors are never displayed to students.
 */
export const MathRenderer: React.FC<MathRendererProps> = ({
  content,
  text,
  className = "",
  inline = false,
  showErrors = false,
}) => {
  const rawContent = content ?? text ?? "";

  const renderedHtml = useMemo(() => {
    if (!rawContent) return "";

    // 1. First run normalizer to convert Unicode superscripts, fractions, and symbols
    const normalized = normalizeMathContent(rawContent);

    // 2. Protect escaped dollar signs (\$ -> placeholder)
    const ESCAPED_DOLLAR_PLACEHOLDER = "___ESCAPED_DOLLAR___";
    const sanitized = normalized.replace(/\\\$/g, ESCAPED_DOLLAR_PLACEHOLDER);

    // Regex to detect:
    // 1. $$...$$ (display mode)
    // 2. \[...\] (display mode)
    // 3. $...$ (inline mode)
    // 4. \(...\) (inline mode)
    const regex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^\$\n]+?\$|\\\([\s\S]+?\\\))/g;

    const parts = sanitized.split(regex);

    return parts
      .map((part) => {
        if (!part) return "";

        // Display math ($$...$$ or \[...\])
        const isDisplay =
          (part.startsWith("$$") && part.endsWith("$$") && part.length >= 4) ||
          (part.startsWith("\\[") && part.endsWith("\\]") && part.length >= 4);

        if (isDisplay) {
          const math = (
            part.startsWith("$$") ? part.slice(2, -2) : part.slice(2, -2)
          )
            .replace(new RegExp(ESCAPED_DOLLAR_PLACEHOLDER, "g"), "$")
            .trim();

          try {
            return katex.renderToString(math, {
              displayMode: true,
              throwOnError: true,
              strict: false,
              trust: true,
              output: "html",
            });
          } catch (e: any) {
            if (showErrors) {
              return `<span class="katex-error" style="color: #fbbf24; background: rgba(245,158,11,0.15); padding: 2px 6px; border-radius: 4px; font-size: 0.85em;" title="${escapeHtml(e.message || 'Math syntax warning')}">⚠️ ${escapeHtml(math)}</span>`;
            }
            return `<div style="text-align: center; margin: 0.5rem 0; font-family: sans-serif;">${cleanBrokenLatexForStudents(math)}</div>`;
          }
        }

        // Inline math ($...$ or \(...\))
        const isInlineMath =
          (part.startsWith("$") && part.endsWith("$") && part.length >= 2) ||
          (part.startsWith("\\(") && part.endsWith("\\)") && part.length >= 4);

        if (isInlineMath) {
          const math = (
            part.startsWith("$") ? part.slice(1, -1) : part.slice(2, -2)
          )
            .replace(new RegExp(ESCAPED_DOLLAR_PLACEHOLDER, "g"), "$")
            .trim();

          try {
            return katex.renderToString(math, {
              displayMode: false,
              throwOnError: true,
              strict: false,
              trust: true,
              output: "html",
            });
          } catch (e: any) {
            if (showErrors) {
              return `<span class="katex-error" style="color: #fbbf24; background: rgba(245,158,11,0.15); padding: 2px 4px; border-radius: 4px; font-size: 0.85em;" title="${escapeHtml(e.message || 'Math syntax warning')}">⚠️ ${escapeHtml(math)}</span>`;
            }
            return `<span>${cleanBrokenLatexForStudents(math)}</span>`;
          }
        }

        // Normal plain text: restore escaped dollars, parse markdown images and escape text
        const plainText = part.replace(new RegExp(ESCAPED_DOLLAR_PLACEHOLDER, "g"), "$");
        return renderPlainTextWithImages(plainText, inline);
      })
      .join("");
  }, [rawContent, inline, showErrors]);

  if (inline) {
    return (
      <span
        className={`math-content inline ${className}`}
        style={{ overflowWrap: "anywhere", wordBreak: "break-word", maxWidth: "100%" }}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    );
  }

  return (
    <div
      className={`math-content block ${className}`}
      style={{ overflowWrap: "anywhere", wordBreak: "break-word", minWidth: 0, maxWidth: "100%" }}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
};
