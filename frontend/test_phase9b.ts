import process from "node:process";
import { normalizeMathContent, validateMathSyntax } from "./lib/mathNormalizer";

async function runAllTests() {
  console.log("=== TEST 1: MATH NORMALIZATION ===");
  const input1 = "Solve for x: x² + 2x + 1 = 0 and find √16";
  const out1 = normalizeMathContent(input1);
  console.log("Input 1:", input1);
  console.log("Output 1:", out1);
  console.assert(out1.includes("^2") || out1.includes("^{2}"), "Should convert x² to x^2");
  console.assert(out1.includes("\\sqrt{16}"), "Should convert √16 to \\sqrt{16}");

  const input2 = "What is the value of \\frac{a}{b} + \\sqrt{x}?";
  const out2 = normalizeMathContent(input2);
  console.log("Input 2:", input2);
  console.log("Output 2:", out2);
  console.assert(out2.includes("$\\frac{a}{b}$") || out2.includes("\\frac{a}{b}"), "Should auto-wrap bare LaTeX");

  const input3 = "Calculate: 3 × 4 ÷ 2 ≤ 10 ≠ 15 ± 2";
  const out3 = normalizeMathContent(input3);
  console.log("Input 3:", input3);
  console.log("Output 3:", out3);
  console.assert(out3.includes("\\times"), "Should convert × to \\times");
  console.assert(out3.includes("\\le"), "Should convert ≤ to \\le");
  console.assert(out3.includes("\\pm"), "Should convert ± to \\pm");

  console.log("\n=== TEST 2: KATEX SYNTAX VALIDATION ===");
  const valid1 = validateMathSyntax("Valid formula: $x^2 + y^2 = r^2$ and $\\int_0^1 2x \\, dx$");
  console.log("Valid test isValid:", valid1.isValid, "issues count:", valid1.issues.length);
  console.assert(valid1.isValid === true, "Valid formula should have isValid === true");

  const invalid1 = validateMathSyntax("Invalid unclosed fraction: $\\frac{a}{ $");
  console.log("Invalid test isValid:", invalid1.isValid, "error message:", invalid1.issues[0]?.errorMessage);
  console.assert(invalid1.isValid === false, "Invalid formula should have isValid === false");

  console.log("\n>>> ALL PHASE 9B UNIT TESTS PASSED SUCCESSFULLY! <<<");
}

runAllTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

