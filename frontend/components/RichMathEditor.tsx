"use client";

import React, {
  useRef,
  useEffect,
  useState,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import {
  cleanUniversalPaste,
  canonicalToHtml,
  htmlToCanonical,
} from "@/lib/universalPasteEngine";
import { Edit2, Trash2, Check, X } from "lucide-react";
import katex from "katex";
import "katex/dist/contrib/mhchem.mjs";

export interface RichMathEditorHandle {
  focus: () => void;
  insertMathSnippet: (snippet: string, isDisplay?: boolean) => void;
  insertCanonicalText: (text: string) => void;
  getCanonical: () => string;
  getElement: () => HTMLDivElement | null;
}

export interface RichMathEditorProps {
  value: string;
  onChange: (canonicalValue: string) => void;
  placeholder?: string;
  inline?: boolean;
  minHeight?: string;
  className?: string;
  style?: React.CSSProperties;
  onEnterPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onImagePaste?: (file: File) => void;
  required?: boolean;
  disabled?: boolean;
  id?: string;
}

interface ActivePopover {
  targetElement: HTMLElement;
  latex: string;
  isDisplay: boolean;
  top: number;
  left: number;
}

export const RichMathEditor = forwardRef<RichMathEditorHandle, RichMathEditorProps>(
  (
    {
      value,
      onChange,
      placeholder = "Type or paste content here...",
      inline = false,
      minHeight,
      className = "",
      style = {},
      onEnterPress,
      onFocus,
      onBlur,
      onImagePaste,
      required,
      disabled = false,
      id,
    },
    ref
  ) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const lastCanonicalRef = useRef<string>(value || "");
    const isInternalUpdateRef = useRef<boolean>(false);
    const savedRangeRef = useRef<Range | null>(null);

    // Click-to-edit popover state
    const [popover, setPopover] = useState<ActivePopover | null>(null);
    const [popoverFormula, setPopoverFormula] = useState<string>("");

    // Save selection range when editor loses focus or cursor moves
    const saveSelection = useCallback(() => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
        savedRangeRef.current = sel.getRangeAt(0).cloneRange();
      }
    }, []);

    // Restore selection range
    const restoreSelection = useCallback(() => {
      const sel = window.getSelection();
      if (sel && savedRangeRef.current && editorRef.current) {
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      }
    }, []);

    // Sync HTML from value when value changed externally
    useEffect(() => {
      if (isInternalUpdateRef.current) {
        isInternalUpdateRef.current = false;
        return;
      }
      if (editorRef.current) {
        const currentCanonical = htmlToCanonical(editorRef.current);
        if (currentCanonical !== value) {
          editorRef.current.innerHTML = canonicalToHtml(value || "");
          lastCanonicalRef.current = value || "";
        }
      }
    }, [value]);

    // Handle input / typing in the contenteditable area
    const handleInput = useCallback(() => {
      if (!editorRef.current) return;
      const canonical = htmlToCanonical(editorRef.current);
      lastCanonicalRef.current = canonical;
      isInternalUpdateRef.current = true;
      onChange(canonical);
      saveSelection();
    }, [onChange, saveSelection]);

    // Insert HTML at cursor or append
    const insertHtmlAtCursor = useCallback(
      (html: string) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        restoreSelection();

        const sel = window.getSelection();
        let range: Range | null = null;

        if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.anchorNode)) {
          range = sel.getRangeAt(0);
        } else {
          range = document.createRange();
          range.selectNodeContents(editorRef.current);
          range.collapse(false);
        }

        if (range) {
          range.deleteContents();
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = html;
          const frag = document.createDocumentFragment();
          let lastNode: Node | null = null;
          while (tempDiv.firstChild) {
            lastNode = frag.appendChild(tempDiv.firstChild);
          }
          range.insertNode(frag);

          // Move cursor after inserted content
          if (lastNode) {
            const nextRange = document.createRange();
            // Place cursor immediately after the inserted node, or in a trailing text node
            const spaceNode = document.createTextNode("\u00A0");
            if (lastNode.nextSibling) {
              lastNode.parentNode?.insertBefore(spaceNode, lastNode.nextSibling);
            } else {
              lastNode.parentNode?.appendChild(spaceNode);
            }
            nextRange.setStartAfter(spaceNode);
            nextRange.collapse(true);
            sel?.removeAllRanges();
            sel?.addRange(nextRange);
            savedRangeRef.current = nextRange;
          }
        }

        handleInput();
      },
      [handleInput, restoreSelection]
    );

    // Expose imperative methods to parent (e.g. quick insert toolbar)
    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          editorRef.current?.focus();
        },
        insertMathSnippet: (snippet: string, isDisplay = false) => {
          // Clean snippet of bounding $ if provided
          let rawLatex = snippet.trim();
          if (rawLatex.startsWith("$$") && rawLatex.endsWith("$$")) {
            rawLatex = rawLatex.slice(2, -2).trim();
            isDisplay = true;
          } else if (rawLatex.startsWith("$") && rawLatex.endsWith("$")) {
            rawLatex = rawLatex.slice(1, -1).trim();
          }

          const wrapped = isDisplay ? `$$${rawLatex}$$` : `$${rawLatex}$`;
          const chipHtml = canonicalToHtml(wrapped);
          insertHtmlAtCursor(chipHtml);
        },
        insertCanonicalText: (text: string) => {
          const html = canonicalToHtml(text);
          insertHtmlAtCursor(html);
        },
        getCanonical: () => {
          return editorRef.current ? htmlToCanonical(editorRef.current) : "";
        },
        getElement: () => editorRef.current,
      }),
      [insertHtmlAtCursor]
    );

    // Intercept Paste events: auto-normalizes ChatGPT, Gemini, MathML, HTML, LaTeX, Unicode
    const handlePaste = useCallback(
      (e: React.ClipboardEvent<HTMLDivElement>) => {
        // Check for image paste
        if (onImagePaste && e.clipboardData?.items) {
          for (let i = 0; i < e.clipboardData.items.length; i++) {
            if (e.clipboardData.items[i].type.indexOf("image") !== -1) {
              const file = e.clipboardData.items[i].getAsFile();
              if (file) {
                e.preventDefault();
                onImagePaste(file);
                return;
              }
            }
          }
        }

        // Prevent default browser paste
        e.preventDefault();

        const plainText = e.clipboardData.getData("text/plain") || "";
        const htmlText = e.clipboardData.getData("text/html") || "";

        if (!plainText && !htmlText) return;

        // Clean & normalize using Universal Paste Engine
        const normalized = cleanUniversalPaste(plainText, htmlText);
        if (!normalized) return;

        // Convert normalized canonical representation into visual HTML chips
        const renderedHtml = canonicalToHtml(normalized);
        insertHtmlAtCursor(renderedHtml);
      },
      [insertHtmlAtCursor, onImagePaste]
    );

    // Keyboard navigation & Enter handling
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Enter") {
          if (inline) {
            e.preventDefault();
            if (onEnterPress) {
              onEnterPress();
            }
            return;
          }
        }
      },
      [inline, onEnterPress]
    );

    // Detect click on a math chip to open formula edit popover
    const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const mathChip = target.closest(".math-node-inline, .math-node-display") as HTMLElement;

      if (mathChip && editorRef.current?.contains(mathChip)) {
        const latex = mathChip.getAttribute("data-latex") || "";
        const isDisplay = mathChip.getAttribute("data-display") === "true";
        const rect = mathChip.getBoundingClientRect();
        const editorRect = editorRef.current.getBoundingClientRect();

        setPopover({
          targetElement: mathChip,
          latex,
          isDisplay,
          top: rect.bottom - editorRect.top + 8,
          left: Math.max(10, Math.min(rect.left - editorRect.left, editorRect.width - 280)),
        });
        setPopoverFormula(latex);
      } else {
        setPopover(null);
      }
    }, []);

    // Save edited formula from popover
    const handleSavePopover = useCallback(() => {
      if (!popover || !editorRef.current) return;
      const newLatex = popoverFormula.trim();
      const chip = popover.targetElement;

      if (!newLatex) {
        // Remove chip if formula was cleared
        chip.remove();
      } else {
        chip.setAttribute("data-latex", newLatex);
        try {
          const rendered = katex.renderToString(newLatex, {
            displayMode: popover.isDisplay,
            throwOnError: false,
            strict: false,
            trust: true,
            output: "htmlAndMathml",
          });
          chip.innerHTML = rendered;
        } catch {
          chip.innerHTML = `<span class="katex-error">${newLatex}</span>`;
        }
      }

      setPopover(null);
      handleInput();
    }, [handleInput, popover, popoverFormula]);

    // Delete chip from popover
    const handleDeletePopover = useCallback(() => {
      if (!popover) return;
      popover.targetElement.remove();
      setPopover(null);
      handleInput();
    }, [handleInput, popover]);

    return (
      <div
        style={{
          position: "relative",
          width: "100%",
        }}
      >
        <div
          id={id}
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={handleInput}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          onFocus={() => {
            saveSelection();
            if (onFocus) onFocus();
          }}
          onBlur={() => {
            saveSelection();
            if (onBlur) onBlur();
          }}
          data-placeholder={placeholder}
          className={`rich-math-editor ${className}`}
          style={{
            minHeight: inline ? "38px" : minHeight || "95px",
            maxHeight: inline ? "140px" : "400px",
            overflowY: "auto",
            padding: inline ? "0.45rem 0.75rem" : "0.75rem 0.9rem",
            fontSize: inline ? "0.9rem" : "0.95rem",
            lineHeight: 1.55,
            background: "var(--bg-input)",
            color: "var(--text-main)",
            border: "1px solid var(--border-color)",
            borderRadius: "8px",
            outline: "none",
            cursor: disabled ? "not-allowed" : "text",
            whiteSpace: inline ? "normal" : "pre-wrap",
            wordBreak: "break-word",
            ...style,
          }}
        />

        {/* Click-to-Edit Formula Popover */}
        {popover && (
          <div
            style={{
              position: "absolute",
              top: `${popover.top}px`,
              left: `${popover.left}px`,
              zIndex: 999,
              background: "var(--bg-surface)",
              border: "1px solid var(--primary-500)",
              borderRadius: "8px",
              padding: "0.55rem 0.65rem",
              boxShadow: "var(--shadow-lg), 0 0 0 1px rgba(124, 58, 237, 0.25)",
              display: "flex",
              flexDirection: "column",
              gap: "0.4rem",
              width: "280px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--primary-600)", fontWeight: 700, textTransform: "uppercase" }}>
                Edit Formula ({popover.isDisplay ? "Display" : "Inline"})
              </span>
              <button
                type="button"
                onClick={() => setPopover(null)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0 }}
              >
                <X size={14} />
              </button>
            </div>

            <input
              type="text"
              value={popoverFormula}
              onChange={(e) => setPopoverFormula(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSavePopover();
                } else if (e.key === "Escape") {
                  setPopover(null);
                }
              }}
              autoFocus
              className="input"
              style={{
                fontSize: "0.82rem",
                padding: "0.3rem 0.5rem",
                background: "var(--bg-input)",
                borderColor: "var(--border-color)",
                color: "var(--text-main)",
                fontFamily: "monospace",
              }}
              placeholder="e.g. 5.93 \times 10^{-2}"
            />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.2rem" }}>
              <button
                type="button"
                onClick={handleDeletePopover}
                className="btn btn-secondary btn-sm"
                style={{
                  color: "#f87171",
                  fontSize: "0.72rem",
                  padding: "0.2rem 0.5rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                }}
              >
                <Trash2 size={12} />
                <span>Remove</span>
              </button>

              <div style={{ display: "flex", gap: "0.3rem" }}>
                <button
                  type="button"
                  onClick={() => setPopover(null)}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePopover}
                  className="btn btn-primary btn-sm"
                  style={{
                    fontSize: "0.72rem",
                    padding: "0.2rem 0.6rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                  }}
                >
                  <Check size={12} />
                  <span>Update</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

RichMathEditor.displayName = "RichMathEditor";
