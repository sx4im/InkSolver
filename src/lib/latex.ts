// Lightweight LaTeX helpers shared across the app.
//
// `latexToReadable` converts a LaTeX expression into a compact, human-readable
// Unicode string. It is used for places where a full KaTeX render is not
// practical — most importantly the handwritten-style text shapes InkSolver
// places directly on the tldraw canvas, where a student should see
// `∫ x² dx` rather than the literal `\int x^2\,dx` source.
//
// This module is intentionally framework-free (no React, no KaTeX) so it can be
// imported anywhere — server, client, or canvas placement — and unit-checked in
// isolation.

const SUPERSCRIPTS: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  n: "ⁿ",
  i: "ⁱ",
};

const SUBSCRIPTS: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
};

// Ordered longest-first so multi-character commands win over their prefixes
// (e.g. `\leq` before `\le`).
const SYMBOL_REPLACEMENTS: Array<[string, string]> = [
  ["^\\circ", "°"],
  ["\\rightarrow", "→"],
  ["\\Rightarrow", "⇒"],
  ["\\leftarrow", "←"],
  ["\\approx", "≈"],
  ["\\equiv", "≡"],
  ["\\theta", "θ"],
  ["\\alpha", "α"],
  ["\\beta", "β"],
  ["\\gamma", "γ"],
  ["\\Delta", "Δ"],
  ["\\delta", "δ"],
  ["\\lambda", "λ"],
  ["\\omega", "ω"],
  ["\\Omega", "Ω"],
  ["\\infty", "∞"],
  ["\\partial", "∂"],
  ["\\prod", "∏"],
  ["\\sum", "Σ"],
  ["\\int", "∫"],
  ["\\times", "×"],
  ["\\cdot", "·"],
  ["\\div", "÷"],
  ["\\pm", "±"],
  ["\\mp", "∓"],
  ["\\neq", "≠"],
  ["\\leq", "≤"],
  ["\\geq", "≥"],
  ["\\le", "≤"],
  ["\\ge", "≥"],
  ["\\to", "→"],
  ["\\pi", "π"],
  ["\\circ", "°"],
  ["\\degree", "°"],
];

const FUNCTION_NAMES = /\\(sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|log|ln|exp|lim|max|min|gcd|det)\b/g;

function toScript(value: string, map: Record<string, string>, prefix: string): string {
  const chars = [...value.trim()];
  if (chars.length > 0 && chars.every((char) => map[char] !== undefined)) {
    return chars.map((char) => map[char]).join("");
  }
  return value.length === 1 ? `${prefix}${value}` : `${prefix}(${value})`;
}

// Reads a LaTeX argument starting at `start`: either a single token or a
// brace-delimited `{...}` group (respecting nesting). Returns the inner content
// and the index just past it.
function readGroup(text: string, start: number): [string | null, number] {
  let index = start;
  while (index < text.length && /\s/.test(text[index])) index += 1;
  if (index >= text.length) return [null, index];

  if (text[index] !== "{") {
    let end = index;
    if (text[end] === "\\") {
      end += 1;
      while (end < text.length && /[A-Za-z]/.test(text[end])) end += 1;
    } else {
      end += 1;
    }
    return [text.slice(index, end), end];
  }

  let depth = 0;
  for (let pos = index; pos < text.length; pos += 1) {
    if (text[pos] === "{") depth += 1;
    else if (text[pos] === "}") {
      depth -= 1;
      if (depth === 0) return [text.slice(index + 1, pos), pos + 1];
    }
  }
  return [null, index];
}

function replaceFrac(text: string): string {
  let guard = 0;
  while (text.includes("\\frac") && guard < 64) {
    guard += 1;
    const start = text.indexOf("\\frac");
    const [numerator, afterNumerator] = readGroup(text, start + "\\frac".length);
    if (numerator === null) break;
    const [denominator, afterDenominator] = readGroup(text, afterNumerator);
    if (denominator === null) break;

    const replacement = `(${latexToReadable(numerator)})/(${latexToReadable(denominator)})`;
    text = text.slice(0, start) + replacement + text.slice(afterDenominator);
  }
  return text;
}

function replaceSqrt(text: string): string {
  let guard = 0;
  while (text.includes("\\sqrt") && guard < 64) {
    guard += 1;
    const start = text.indexOf("\\sqrt");
    const [argument, after] = readGroup(text, start + "\\sqrt".length);
    if (argument === null) break;

    const replacement = `√(${latexToReadable(argument)})`;
    text = text.slice(0, start) + replacement + text.slice(after);
  }
  return text;
}

export function latexToReadable(input: string): string {
  if (!input) return "";

  let text = input.trim();
  text = replaceFrac(text);
  text = replaceSqrt(text);

  for (const [from, to] of SYMBOL_REPLACEMENTS) {
    text = text.split(from).join(to);
  }

  text = text.replace(FUNCTION_NAMES, "$1");
  text = text.replace(/\\(?:text|mathrm|mathbf|operatorname)\s*\{([^{}]*)\}/g, "$1");

  text = text.replace(/\^\{([^{}]*)\}/g, (_match, exponent: string) => toScript(exponent, SUPERSCRIPTS, "^"));
  text = text.replace(/\^([A-Za-z0-9])/g, (_match, exponent: string) => toScript(exponent, SUPERSCRIPTS, "^"));
  text = text.replace(/_\{([^{}]*)\}/g, (_match, subscript: string) => toScript(subscript, SUBSCRIPTS, "_"));
  text = text.replace(/_([A-Za-z0-9])/g, (_match, subscript: string) => toScript(subscript, SUBSCRIPTS, "_"));

  text = text
    .replace(/\\[,;!:> ]/g, " ")
    .replace(/\\left|\\right/g, "")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}
