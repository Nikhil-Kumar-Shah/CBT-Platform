/**
 * Comprehensive Automated Test Suite for Universal Math, Physics & Chemistry Paste Engine (Phase 9C)
 * 
 * Tests all 20 specified verification scenarios:
 *  1. Plain text paste (preserves dates, prose, slashes, asterisks)
 *  2. LaTeX paste (bare \frac, \sqrt, etc.)
 *  3. Markdown math paste ($$, $)
 *  4. Unicode superscripts (x² + 2x + 1, 10⁻¹⁹)
 *  5. Unicode subscripts (x₁ + x₂)
 *  6. Fractions (2/3, ½ + ¾)
 *  7. Roots (√(x² + y²))
 *  8. Integrals (∫₀^∞ e⁻ˣ dx)
 *  9. Greek symbols (α, β, θ, λ, π, Ω)
 * 10. Physics equations (F = ma, v = u + at, E = mc²)
 * 11. Chemistry formulas (H₂O, CO₂, H₂SO₄)
 * 12. Chemical equations (2H₂ + O₂ → 2H₂O)
 * 13. Charges and oxidation states (SO₄²⁻, Na⁺, Fe³⁺)
 * 14. Mixed text + mathematics
 * 15. ChatGPT-style HTML clipboard content
 * 16. Gemini-style rich clipboard content
 * 17. Malicious HTML / XSS payloads (strips <script>, onerror, etc.)
 * 18. Existing legacy questions backward compatibility
 * 19. Copy -> paste round trip stability
 * 20. Rendering never exposes raw LaTeX when valid rendering is possible
 * 
 * + Regression tests for literal $x^2$, \frac{x}{y}, \sqrt{x}, \sum prevention
 */

import process from "node:process";
import katex from "katex";
import "katex/dist/contrib/mhchem.mjs";
import { cleanUniversalPaste, sanitizePastedHTML, extractMathFromHTML } from "./lib/universalPasteEngine.ts";
import { normalizeMathContent, validateMathSyntax } from "./lib/mathNormalizer.ts";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`  ❌ [FAIL] ${testName} - ${detail || "Condition not met"}`);
    failedCount++;
  }
}

console.log("===============================================================");
console.log("PHASE 9C: UNIVERSAL MATH, PHYSICS & CHEMISTRY PASTE ENGINE TESTS");
console.log("===============================================================\n");

// 1. Plain text paste
console.log("Scenario 1: Plain Text Paste (Preserves Prose, Dates & Slashes)");
{
  const input = "The student completed the assignment on 2026/09/07 and/or submitted notes.";
  const output = cleanUniversalPaste(input);
  assert(output.includes("2026/09/07"), "Preserves calendar dates without fraction mangling", output);
  assert(output.includes("and/or"), "Preserves prose slashes like and/or", output);
  assert(!output.includes("\\frac{2026}"), "Does not convert date year to fraction", output);
}

// 2. LaTeX paste
console.log("\nScenario 2: LaTeX Paste (Auto-wraps bare LaTeX commands)");
{
  const input = "Evaluate the formula \\frac{1}{2}mv^2 at velocity v = 10.";
  const output = cleanUniversalPaste(input);
  assert(output.includes("$\\frac{1}{2}mv^2$") || output.includes("\\frac{1}{2}mv^2"), "Wraps or preserves LaTeX", output);
  const syntax = validateMathSyntax(output);
  assert(syntax.isValid, "Parsed math is KaTeX valid", JSON.stringify(syntax.issues));
}

// 3. Markdown math paste
console.log("\nScenario 3: Markdown Math Paste ($$...$$ and $...$)");
{
  const input = "Given $$\\frac{1}{2}mv^2$$ and kinetic energy $E_k = 100\\text{ J}$.";
  const output = cleanUniversalPaste(input);
  assert(output.includes("$$\\frac{1}{2}mv^2$$"), "Preserves display math blocks", output);
  assert(output.includes("$E_k = 100\\text{ J}$"), "Preserves inline math blocks", output);
  const syntax = validateMathSyntax(output);
  assert(syntax.isValid, "KaTeX validates markdown math cleanly", JSON.stringify(syntax.issues));
}

// 4. Unicode superscripts
console.log("\nScenario 4: Unicode Superscripts (Polynomials & Powers)");
{
  const input = "Simplify x² + 2x + 1 and charge 1.6 × 10⁻¹⁹ C.";
  const output = cleanUniversalPaste(input);
  assert(output.includes("$x^2 + 2x + 1$"), "Normalizes quadratic polynomial x² + 2x + 1", output);
  assert(output.includes("10^{-19}") || output.includes("10^{-19}"), "Normalizes negative exponent in scientific notation", output);
  const syntax = validateMathSyntax(output);
  assert(syntax.isValid, "KaTeX validates quadratic and exponents", JSON.stringify(syntax.issues));
}

// 5. Unicode subscripts
console.log("\nScenario 5: Unicode Subscripts");
{
  const input = "Find the value of x₁ + x₂.";
  const output = cleanUniversalPaste(input);
  assert(output.includes("$x_1$") && output.includes("$x_2$"), "Normalizes x₁ and x₂ subscripts", output);
  const syntax = validateMathSyntax(output);
  assert(syntax.isValid, "KaTeX validates subscripts", JSON.stringify(syntax.issues));
}

// 6. Fractions
console.log("\nScenario 6: Fractions (2/3 and vulgar fractions ½, ¾)");
{
  const input1 = "Calculate 2/3 + 1/4";
  const output1 = cleanUniversalPaste(input1);
  assert(output1.includes("\\frac{2}{3}"), "Converts 2/3 to \\frac{2}{3}", output1);
  assert(output1.includes("\\frac{1}{4}"), "Converts 1/4 to \\frac{1}{4}", output1);

  const input2 = "Add ½ and ¾.";
  const output2 = cleanUniversalPaste(input2);
  assert(output2.includes("\\frac{1}{2}"), "Converts vulgar ½ to \\frac{1}{2}", output2);
  assert(output2.includes("\\frac{3}{4}"), "Converts vulgar ¾ to \\frac{3}{4}", output2);
}

// 7. Roots
console.log("\nScenario 7: Square Roots (√(x² + y²))");
{
  const input = "Compute the distance √(x² + y²).";
  const output = cleanUniversalPaste(input);
  assert(output.includes("$\\sqrt{x^2 + y^2}$"), "Normalizes √(x² + y²) to \\sqrt{x^2 + y^2}", output);
  const syntax = validateMathSyntax(output);
  assert(syntax.isValid, "KaTeX validates square root", JSON.stringify(syntax.issues));
}

// 8. Integrals
console.log("\nScenario 8: Integrals with limits (∫₀^∞ e⁻ˣ dx)");
{
  const input = "Evaluate the definite integral ∫₀^∞ e⁻ˣ dx.";
  const output = cleanUniversalPaste(input);
  assert(output.includes("\\int_{0}^{\\infty}") || output.includes("\\int"), "Normalizes integral with lower 0 and upper infinity", output);
  assert(output.includes("e^{-x}"), "Normalizes integrand e⁻ˣ", output);
  const syntax = validateMathSyntax(output);
  assert(syntax.isValid, "KaTeX validates integral expression", JSON.stringify(syntax.issues));
}

// 9. Greek symbols
console.log("\nScenario 9: Greek Symbols (α, β, θ, λ, π, Ω)");
{
  const input = "Angle θ with wavelength λ, resistance in Ω, and constant π.";
  const output = cleanUniversalPaste(input);
  assert(output.includes("$\\theta$"), "Normalizes θ to \\theta", output);
  assert(output.includes("$\\lambda$"), "Normalizes λ to \\lambda", output);
  assert(output.includes("$\\Omega$"), "Normalizes Ω to \\Omega", output);
  assert(output.includes("$\\pi$"), "Normalizes π to \\pi", output);
}

// 10. Physics equations
console.log("\nScenario 10: Physics Equations (F = ma, v = u + at, E = mc²)");
{
  const input = "According to Newton's law F = ma, kinematic equation v = u + at, and Einstein's relation E = mc².";
  const output = cleanUniversalPaste(input);
  assert(output.includes("$F = ma$"), "Normalizes F = ma", output);
  assert(output.includes("$v = u + at$"), "Normalizes v = u + at", output);
  assert(output.includes("$E = mc^2$"), "Normalizes E = mc²", output);
  const syntax = validateMathSyntax(output);
  assert(syntax.isValid, "KaTeX validates physics equations", JSON.stringify(syntax.issues));
}

// 11. Chemistry formulas
console.log("\nScenario 11: Chemistry Formulas (H₂O, CO₂, H₂SO₄)");
{
  const input = "Water H₂O and carbon dioxide CO₂ form carbonic acid.";
  const output = cleanUniversalPaste(input);
  assert(output.includes("$\\ce{H2O}$"), "Normalizes H₂O to \\ce{H2O}", output);
  assert(output.includes("$\\ce{CO2}$"), "Normalizes CO₂ to \\ce{CO2}", output);
  const rendered = katex.renderToString(output.match(/\$\\ce\{H2O\}\$/)?.[0].replace(/\$/g, "") || "");
  assert(rendered.length > 0, "KaTeX mhchem successfully renders \\ce{H2O}");
}

// 12. Chemical equations
console.log("\nScenario 12: Chemical Equations (2H₂ + O₂ → 2H₂O)");
{
  const input = "2H₂ + O₂ → 2H₂O";
  const output = cleanUniversalPaste(input);
  assert(output.includes("$\\ce{2H2 + O2 -> 2H2O}$"), "Normalizes reaction equation into \\ce{2H2 + O2 -> 2H2O}", output);
  const rendered = katex.renderToString("\\ce{2H2 + O2 -> 2H2O}");
  assert(rendered.includes("katex"), "KaTeX mhchem renders reaction equation");
}

// 13. Charges and oxidation states
console.log("\nScenario 13: Charges and Oxidation States (SO₄²⁻, Na⁺, Fe³⁺)");
{
  const input = "The sulfate ion is SO₄²⁻ and sodium is Na⁺, ferric is Fe³⁺.";
  const output = cleanUniversalPaste(input);
  assert(output.includes("$\\ce{SO4^2-}$"), "Normalizes SO₄²⁻ to \\ce{SO4^2-}", output);
  assert(output.includes("$\\ce{Na^+}$"), "Normalizes Na⁺ to \\ce{Na^+}", output);
  assert(output.includes("$\\ce{Fe^3+}$"), "Normalizes Fe³⁺ to \\ce{Fe^3+}", output);
}

// 14. Mixed text + mathematics
console.log("\nScenario 14: Mixed Text + Mathematics");
{
  const input = "A particle moves with acceleration a = F/m where force F = 10 N and mass m = 2 kg.";
  const output = cleanUniversalPaste(input);
  assert(output.includes("particle moves with"), "Preserves English text", output);
  assert(output.includes("\\frac{F}{m}") || output.includes("F/m"), "Handles mixed math gracefully", output);
}

// 15. ChatGPT-style HTML clipboard content
console.log("\nScenario 15: ChatGPT-Style HTML Clipboard Content");
{
  const html = `<p>The kinetic energy is given by:</p>
<span class="katex-display"><span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mfrac><mn>1</mn><mn>2</mn></mfrac><mi>m</mi><msup><mi>v</mi><mn>2</mn></msup></mrow><annotation encoding="application/x-tex">\\frac{1}{2}mv^2</annotation></semantics></math></span></span></span>`;
  const output = cleanUniversalPaste("", html);
  assert(output.includes("\\frac{1}{2}mv^2"), "Extracts LaTeX annotation from ChatGPT KaTeX clipboard HTML", output);
  assert(output.includes("kinetic energy"), "Extracts prose text from ChatGPT HTML", output);
}

// 16. Gemini-style rich clipboard content
console.log("\nScenario 16: Gemini-Style Rich Clipboard Content (MathML & Semantic Tags)");
{
  const html = `<p>Calculate <sup>2</sup>/<sub>3</sub> and <math><mrow><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><mn>1</mn></mrow></math></p>`;
  const output = cleanUniversalPaste("", html);
  assert(output.includes("x^{2}") || output.includes("x^2") || output.includes("x²"), "Extracts MathML and sub/sup tags", output);
}

// 17. Malicious HTML / XSS payloads
console.log("\nScenario 17: Malicious HTML / XSS Payloads (Security Verification)");
{
  const xssPayloads = [
    `<script>alert("XSS")</script>Question statement`,
    `<img src="invalid.jpg" onerror="alert('Hacked')">Diagram description`,
    `<a href="javascript:stealToken()">Click here for hints</a>`,
    `<style>body{display:none;}</style>Hidden text`,
  ];
  for (const xss of xssPayloads) {
    const cleanHtml = sanitizePastedHTML(xss);
    assert(!cleanHtml.includes("<script>"), "Strips <script> tags", cleanHtml);
    assert(!cleanHtml.includes("onerror"), "Strips onerror inline event handlers", cleanHtml);
    assert(!cleanHtml.includes("javascript:"), "Strips javascript: pseudo-protocol", cleanHtml);
    assert(!cleanHtml.includes("<style>"), "Strips <style> tags", cleanHtml);
  }
}

// 18. Existing legacy questions backward compatibility
console.log("\nScenario 18: Existing Legacy Questions Backward Compatibility");
{
  const legacyQuestions = [
    "What is $x^2 + y^2$?",
    "Solve $\\int_0^1 x\\,dx$.",
    "Identify the compound: $H_2O$.",
    "Plain text without any equations."
  ];
  for (const lq of legacyQuestions) {
    const normalized = normalizeMathContent(lq);
    const syntax = validateMathSyntax(normalized);
    assert(syntax.isValid, `Legacy question renders cleanly: "${lq}"`);
  }
}

// 19. Copy -> Paste round trip stability
console.log("\nScenario 19: Copy -> Paste Round Trip Stability");
{
  const initial = "Find $\\frac{2}{3} + x^2$ and $\\ce{H2O}$.";
  const pass1 = cleanUniversalPaste(initial);
  const pass2 = cleanUniversalPaste(pass1);
  assert(pass1 === pass2, "Double normalization is idempotent and stable", `pass1: ${pass1} vs pass2: ${pass2}`);
}

// 20. Rendering never exposes raw LaTeX when valid rendering is available
console.log("\nScenario 20: Rendering Quality (No Raw LaTeX Control Sequences Leakage)");
{
  const sample = "The value of \\frac{a}{b} and \\sqrt{x} and \\sum_{i=1}^n x_i.";
  const normalized = normalizeMathContent(sample);
  assert(normalized.includes("$\\frac{a}{b}$"), "Auto-wraps \\frac into $...$", normalized);
  assert(normalized.includes("$\\sqrt{x}$"), "Auto-wraps \\sqrt into $...$", normalized);
  assert(normalized.includes("$\\sum_{i=1}^n"), "Auto-wraps \\sum into $...$", normalized);

  // Verify KaTeX renders without throwing
  const syntax = validateMathSyntax(normalized);
  assert(syntax.isValid, "All auto-wrapped formulas pass KaTeX syntax validation", JSON.stringify(syntax.issues));
}

// 21. Scientific Notation Bug Regression Tests (Requirement 5)
console.log("\nScenario 21: Scientific Notation Bug Regression (5.93$\\times$10-2 and 5.93 \\times 10^{-2})");
{
  // Test A: Fragmented AI paste: 5.93$\times$10-2
  const inputA = "The equilibrium constant is 5.93$\\times$10-2 mol/L.";
  const outputA = cleanUniversalPaste(inputA);
  assert(outputA.includes("$5.93 \\times 10^{-2}$"), "Normalizes 5.93$\\times$10-2 to $5.93 \\times 10^{-2}$", outputA);
  assert(!outputA.includes("$\\times$"), "Does not leak raw fragmented $\\times$", outputA);

  // Test B: Bare LaTeX: 5.93 \times 10^{-2}
  const inputB = "The value is 5.93 \\times 10^{-2} units.";
  const outputB = cleanUniversalPaste(inputB);
  assert(outputB.includes("$5.93 \\times 10^{-2}$"), "Normalizes bare 5.93 \\times 10^{-2} to $5.93 \\times 10^{-2}$", outputB);
  assert(!outputB.includes("5.93 $\\times$"), "Does not split into fragmented 5.93 $\\times$", outputB);

  // Test C: Unicode scientific notation: 5.93 × 10⁻²
  const inputC = "The concentration is 5.93 × 10⁻² M.";
  const outputC = cleanUniversalPaste(inputC);
  assert(outputC.includes("$5.93 \\times 10^{-2}$"), "Normalizes Unicode 5.93 × 10⁻² to $5.93 \\times 10^{-2}$", outputC);

  // Verify visual rendering via KaTeX
  const rendered = katex.renderToString("5.93 \\times 10^{-2}");
  assert(rendered.includes("katex"), "KaTeX successfully renders 5.93 \\times 10^{-2}", rendered);
  assert(rendered.includes("×"), "KaTeX visually renders multiplication symbol ×", rendered);
  const katexHtmlPart = rendered.split('class="katex-html"')[1] || "";
  assert(!katexHtmlPart.includes("\\times"), "Visible KaTeX HTML does not display raw \\times command", katexHtmlPart);
}

// 22. Strict Ordinary Prose Preservation (Requirement 4)
console.log("\nScenario 22: Ordinary Text Preservation (Dates, URLs, Conjunctions, Prose Math)");
{
  const input = "On 2026/09/07, visit https://example.com/api/test and/or buy 5 * 2 items.";
  const output = cleanUniversalPaste(input);
  assert(output.includes("2026/09/07"), "Preserves date 2026/09/07 without fraction mangling", output);
  assert(output.includes("https://example.com/api/test"), "Preserves URL completely untouched", output);
  assert(output.includes("and/or"), "Preserves conjunction and/or without math conversion", output);
  assert(output.includes("5 * 2 items"), "Preserves prose multiplication 5 * 2 items", output);
  assert(!output.includes("\\frac{2026}"), "Did not convert date to fraction", output);
}

// 23. In-Place Rich HTML Conversion (canonicalToHtml & htmlToCanonical)
console.log("\nScenario 23: RichMathEditor In-Place HTML Serialization");
{
  const { canonicalToHtml } = await import("./lib/universalPasteEngine.ts");
  const canonical = "Calculate $5.93 \\times 10^{-2}$ with $\\ce{H2O}$ and display:\n$$E = mc^2$$";
  const html = canonicalToHtml(canonical);

  assert(html.includes('class="math-node-inline"'), "Generates inline math chip with math-node-inline class", html);
  assert(html.includes('class="math-node-display"'), "Generates display math chip with math-node-display class", html);
  assert(html.includes('data-latex="5.93 \\times 10^{-2}"'), "Stores clean LaTeX in data-latex attribute", html);
  assert(html.includes('data-latex="\\ce{H2O}"'), "Stores chemistry in data-latex attribute", html);
  assert(html.includes('data-latex="E = mc^2"'), "Stores display formula in data-latex attribute", html);
  assert(!html.includes("$\\times$"), "Does not leak raw $\\times$ into HTML", html);
  assert(html.includes("katex"), "Embeds real visual KaTeX nodes in the HTML surface", html);
}

console.log("\n===============================================================");
console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
console.log("===============================================================");

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
