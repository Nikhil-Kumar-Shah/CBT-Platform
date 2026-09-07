/**
 * Math Content Normalization and KaTeX Syntax Validation Engine
 * Powered by the Universal Math, Physics & Chemistry Paste Engine.
 */

import katex from "katex";
import "katex/dist/contrib/mhchem.mjs";
import {
  cleanUniversalPaste,
  SUPERSCRIPT_MAP,
  SUBSCRIPT_MAP,
  FRACTION_MAP,
  MATH_SYMBOLS_MAP as SYMBOL_MAP,
  GREEK_MAP,
} from "./universalPasteEngine.ts";

export {
  SUPERSCRIPT_MAP,
  SUBSCRIPT_MAP,
  FRACTION_MAP,
  SYMBOL_MAP,
  GREEK_MAP,
};

/**
 * Normalizes pasted or typed content into standard KaTeX notation.
 * Preserves normal English paragraphs, whilst identifying and converting:
 * - Unicode math (e.g. x² + y₁ ≤ √z -> $x^2 + y_1 \le \sqrt{z}$)
 * - Chemistry notation (e.g. H₂O -> $\ce{H2O}$, 2H2 + O2 -> 2H2O -> $\ce{2H2 + O2 -> 2H2O}$)
 * - Physics notation (e.g. v = u + at, E = mc²)
 * - Unwrapped LaTeX commands (e.g. \frac{a}{b} -> $\frac{a}{b}$)
 * - LaTeX display markers \[ ... \] -> $$ ... $$, \( ... \) -> $ ... $
 */
export function normalizeMathContent(input: string): string {
  if (!input) return "";
  return cleanUniversalPaste(input);
}

export interface MathValidationIssue {
  rawFormula: string;
  errorMessage: string;
  locationDescription: string;
}

export interface MathValidationResult {
  isValid: boolean;
  issues: MathValidationIssue[];
}

/**
 * Validates all math expressions in the given text using KaTeX.
 * Returns an array of teacher-friendly error messages if any formula is unparseable.
 */
export function validateMathSyntax(text: string, fieldName = "Content"): MathValidationResult {
  if (!text) return { isValid: true, issues: [] };

  const issues: MathValidationIssue[] = [];

  // Protect escaped dollar signs (\$ -> placeholder)
  const ESCAPED_DOLLAR_PLACEHOLDER = "___ESCAPED_DOLLAR___";
  const sanitized = text.replace(/\\\$/g, ESCAPED_DOLLAR_PLACEHOLDER);

  // Match $$...$$, \[...\], $...$, \(...\)
  const regex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^\$\n]+?\$|\\\([\s\S]+?\\\))/g;
  const matches = sanitized.match(regex) || [];

  for (const match of matches) {
    let math = "";
    let isDisplay = false;

    if (match.startsWith("$$") && match.endsWith("$$")) {
      math = match.slice(2, -2);
      isDisplay = true;
    } else if (match.startsWith("\\[") && match.endsWith("\\]")) {
      math = match.slice(2, -2);
      isDisplay = true;
    } else if (match.startsWith("$") && match.endsWith("$")) {
      math = match.slice(1, -1);
    } else if (match.startsWith("\\(") && match.endsWith("\\)")) {
      math = match.slice(2, -2);
    }

    math = math.replace(new RegExp(ESCAPED_DOLLAR_PLACEHOLDER, "g"), "$").trim();

    if (!math) continue;

    try {
      katex.renderToString(math, {
        displayMode: isDisplay,
        throwOnError: true, // Throws to catch syntax errors
        strict: false,
        trust: true,
      });
    } catch (err: any) {
      const msg = err.message || "Invalid mathematical formula syntax";
      // Clean up technical KaTeX prefix for teacher readability
      const friendlyMsg = msg
        .replace(/^KaTeX parse error:\s*/i, "")
        .replace(/Expected 'EOF', got /i, "Unexpected character: ");

      issues.push({
        rawFormula: match,
        errorMessage: friendlyMsg,
        locationDescription: `${fieldName}: "${match.length > 30 ? match.slice(0, 30) + "..." : match}"`,
      });
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}
