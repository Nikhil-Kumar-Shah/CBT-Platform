const katex = require('d:/CBT/frontend/node_modules/katex');

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderMath(rawContent, inline = false) {
  if (!rawContent) return "";

  const ESCAPED_DOLLAR_PLACEHOLDER = "___ESCAPED_DOLLAR___";
  const sanitized = rawContent.replace(/\\\$/g, ESCAPED_DOLLAR_PLACEHOLDER);

  const regex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^\$\n]+?\$|\\\([\s\S]+?\\\))/g;
  const parts = sanitized.split(regex);

  return parts
    .map((part) => {
      if (!part) return "";

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
            throwOnError: false,
            strict: false,
            trust: true,
            output: "htmlAndMathml",
          });
        } catch (e) {
          return `<span class="katex-error">${escapeHtml(part)}</span>`;
        }
      }

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
            throwOnError: false,
            strict: false,
            trust: true,
            output: "htmlAndMathml",
          });
        } catch (e) {
          return `<span class="katex-error">${escapeHtml(part)}</span>`;
        }
      }

      const plainText = part.replace(new RegExp(ESCAPED_DOLLAR_PLACEHOLDER, "g"), "$");
      const escaped = escapeHtml(plainText);
      return inline ? escaped : escaped.replace(/\n/g, "<br />");
    })
    .join("");
}

const tests = [
  {
    id: 1,
    name: "Plain text question",
    input: "Which of the following is an example of a renewable energy source?",
    validate: (res) => !res.includes("katex") && res.includes("renewable energy"),
  },
  {
    id: 2,
    name: "Inline math",
    input: "Consider a point charge $q$ moving with velocity $v$.",
    validate: (res) => res.includes("class=\"katex\"") && !res.includes("katex-error") && res.includes("point charge"),
  },
  {
    id: 3,
    name: "Display equation",
    input: "Newton's second law is given by: $$\\vec{F} = \\frac{d\\vec{p}}{dt}$$",
    validate: (res) => res.includes("class=\"katex-display\"") && !res.includes("katex-error"),
  },
  {
    id: 4,
    name: "Fractions",
    input: "The kinetic energy is $K = \\frac{1}{2} m v^2$.",
    validate: (res) => res.includes("class=\"katex\"") && res.includes("frac") && !res.includes("katex-error"),
  },
  {
    id: 5,
    name: "Square roots",
    input: "The root-mean-square speed is $v_{rms} = \\sqrt{\\frac{3RT}{M}}$.",
    validate: (res) => res.includes("class=\"katex\"") && res.includes("sqrt") && !res.includes("katex-error"),
  },
  {
    id: 6,
    name: "Greek letters",
    input: "Parameters $\\alpha, \\beta, \\gamma, \\mu_s, \\mu_k, \\theta, \\lambda, \\Phi$ are constants.",
    validate: (res) => res.includes("class=\"katex\"") && !res.includes("katex-error"),
  },
  {
    id: 7,
    name: "Subscripts and superscripts",
    input: "Equation: $x_1^2 + x_2^2 = R^2$ and $v(t) = 3t^2 - 6t$.",
    validate: (res) => res.includes("class=\"katex\"") && !res.includes("katex-error"),
  },
  {
    id: 8,
    name: "\\text{} expressions such as m/s²",
    input: "Acceleration is $a = 2\\text{ m/s}^2$ and $4\\text{ m/s}^2$ with $\\mu_s = 0.4$.",
    validate: (res) => res.includes("class=\"katex\"") && res.includes("m/s") && !res.includes("katex-error"),
  },
  {
    id: 9,
    name: "Mathematical expressions inside MCQ options",
    input: "$2\\text{ m/s}^2$",
    validate: (res) => res.includes("class=\"katex\"") && !res.includes("katex-error"),
  },
  {
    id: 9.1,
    name: "MCQ option with friction mu",
    input: "Static friction coefficient $\\mu_s$ is generally greater than kinetic friction coefficient $\\mu_k$.",
    validate: (res) => res.includes("class=\"katex\"") && res.includes("Static friction") && !res.includes("katex-error"),
  },
  {
    id: 10,
    name: "Preview Exam & Student Exam option payload",
    input: "$3.0 \\times 10^8\\text{ m/s}$",
    validate: (res) => res.includes("class=\"katex\"") && !res.includes("katex-error"),
  },
  {
    id: 11,
    name: "Escaped dollar sign handling (currency)",
    input: "The cost is \\$50 and total price is \\$100.",
    validate: (res) => !res.includes("katex") && res.includes("$50") && res.includes("$100"),
  }
];

let allPassed = true;
console.log("=================================================================");
console.log("MATHEMATICAL RENDERING VERIFICATION SUITE (ALL 10 REQUIREMENTS)");
console.log("=================================================================");

tests.forEach((t) => {
  const rendered = renderMath(t.input);
  const passed = t.validate(rendered);
  if (!passed) allPassed = false;
  console.log(`[${passed ? "PASS" : "FAIL"}] Test ${t.id}: ${t.name}`);
  if (!passed) {
    console.log(`       Input: ${t.input}`);
    console.log(`       Rendered: ${rendered}`);
  }
});

console.log("-----------------------------------------------------------------");
if (allPassed) {
  console.log(">>> ALL 10 MATHEMATICAL RENDERING TESTS PASSED SUCCESSFULLY! <<<");
  process.exit(0);
} else {
  console.error(">>> SOME TESTS FAILED <<<");
  process.exit(1);
}
