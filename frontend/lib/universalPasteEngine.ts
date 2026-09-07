/**
 * Universal Math, Physics & Chemistry Paste and Normalization Engine
 * 
 * 100% Free, Self-Hosted, Client-Side Parser.
 * Seamlessly normalizes pasted content from:
 * - ChatGPT, Gemini, MS Word, Google Docs, PDFs, and web pages
 * - Normal English text & prose (preserves dates like 2026/09/07, slashes like and/or)
 * - Mathematical equations, fractions (2/3, ½), roots (√(x²+y²)), powers, subscripts, calculus
 * - Physics equations (F = ma, v = u + at, E = mc²), units, scientific notation (1.6 × 10⁻¹⁹ C)
 * - Chemistry formulas (H₂O, CO₂), ions & charges (SO₄²⁻, Na⁺), reactions (2H₂ + O₂ → 2H₂O) via KaTeX \ce{}
 * - Strict XSS sanitization preventing malicious HTML payloads
 */

// 1. Unicode mappings
export const SUPERSCRIPT_MAP: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "-", "⁼": "=", "⁽": "(", "⁾": ")",
  "ⁿ": "n", "ⁱ": "i", "ˣ": "x", "ʸ": "y",
};

export const SUBSCRIPT_MAP: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
  "₊": "+", "₋": "-", "₌": "=", "₍": "(", "₎": ")",
  "ₐ": "a", "ₑ": "e", "ₒ": "o", "ₓ": "x",
};

export const FRACTION_MAP: Record<string, string> = {
  "½": "\\frac{1}{2}",
  "⅓": "\\frac{1}{3}",
  "⅔": "\\frac{2}{3}",
  "¼": "\\frac{1}{4}",
  "¾": "\\frac{3}{4}",
  "⅕": "\\frac{1}{5}",
  "⅖": "\\frac{2}{5}",
  "⅗": "\\frac{3}{5}",
  "⅘": "\\frac{4}{5}",
  "⅙": "\\frac{1}{6}",
  "⅚": "\\frac{5}{6}",
  "⅛": "\\frac{1}{8}",
  "⅜": "\\frac{3}{8}",
  "⅝": "\\frac{5}{8}",
  "⅞": "\\frac{7}{8}",
};

export const MATH_SYMBOLS_MAP: Record<string, string> = {
  "×": "\\times",
  "÷": "\\div",
  "≤": "\\le",
  "≥": "\\ge",
  "≠": "\\ne",
  "±": "\\pm",
  "∓": "\\mp",
  "∑": "\\sum",
  "∏": "\\prod",
  "∫": "\\int",
  "∬": "\\iint",
  "∭": "\\iiint",
  "∮": "\\oint",
  "√": "\\sqrt",
  "∞": "\\infty",
  "∂": "\\partial",
  "∇": "\\nabla",
  "≈": "\\approx",
  "≡": "\\equiv",
  "∝": "\\propto",
  "∈": "\\in",
  "∉": "\\notin",
  "⊂": "\\subset",
  "⊆": "\\subseteq",
  "∪": "\\cup",
  "∩": "\\cap",
  "→": "\\to",
  "←": "\\leftarrow",
  "⇒": "\\Rightarrow",
  "⇔": "\\Leftrightarrow",
  "°": "^\\circ",
  "∠": "\\angle",
  "⊥": "\\perp",
  "⋅": "\\cdot",
  "ħ": "\\hbar",
};

export const GREEK_MAP: Record<string, string> = {
  "α": "\\alpha", "β": "\\beta", "γ": "\\gamma", "δ": "\\delta",
  "ε": "\\epsilon", "ζ": "\\zeta", "η": "\\eta", "θ": "\\theta",
  "ι": "\\iota", "κ": "\\kappa", "λ": "\\lambda", "μ": "\\mu",
  "ν": "\\nu", "ξ": "\\xi", "π": "\\pi", "ρ": "\\rho",
  "σ": "\\sigma", "τ": "\\tau", "υ": "\\upsilon", "φ": "\\phi",
  "χ": "\\chi", "ψ": "\\psi", "ω": "\\omega",
  "Γ": "\\Gamma", "Δ": "\\Delta", "Θ": "\\Theta", "Λ": "\\Lambda",
  "Ξ": "\\Xi", "Π": "\\Pi", "Σ": "\\Sigma", "Υ": "\\Upsilon",
  "Φ": "\\Phi", "Ψ": "\\Psi", "Ω": "\\Omega",
};

const COMMON_ELEMENTS = [
  "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne",
  "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
  "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn",
  "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr",
  "Ag", "Cd", "Sn", "Sb", "I", "Xe", "Cs", "Ba", "Pt", "Au",
  "Hg", "Pb", "Bi", "U"
];

/**
 * 2. Sanitize Pasted HTML (Strict Security / Zero XSS)
 * Strips script tags, iframe, object, embed, inline event handlers (onload, onerror, onclick), and styles.
 */
export function sanitizePastedHTML(html: string): string {
  if (!html) return "";

  // Strip dangerous tags completely along with their inner contents
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  clean = clean.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");
  clean = clean.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "");
  clean = clean.replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, "");

  // Strip event handlers (e.g. onerror="...", onclick="...", etc.) and javascript: links
  clean = clean.replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "");
  clean = clean.replace(/\son\w+\s*=\s*[^>\s]+/gi, "");
  clean = clean.replace(/href\s*=\s*(['"])javascript:.*?\1/gi, 'href="#"');

  return clean;
}

/**
 * 3. Extract Math & Structure from Rich HTML (ChatGPT, Gemini, Word, Google Docs, Web)
 */
export function extractMathFromHTML(html: string): string {
  if (!html) return "";

  const sanitized = sanitizePastedHTML(html);

  // In browser environment with DOMParser available
  if (typeof DOMParser !== "undefined") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(sanitized, "text/html");

      // A. MathML elements: extract TeX annotation or fallback text
      const mathElements = doc.querySelectorAll("math");
      mathElements.forEach((mathEl) => {
        const annotation = mathEl.querySelector('annotation[encoding*="tex"], annotation[encoding*="TeX"]');
        if (annotation && annotation.textContent?.trim()) {
          const tex = annotation.textContent.trim();
          mathEl.parentNode?.replaceChild(doc.createTextNode(` $${tex}$ `), mathEl);
        } else {
          // Convert msup, msub inside mathEl if present
          mathEl.querySelectorAll("msup").forEach((msup) => {
            const children = Array.from(msup.children);
            if (children.length >= 2) {
              const base = children[0].textContent?.trim() || "";
              const exp = children[1].textContent?.trim() || "";
              msup.parentNode?.replaceChild(doc.createTextNode(`${base}^{${exp}}`), msup);
            }
          });
          mathEl.querySelectorAll("msub").forEach((msub) => {
            const children = Array.from(msub.children);
            if (children.length >= 2) {
              const base = children[0].textContent?.trim() || "";
              const sub = children[1].textContent?.trim() || "";
              msub.parentNode?.replaceChild(doc.createTextNode(`${base}_{${sub}}`), msub);
            }
          });
          mathEl.querySelectorAll("mfrac").forEach((mfrac) => {
            const children = Array.from(mfrac.children);
            if (children.length >= 2) {
              const num = children[0].textContent?.trim() || "";
              const den = children[1].textContent?.trim() || "";
              mfrac.parentNode?.replaceChild(doc.createTextNode(`\\frac{${num}}{${den}}`), mfrac);
            }
          });
          const fallbackTex = mathEl.textContent?.trim() || "";
          mathEl.parentNode?.replaceChild(doc.createTextNode(` $${fallbackTex}$ `), mathEl);
        }
      });

      // B. ChatGPT / KaTeX elements: <span class="katex"> or elements with data-tex
      const katexElements = doc.querySelectorAll(".katex, .katex-display, [data-tex]");
      katexElements.forEach((el) => {
        const dataTex = el.getAttribute("data-tex");
        const annotation = el.querySelector(".katex-mathml annotation");
        const tex = dataTex || annotation?.textContent?.trim();
        if (tex) {
          const isDisplay = el.classList.contains("katex-display") || el.tagName.toLowerCase() === "div";
          el.parentNode?.replaceChild(doc.createTextNode(isDisplay ? ` $$${tex}$$ ` : ` $${tex}$ `), el);
        }
      });

      // C. Google Docs / Word <sup> and <sub> tags
      doc.querySelectorAll("sup").forEach((sup) => {
        const content = sup.textContent?.trim() || "";
        sup.parentNode?.replaceChild(doc.createTextNode(`^{${content}}`), sup);
      });

      doc.querySelectorAll("sub").forEach((sub) => {
        const content = sub.textContent?.trim() || "";
        sub.parentNode?.replaceChild(doc.createTextNode(`_{${content}}`), sub);
      });

      // D. Preserve line breaks and paragraph structure
      doc.querySelectorAll("br").forEach((br) => {
        br.parentNode?.replaceChild(doc.createTextNode("\n"), br);
      });

      doc.querySelectorAll("p, div, li").forEach((p) => {
        p.appendChild(doc.createTextNode("\n"));
      });

      return doc.body.textContent || "";
    } catch {
      // Fall through to regex parser
    }
  }

  // Regex fallback for non-DOM / test environments
  let text = sanitized;
  text = text.replace(/<annotation[^>]*encoding=["'][^"']*tex[^"']*["'][^>]*>([\s\S]*?)<\/annotation>/gi, (_, tex) => ` $${tex.trim()}$ `);
  text = text.replace(/<mfrac>\s*<m[ion]>(.*?)<\/m[ion]>\s*<m[ion]>(.*?)<\/m[ion]>\s*<\/mfrac>/gi, (_, n, d) => `\\frac{${n}}{${d}}`);
  text = text.replace(/<msup>\s*<m[ion]>(.*?)<\/m[ion]>\s*<m[ion]>(.*?)<\/m[ion]>\s*<\/msup>/gi, (_, b, e) => `${b}^{${e}}`);
  text = text.replace(/<msub>\s*<m[ion]>(.*?)<\/m[ion]>\s*<m[ion]>(.*?)<\/m[ion]>\s*<\/msub>/gi, (_, b, s) => `${b}_{${s}}`);
  text = text.replace(/<math[\s\S]*?<\/math>/gi, (match) => {
    const annotMatch = match.match(/<annotation[^>]*>([\s\S]*?)<\/annotation>/i);
    return annotMatch ? ` $${annotMatch[1].trim()}$ ` : ` $${match.replace(/<[^>]+>/g, "").trim()}$ `;
  });
  text = text.replace(/<sup>([\s\S]*?)<\/sup>/gi, (_, exp) => `^{${exp.trim()}}`);
  text = text.replace(/<sub>([\s\S]*?)<\/sub>/gi, (_, sub) => `_{${sub.trim()}}`);
  text = text.replace(/<(?:br|p|div|li)[^>]*>/gi, "\n");
  text = text.replace(/<[^>]+>/g, ""); // Strip any remaining tags

  return text;
}

/**
 * Placeholder store for protecting recognized mathematical & scientific blocks.
 */
class PlaceholderVault {
  private vault: string[] = [];

  store(content: string): string {
    const id = `___PROTECTED_SEGMENT_${this.vault.length}___`;
    this.vault.push(content);
    return id;
  }

  restore(text: string): string {
    let res = text;
    for (let i = 0; i < this.vault.length; i++) {
      res = res.replace(`___PROTECTED_SEGMENT_${i}___`, () => this.vault[i]);
    }
    return res;
  }
}

/**
 * Converts Unicode subscripts in a string to plain ASCII numbers.
 */
function toAsciiSubscripts(str: string): string {
  let res = str;
  for (const [subChar, num] of Object.entries(SUBSCRIPT_MAP)) {
    res = res.split(subChar).join(num);
  }
  return res;
}

/**
 * Converts Unicode superscripts in a string to plain ASCII chars.
 */
function toAsciiSuperscripts(str: string): string {
  let res = str;
  for (const [supChar, char] of Object.entries(SUPERSCRIPT_MAP)) {
    res = res.split(supChar).join(char);
  }
  return res;
}

import katex from "katex";
import "katex/dist/contrib/mhchem.mjs";

/**
 * Escapes HTML characters for safe innerHTML injection.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Converts a canonical storage string (e.g. from DB or paste normalizer)
 * into contenteditable HTML containing interactive visual KaTeX math chips.
 */
export function canonicalToHtml(canonical: string): string {
  if (!canonical) return "";

  // Split on $$...$$ and $...$
  const regex = /(\$\$[\s\S]+?\$\$|\$[^\$\n]+?\$)/g;
  const parts = canonical.split(regex);

  return parts
    .map((part) => {
      if (!part) return "";

      const isDisplay = part.startsWith("$$") && part.endsWith("$$") && part.length >= 4;
      const isInline = part.startsWith("$") && part.endsWith("$") && part.length >= 2;

      if (isDisplay || isInline) {
        const rawLatex = isDisplay ? part.slice(2, -2).trim() : part.slice(1, -1).trim();
        let rendered = "";
        try {
          rendered = katex.renderToString(rawLatex, {
            displayMode: isDisplay,
            throwOnError: false,
            strict: false,
            trust: true,
            output: "htmlAndMathml",
          });
        } catch {
          rendered = `<span class="katex-error">${escapeHtml(rawLatex)}</span>`;
        }

        const safeLatexAttr = escapeHtml(rawLatex);
        if (isDisplay) {
          return `<div class="math-node-display" contenteditable="false" data-latex="${safeLatexAttr}" data-display="true" title="Display Formula (Click to edit)">${rendered}</div>`;
        } else {
          return `<span class="math-node-inline" contenteditable="false" data-latex="${safeLatexAttr}" data-display="false" title="Formula: $${safeLatexAttr}$ (Click to edit)">${rendered}</span>`;
        }
      }

      // Plain text part: escape HTML and replace newlines with <br>
      return escapeHtml(part).replace(/\n/g, "<br>");
    })
    .join("");
}

/**
 * Serializes the contenteditable DOM tree back to canonical markdown/math format
 * for database storage and test saving.
 */
export function htmlToCanonical(root: HTMLElement): string {
  if (!root) return "";

  function walk(node: Node): string {
    if (node.nodeType === 3 /* Node.TEXT_NODE */) {
      return node.nodeValue || "";
    }

    if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
      const el = node as HTMLElement;
      const tagName = el.tagName.toLowerCase();

      // Check if this is a math node chip
      if (el.hasAttribute("data-latex")) {
        const latex = el.getAttribute("data-latex") || "";
        const isDisplay = el.getAttribute("data-display") === "true";
        return isDisplay ? `\n$$${latex}$$\n` : `$${latex}$`;
      }

      if (tagName === "br") {
        return "\n";
      }

      if (tagName === "img") {
        const alt = el.getAttribute("alt") || "Diagram";
        const src = el.getAttribute("src") || "";
        return `\n![${alt}](${src})\n`;
      }

      let childText = "";
      for (let i = 0; i < el.childNodes.length; i++) {
        childText += walk(el.childNodes[i]);
      }

      if (tagName === "div" || tagName === "p") {
        return childText ? `\n${childText}` : "\n";
      }

      return childText;
    }

    return "";
  }

  let result = walk(root);
  result = result.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return result.trim();
}

/**
 * 4. Master Universal Paste Pipeline:
 * Cleans, sanitizes, extracts, normalizes and formats any pasted clipboard data.
 */
export function cleanUniversalPaste(textInput: string, htmlInput?: string): string {
  if (!textInput && !htmlInput) return "";

  // Step 1: If rich HTML is present (ChatGPT, Gemini, Word, Google Docs), extract math & structure
  let workingText = textInput || "";
  if (htmlInput && htmlInput.trim().length > 0) {
    const extracted = extractMathFromHTML(htmlInput);
    if (extracted && extracted.trim().length > 0) {
      workingText = extracted;
    }
  }

  const vault = new PlaceholderVault();

  // Step 0A: Fragmented AI/Web copy: 5.93$\times$10-2 or 5.93$\times$10^{-2} or 5.93$\times$10⁻²
  // Must run BEFORE general $...$ protection to prevent isolating $\times$
  workingText = workingText.replace(
    /(?<![0-9a-zA-Z$])([0-9]+\.?[0-9]*)\s*\$\s*\\times\s*\$\s*10(?:\^\{?([0-9+\-]+)\}?|([+\-][0-9]+)|([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+)|(?:\^([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+)))/gi,
    (_, base, e1, e2, e3, e4) => {
      const rawExp = e1 || e2 || e3 || e4 || "";
      const exp = toAsciiSuperscripts(rawExp);
      return vault.store(`$${base} \\times 10^{${exp}}$`);
    }
  );

  // Step 0B: Bare LaTeX scientific notation: 5.93 \times 10^{-2} or 5.93 \times 10-2 or 5.93 \times 10⁻²
  workingText = workingText.replace(
    /(?<![0-9a-zA-Z$])([0-9]+\.?[0-9]*)\s*\\times\s*10(?:\^\{?([0-9+\-]+)\}?|([+\-][0-9]+)|([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+)|(?:\^([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+)))/gi,
    (_, base, e1, e2, e3, e4) => {
      const rawExp = e1 || e2 || e3 || e4 || "";
      const exp = toAsciiSuperscripts(rawExp);
      return vault.store(`$${base} \\times 10^{${exp}}$`);
    }
  );

  // Step 0C: Bare Unicode / symbol scientific notation: 5.93 × 10⁻² or 3.0 * 10^8 or 1.6 x 10^-19
  workingText = workingText.replace(
    /(?<![0-9a-zA-Z$])([0-9]+\.?[0-9]*)\s*(?:×|\*|x)\s*10(?:\^\{?([0-9+\-]+)\}?|([+\-][0-9]+)|([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+)|(?:\^([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+)))(?![0-9a-zA-Z$])/gi,
    (_, base, e1, e2, e3, e4) => {
      const rawExp = e1 || e2 || e3 || e4 || "";
      const exp = toAsciiSuperscripts(rawExp);
      return vault.store(`$${base} \\times 10^{${exp}}$`);
    }
  );

  // Protect already existing $\ce{...}$, $$...$$, $...$, \[...\], \(...\)
  workingText = workingText.replace(/\$\$\\ce\{([^}]+)\}\$\$/g, (m) => vault.store(m));
  workingText = workingText.replace(/\$\\ce\{([^}]+)\}\$/g, (m) => vault.store(m));
  workingText = workingText.replace(/\\\[([\s\S]+?)\\\]/g, (_, f) => vault.store(`$$${f.trim()}$$`));
  workingText = workingText.replace(/\\\(([\s\S]+?)\\\)/g, (_, f) => vault.store(`$${f.trim()}$`));
  workingText = workingText.replace(/\$\$([\s\S]+?)\$\$/g, (m) => vault.store(m));
  workingText = workingText.replace(/\$([^\$\n]+?)\$/g, (m) => vault.store(m));

  // Step 2: Complete Chemical Reaction Equations (e.g. 2H₂ + O₂ → 2H₂O, N2 + 3H2 <=> 2NH3)
  const chemEqArrowRegex = /(?:->|-->|→|⇌|<=>|<->)/;
  const lines = workingText.split("\n");
  const processedLines = lines.map((line) => {
    if (chemEqArrowRegex.test(line)) {
      const hasElements = COMMON_ELEMENTS.some((el) => new RegExp(`\\b${el}[0-9₀-₉]*\\b`).test(line));
      if (hasElements) {
        let chemExpr = line.trim();
        chemExpr = chemExpr.replace(/-->|→/g, "->");
        chemExpr = chemExpr.replace(/⇌|<->/g, "<=>");
        chemExpr = toAsciiSubscripts(chemExpr);
        chemExpr = toAsciiSuperscripts(chemExpr);
        chemExpr = chemExpr.replace(/^\$+|\$+$/g, "").trim();
        return vault.store(`$\\ce{${chemExpr}}$`);
      }
    }
    return line;
  });
  workingText = processedLines.join("\n");

  // Step 3: Chemical Ions with Charges (e.g. SO4^2-, SO₄²⁻, Na+, Na⁺, Ca2+, Fe3+, OH-, NH4+, H+)
  const ionRegex = /(?:^|(?<=[^a-zA-Z0-9]))((?:[A-Z][a-z]?[0-9₀-₉]*)+)([²³⁴⁵⁶⁷⁸⁹⁺⁻\^]+[0-9]*[+\-]?|\^[0-9]*[+\-]|[0-9]+[+\-]|[+\-])(?![a-zA-Z0-9])/g;
  workingText = workingText.replace(ionRegex, (match, formula, charge) => {
    const isElement = COMMON_ELEMENTS.some((el) => formula.startsWith(el));
    if (!isElement) return match;

    let cleanFormula = toAsciiSubscripts(formula);
    let cleanCharge = toAsciiSuperscripts(charge);
    if (!cleanCharge.startsWith("^")) {
      cleanCharge = `^${cleanCharge}`;
    }

    return vault.store(`$\\ce{${cleanFormula}${cleanCharge}}$`);
  });

  // Step 4: Common Chemical Formulas (H₂O, CO₂, H2SO4, CaCO3, KMnO4, etc.)
  const commonChemFormulas = [
    "H₂O", "H2O", "CO₂", "CO2", "O₂", "O2", "H₂", "H2", "N₂", "N2",
    "CH₄", "CH4", "NH₃", "NH3", "NaCl", "HCl", "NaOH", "H₂SO₄", "H2SO4",
    "CaCO₃", "CaCO3", "HNO₃", "HNO3", "C₆H₁₂O₆", "C6H12O6", "KMnO₄", "KMnO4"
  ];

  for (const formula of commonChemFormulas) {
    const normalizedForm = toAsciiSubscripts(formula);
    const regex = new RegExp(`(?<![a-zA-Z0-9$])${formula.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-zA-Z0-9$])`, "g");
    workingText = workingText.replace(regex, () => vault.store(`$\\ce{${normalizedForm}}$`));
  }

  // Step 5: Physics Standard Equations & Scientific Notation
  const standardPhysicsEquations: Record<string, string> = {
    "v = u + at": "$v = u + at$",
    "F = ma": "$F = ma$",
    "E = mc²": "$E = mc^2$",
    "E = mc^2": "$E = mc^2$",
    "PV = nRT": "$PV = nRT$",
    "s = ut + 1/2 at²": "$s = ut + \\frac{1}{2}at^2$",
    "s = ut + 1/2 at^2": "$s = ut + \\frac{1}{2}at^2$",
    "v² = u² + 2as": "$v^2 = u^2 + 2as$",
    "v^2 = u^2 + 2as": "$v^2 = u^2 + 2as$",
    "E = hf": "$E = hf$",
    "λ = h/p": "$\\lambda = \\frac{h}{p}$",
    "p = mv": "$p = mv$",
    "W = Fd": "$W = Fd$",
  };

  for (const [plainEq, latexEq] of Object.entries(standardPhysicsEquations)) {
    const regex = new RegExp(`(?<![a-zA-Z0-9$])${plainEq.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-zA-Z0-9$])`, "g");
    workingText = workingText.replace(regex, () => vault.store(latexEq));
  }

  // Scientific notation: e.g. 3.0 × 10^8 or 3.0 * 10^8 or 1.6 × 10⁻¹⁹
  workingText = workingText.replace(/([0-9]+\.?[0-9]*)\s*(?:×|\*|x)\s*10\s*(?:\^|\*\*)?\s*([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+|-?[0-9]+)/gi, (_, base, exp) => {
    const cleanExp = toAsciiSuperscripts(exp);
    return vault.store(`$${base} \\times 10^{${cleanExp}}$`);
  });

  // Step 6: Calculus Integrals with limits: e.g. ∫₀^∞ e⁻ˣ dx, ∫₀∞ e⁻ˣ dx, ∫ x² dx
  workingText = workingText.replace(/∫\s*([₀₁₂₃₄₅₆₇₈₉a-zA-Z0-9]*)\s*[\^]?\s*([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻a-zA-Z0-9∞]*)\s*([^,\n;]+?)\s*d([a-zA-Z])/g, (_: string, lower: string, upper: string, integrand: string, diffVar: string) => {
    let cleanLower = toAsciiSubscripts(lower);
    let cleanUpper = toAsciiSuperscripts(upper);
    if (cleanUpper === "∞" || upper.includes("∞")) {
      cleanUpper = "\\infty";
    }

    let cleanIntegrand = integrand.trim();
    // Handle e⁻ˣ -> e^{-x}
    cleanIntegrand = cleanIntegrand.replace(/([a-zA-Z0-9])([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱˣʸ]+)/g, (_2: string, b: string, s: string) => {
      return `${b}^{-${toAsciiSuperscripts(s).replace(/-/g, "")}}`;
    });

    const limits = cleanLower || cleanUpper ? `_{${cleanLower || ""}}^{${cleanUpper || ""}}` : "";
    return vault.store(`$\\int${limits} ${cleanIntegrand}\\, d${diffVar}$`);
  });

  workingText = workingText.replace(/∫\s*([^,\n;]+?)\s*d([a-zA-Z])/g, (_: string, integrand: string, diffVar: string) => {
    let cleanIntegrand = integrand.trim();
    cleanIntegrand = cleanIntegrand.replace(/([a-zA-Z0-9])([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱˣʸ]+)/g, (_2: string, b: string, s: string) => {
      return `${b}^{${toAsciiSuperscripts(s)}}`;
    });
    return vault.store(`$\\int ${cleanIntegrand}\\, d${diffVar}$`);
  });

  // Step 7: Square Root Expressions: √(x² + y²), √x, √(a + b)
  workingText = workingText.replace(/√\(([^)]+)\)/g, (_: string, inside: string) => {
    let cleanInside = inside;
    cleanInside = cleanInside.replace(/([a-zA-Z0-9_\)\]\}])([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱˣʸ]+)/g, (_2: string, b: string, s: string) => {
      return `${b}^${toAsciiSuperscripts(s)}`;
    });
    return vault.store(`$\\sqrt{${cleanInside}}$`);
  });
  workingText = workingText.replace(/√([a-zA-Z0-9]+)/g, (_: string, inside: string) => vault.store(`$\\sqrt{${inside}}$`));

  // Step 8: Unicode vulgar fractions: ½, ¾
  for (const [fracChar, latexFrac] of Object.entries(FRACTION_MAP)) {
    if (workingText.includes(fracChar)) {
      workingText = workingText.split(fracChar).join(vault.store(`$${latexFrac}$`));
    }
  }

  // Step 9: Standalone Fractions in Mathematical Context (e.g. 2/3, 1/4)
  // Only convert when surrounded by whitespace or operators, avoiding dates (2026/09/07) and words (and/or, http://)
  workingText = workingText.replace(/(^|[\s=+\-*(\[])([0-9]{1,3})\/([0-9]{1,3})([\s=+\-*)\]]|$)/g, (match: string, prefix: string, num: string, den: string, suffix: string) => {
    return `${prefix}${vault.store(`$\\frac{${num}}{${den}}$`)}${suffix}`;
  });

  // Step 10: Algebraic Polynomials with Unicode Superscripts (e.g. x² + 2x + 1 or a² + b² = c²)
  const polyLineRegex = /(?:[0-9]*[a-zA-Z][²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱˣʸ\^0-9]*|[0-9]+)(?:\s*[\+\-\=]\s*(?:[0-9]*[a-zA-Z][²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱˣʸ\^0-9]*|[0-9]+))+/g;
  workingText = workingText.replace(polyLineRegex, (match: string) => {
    // If it contains Unicode superscripts or ^
    if (/[²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱˣʸ\^]/.test(match)) {
      let converted = match.replace(/([a-zA-Z0-9_\)\]\}])([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱˣʸ]+)/g, (_2: string, b: string, s: string) => {
        return `${b}^${toAsciiSuperscripts(s)}`;
      });
      return vault.store(`$${converted.trim()}$`);
    }
    return match;
  });

  // Isolated variables with Unicode superscripts/subscripts: x² -> $x^2$, x₁ -> $x_1$
  workingText = workingText.replace(/([a-zA-Z0-9_\)\]\}])([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱˣʸ]+)/g, (_: string, base: string, supers: string) => {
    const converted = toAsciiSuperscripts(supers);
    const formatted = converted.length === 1 ? `^${converted}` : `^{${converted}}`;
    return vault.store(`$${base}${formatted}$`);
  });

  workingText = workingText.replace(/([a-zA-Z0-9_\)\]\}])([₀₁₂₃₄₅₆₇₈₉₊₋ₐₑₒₓ]+)/g, (_: string, base: string, subs: string) => {
    const converted = toAsciiSubscripts(subs);
    const formatted = converted.length === 1 ? `_${converted}` : `_{${converted}}`;
    return vault.store(`$${base}${formatted}$`);
  });

  // Step 11: Raw Bare LaTeX Commands: \frac{1}{2}mv^2, \alpha, \sqrt{x}, \sum_{i=1}^n x_i
  const bareLatexRegex = /(\\(?:frac|sqrt|int|sum|prod|lim|alpha|beta|gamma|delta|theta|lambda|pi|mu|sigma|omega|Delta|Omega|times|div|pm|ne|le|ge|cdot|ce)(?![a-zA-Z])(?:\{[^{}]*\}|_\{[^{}]*\}|\^\{[^{}]*\}|_[a-zA-Z0-9]|\^[a-zA-Z0-9]|[a-zA-Z0-9_^\-+*/=()]+)*(?:\s+[a-zA-Z]_[0-9a-zA-Z])?)/g;
  workingText = workingText.replace(bareLatexRegex, (match) => {
    const trimmed = match.trim();
    if (!trimmed) return match;
    return vault.store(`$${trimmed}$`);
  });

  // Step 12: Standalone Greek Letters and Mathematical Symbols
  for (const [greek, latex] of Object.entries(GREEK_MAP)) {
    if (workingText.includes(greek)) {
      const regex = new RegExp(`(?<![a-zA-Z0-9$])${greek}(?![a-zA-Z0-9$])`, "g");
      workingText = workingText.replace(regex, () => vault.store(`$${latex}$`));
    }
  }

  for (const [sym, latex] of Object.entries(MATH_SYMBOLS_MAP)) {
    if (workingText.includes(sym)) {
      const regex = new RegExp(sym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      workingText = workingText.replace(regex, () => vault.store(`$${latex}$`));
    }
  }

  // Restore all protected math segments
  workingText = vault.restore(workingText);

  // Clean up isolated empty math delimiters ($ $), but strictly preserve $$...$$ display math
  workingText = workingText.replace(/(?<!\$)\$\s+\$(?!\$)/g, " ").replace(/ +/g, " ");

  return workingText;
}

/**
 * Direct Clipboard Event Handler:
 * Use in React onPaste events on inputs and textareas.
 */
export function handleUniversalPasteEvent(
  e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>,
  currentValue: string,
  setValue: (val: string) => void,
  onFeedback?: (msg: string) => void
): void {
  // Check for pasted images (handled separately by media uploader if needed)
  const items = e.clipboardData?.items;
  if (items) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        return;
      }
    }
  }

  const plainText = e.clipboardData?.getData("text") || "";
  const htmlText = e.clipboardData?.getData("text/html") || "";

  if (!plainText && !htmlText) return;

  const normalized = cleanUniversalPaste(plainText, htmlText);

  if (normalized) {
    e.preventDefault();
    const target = e.currentTarget;
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    const updated = currentValue.substring(0, start) + normalized + currentValue.substring(end);
    setValue(updated);

    if (onFeedback) {
      onFeedback("Pasted scientific content normalized automatically.");
    }
  }
}
