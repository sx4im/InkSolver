from __future__ import annotations

import re
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field
from sympy import Symbol, cos, exp, log, pi, sin, sqrt, tan, diff, simplify
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

VerificationStatus = Literal["verified", "unverifiable", "mismatch"]

app = FastAPI(title="InkSolver Verifier", version="0.1.0")

TRANSFORMATIONS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)
X = Symbol("x")
LOCAL_SYMBOLS = {
    "x": X,
    "y": Symbol("y"),
    "z": Symbol("z"),
    "t": Symbol("t"),
    "C": Symbol("C"),
    "sin": sin,
    "cos": cos,
    "tan": tan,
    "log": log,
    "ln": log,
    "sqrt": sqrt,
    "exp": exp,
    "pi": pi,
}
FUNCTION_NAMES = ("sin", "cos", "tan", "log", "ln", "sqrt", "exp")


class SolveStep(BaseModel):
    step_num: int = Field(..., ge=1)
    latex: str
    explanation: str | None = None


class VerifyRequest(BaseModel):
    problem_text: str
    subject: str = "unknown"
    final_answer: str
    steps: list[SolveStep] = Field(default_factory=list)


class StepVerification(BaseModel):
    step_num: int
    verified: bool
    verification_status: VerificationStatus
    computed_value: str | None = None
    reason: str


class VerifyResponse(BaseModel):
    verified: bool
    verification_status: VerificationStatus
    computed_value: str | None = None
    supported_rule: str | None = None
    reason: str
    steps: list[StepVerification]


@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "true"}


@app.post("/verify", response_model=VerifyResponse)
def verify(payload: VerifyRequest) -> VerifyResponse:
    return verify_payload(payload)


def verify_payload(payload: VerifyRequest) -> VerifyResponse:
    kind = detect_problem_kind(payload)

    if kind == "integral":
        return verify_integral(payload)

    if kind == "derivative":
        return verify_derivative(payload)

    return unsupported_response(
        payload,
        "No supported symbolic verification rule matched this problem yet.",
    )


def detect_problem_kind(payload: VerifyRequest) -> str | None:
    source = " ".join(
        [
            payload.problem_text,
            payload.final_answer,
            *[step.latex for step in payload.steps],
        ],
    ).lower()

    if "\\int" in source or "integral" in source or "integrate" in source:
        return "integral"

    if "derivative" in source or "differentiate" in source or "d/dx" in source or "\\frac{d" in source:
        return "derivative"

    return None


def verify_integral(payload: VerifyRequest) -> VerifyResponse:
    target_text = extract_integral_target(payload)
    if not target_text:
        return unsupported_response(
            payload,
            "The verifier could not identify the integrand for this integral.",
        )

    target_expr = parse_math_expression(target_text)
    if target_expr is None:
        return unsupported_response(
            payload,
            f"The integrand could not be parsed: {target_text}",
        )

    step_results = [
        verify_integral_step(step, target_expr, target_text)
        for step in payload.steps
    ]

    final_expr = parse_math_expression(payload.final_answer)
    if final_expr is None:
        return VerifyResponse(
            verified=False,
            verification_status="unverifiable",
            computed_value=str(target_expr),
            supported_rule="power_rule_integral",
            reason="The final answer could not be parsed as a symbolic expression.",
            steps=step_results,
        )

    derivative = simplify(diff(final_expr, X))
    if expressions_match(derivative, target_expr):
        return VerifyResponse(
            verified=True,
            verification_status="verified",
            computed_value=str(derivative),
            supported_rule="power_rule_integral",
            reason="Differentiating the final answer reproduces the selected integrand.",
            steps=step_results,
        )

    return VerifyResponse(
        verified=False,
        verification_status="mismatch",
        computed_value=str(derivative),
        supported_rule="power_rule_integral",
        reason="Differentiating the final answer does not reproduce the selected integrand.",
        steps=step_results,
    )


def verify_integral_step(step: SolveStep, target_expr, target_text: str) -> StepVerification:
    if "\\int" in step.latex:
        step_target = parse_math_expression(extract_integral_text(step.latex) or "")
        verified = step_target is not None and expressions_match(step_target, target_expr)

        return StepVerification(
            step_num=step.step_num,
            verified=verified,
            verification_status="verified" if verified else "mismatch",
            computed_value=str(step_target) if step_target is not None else None,
            reason=(
                "The setup uses the same integrand selected for solving."
                if verified
                else f"The setup does not match the selected integrand: {target_text}"
            ),
        )

    step_expr = parse_math_expression(step.latex)
    if step_expr is None:
        return StepVerification(
            step_num=step.step_num,
            verified=False,
            verification_status="unverifiable",
            reason="This step could not be parsed as a symbolic expression.",
        )

    derivative = simplify(diff(step_expr, X))
    verified = expressions_match(derivative, target_expr)

    return StepVerification(
        step_num=step.step_num,
        verified=verified,
        verification_status="verified" if verified else "mismatch",
        computed_value=str(derivative),
        reason=(
            "Differentiating this step reproduces the selected integrand."
            if verified
            else "Differentiating this step does not reproduce the selected integrand."
        ),
    )


def verify_derivative(payload: VerifyRequest) -> VerifyResponse:
    target_text = extract_derivative_target(payload.problem_text)
    if not target_text:
        return unsupported_response(
            payload,
            "The verifier could not identify the expression to differentiate.",
        )

    target_expr = parse_math_expression(target_text)
    final_expr = parse_math_expression(payload.final_answer)

    if target_expr is None or final_expr is None:
        return unsupported_response(
            payload,
            "The derivative problem or final answer could not be parsed.",
        )

    expected = simplify(diff(target_expr, X))
    verified = expressions_match(expected, final_expr)

    return VerifyResponse(
        verified=verified,
        verification_status="verified" if verified else "mismatch",
        computed_value=str(expected),
        supported_rule="single_variable_derivative",
        reason=(
            "The final answer matches the symbolic derivative."
            if verified
            else "The final answer does not match the symbolic derivative."
        ),
        steps=[
            verify_equivalent_step(step, expected)
            for step in payload.steps
        ],
    )


def verify_equivalent_step(step: SolveStep, expected_expr) -> StepVerification:
    step_expr = parse_math_expression(step.latex)
    if step_expr is None:
        return StepVerification(
            step_num=step.step_num,
            verified=False,
            verification_status="unverifiable",
            reason="This step could not be parsed as a symbolic expression.",
        )

    verified = expressions_match(step_expr, expected_expr)

    return StepVerification(
        step_num=step.step_num,
        verified=verified,
        verification_status="verified" if verified else "mismatch",
        computed_value=str(expected_expr),
        reason=(
            "This step matches the symbolic derivative."
            if verified
            else "This step does not match the symbolic derivative."
        ),
    )


def unsupported_response(payload: VerifyRequest, reason: str) -> VerifyResponse:
    return VerifyResponse(
        verified=False,
        verification_status="unverifiable",
        reason=reason,
        steps=[
            StepVerification(
                step_num=step.step_num,
                verified=False,
                verification_status="unverifiable",
                reason=reason,
            )
            for step in payload.steps
        ],
    )


def extract_integral_target(payload: VerifyRequest) -> str | None:
    sources = [
        payload.problem_text,
        *[step.latex for step in payload.steps],
    ]

    for source in sources:
        target = extract_integral_text(source)
        if target:
            return target

    return None


def extract_integral_text(source: str) -> str | None:
    cleaned = source.strip()
    latex_source = cleaned.replace("\\,", "").replace("\\;", "")
    latex_source = latex_source.replace("\\mathrm{d}x", "dx")

    latex_match = re.search(r"\\int\s*(.+?)(?:d\s*x|dx)(?:\b|$)", latex_source)
    if latex_match:
        return latex_match.group(1).strip()

    lower = english_math_words(cleaned.lower())
    if "integral" not in lower and "integrate" not in lower:
        return None

    after = re.sub(
        r"^.*?(?:integrate|integral\s+of|indefinite\s+integral\s+of|evaluate\s+the\s+integral\s+of)\s*",
        "",
        lower,
    )
    after = after.removeprefix("of ").strip(" :.")
    after = re.split(r"\s+(?:d\s*x|dx|with\s+respect\s+to\s+x)\b", after, maxsplit=1)[0]
    after = after.strip(" .:")

    if after and not after.startswith("the selected"):
        return after

    return None


def extract_derivative_target(problem_text: str) -> str | None:
    source = english_math_words(problem_text.lower()).strip()

    latex_match = re.search(r"\\frac\{d\}\{d\s*x\}\s*(.+)$", problem_text)
    if latex_match:
        return latex_match.group(1).strip()

    slash_match = re.search(r"d\s*/\s*d\s*x\s*\(?\s*(.+?)\s*\)?$", source)
    if slash_match:
        return slash_match.group(1).strip()

    source = re.sub(r"^.*?(?:differentiate|derivative\s+of)\s*", "", source)
    source = source.removeprefix("of ").strip(" .:")
    source = re.split(r"\s+(?:with\s+respect\s+to\s+x)\b", source, maxsplit=1)[0]

    return source or None


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


def expressions_match(left, right) -> bool:
    reduced = simplify(left - right)
    if reduced == 0:
        return True

    equals = reduced.equals(0)
    return equals is True
