import re
from sympy import diff, simplify
from app.engine.parser import X, english_math_words, parse_math_expression
from app.engine.matcher import expressions_match, verify_equivalent_step
from app.engine.responses import VerifyRequest, VerifyResponse, unsupported_response

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
