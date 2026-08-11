import re
from sympy import Symbol, cos, exp, log, oo, pi, sin, sqrt, tan
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

TRANSFORMATIONS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)

X = Symbol("x")
Y = Symbol("y")
Z = Symbol("z")
T = Symbol("t")
C = Symbol("C")

LOCAL_SYMBOLS = {
    "x": X,
    "y": Y,
    "z": Z,
    "t": T,
    "C": C,
    "sin": sin,
    "cos": cos,
    "tan": tan,
    "log": log,
    "ln": log,
    "sqrt": sqrt,
    "exp": exp,
    "pi": pi,
    "inf": oo,
    "infinity": oo,
    "oo": oo,
}
FUNCTION_NAMES = ("sin", "cos", "tan", "log", "ln", "sqrt", "exp")

def parse_math_expression(value: str):
    if not value.strip():
        return None

    text = clean_latex_expression(value)

    try:
        return parse_expr(
            text,
            local_dict=LOCAL_SYMBOLS,
            transformations=TRANSFORMATIONS,
            evaluate=True,
        )
    except Exception:
        return None

def clean_latex_expression(value: str) -> str:
    text = english_math_words(value)
    text = text.strip().strip("$")
    text = text.replace("\\left", "").replace("\\right", "")
    text = text.replace("\\,", "").replace("\\;", "")
    text = text.replace("\\mathrm{d}x", "dx").replace("\\mathrm{d}", "d")
    text = text.replace("\\cdot", "*").replace("\\times", "*")
    text = text.replace("\\pi", "pi")

    text = replace_command_groups(text, "\\frac", lambda a, b: f"(({a})/({b}))")
    text = replace_command_groups(text, "\\sqrt", lambda a, _b=None: f"sqrt({a})")

    for latex_name, sympy_name in {
        "\\sin": "sin",
        "\\cos": "cos",
        "\\tan": "tan",
        "\\ln": "log",
        "\\log": "log",
        "\\exp": "exp",
    }.items():
        text = text.replace(latex_name, sympy_name)

    text = text.replace("{", "(").replace("}", ")")
    text = normalize_function_calls(text)
    text = re.sub(r"\\[a-zA-Z]+", "", text)
    text = re.sub(r"(?:d\s*x|dx)$", "", text.strip())
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"([A-Za-z0-9\)])\^\(([^)]+)\)", r"\1**(\2)", text)
    text = re.sub(r"([A-Za-z0-9\)])\^([A-Za-z0-9]+)", r"\1**\2", text)
    text = text.replace("^", "**")

    return text

def normalize_function_calls(text: str) -> str:
    for function_name in FUNCTION_NAMES:
        text = re.sub(
            rf"\b{function_name}\s+([A-Za-z](?:\s*\^\s*\(?[-A-Za-z0-9+*/]+\)?)?)",
            rf"{function_name}(\1)",
            text,
        )
        text = re.sub(
            rf"\b{function_name}([A-Za-z])\b",
            rf"{function_name}(\1)",
            text,
        )

    return text.replace("ln(", "log(")

def replace_command_groups(text: str, command: str, formatter):
    while command in text:
        start = text.find(command)
        first, after_first = read_latex_group(text, start + len(command))
        if first is None:
            break

        if command == "\\sqrt":
            replacement = formatter(first)
            text = text[:start] + replacement + text[after_first:]
            continue

        second, after_second = read_latex_group(text, after_first)
        if second is None:
            break

        replacement = formatter(first, second)
        text = text[:start] + replacement + text[after_second:]

    return text

def read_latex_group(text: str, start: int) -> tuple[str | None, int]:
    index = start
    while index < len(text) and text[index].isspace():
        index += 1

    if index >= len(text):
        return None, index

    if text[index] != "{":
        end = index + 1
        while end < len(text) and re.match(r"[A-Za-z0-9]", text[end]):
            end += 1
        return text[index:end], end

    depth = 0
    for pos in range(index, len(text)):
        if text[pos] == "{":
            depth += 1
        elif text[pos] == "}":
            depth -= 1
            if depth == 0:
                return text[index + 1 : pos], pos + 1

    return None, index

def english_math_words(value: str) -> str:
    text = value
    text = re.sub(r"\bx\s+squared\b", "x^2", text, flags=re.IGNORECASE)
    text = re.sub(r"\bx\s+cubed\b", "x^3", text, flags=re.IGNORECASE)
    text = re.sub(r"\bsquared\b", "^2", text, flags=re.IGNORECASE)
    text = re.sub(r"\bcubed\b", "^3", text, flags=re.IGNORECASE)
    return text
