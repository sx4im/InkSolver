import re
from sympy import integrate, simplify
from app.engine.parser import X, LOCAL_SYMBOLS, parse_math_expression
from app.engine.matcher import expressions_match_or_numeric, verify_equivalent_step
from app.engine.responses import VerifyRequest, VerifyResponse, unsupported_response

def verify_definite_integral(payload: VerifyRequest) -> VerifyResponse:
    target = extract_definite_integral_info(payload)
    if not target:
        return unsupported_response(
            payload,
            "The verifier could not identify the integrand or bounds for this definite integral.",
        )

    integrand = parse_math_expression(target["integrand"])
    lower = parse_math_expression(target["lower"])
    upper = parse_math_expression(target["upper"])
    final_expr = parse_math_expression(payload.final_answer)

    if integrand is None or lower is None or upper is None or final_expr is None:
        return unsupported_response(
            payload,
            "The definite integral or final answer could not be parsed.",
        )

    var = LOCAL_SYMBOLS.get(target.get("var", "x"), X)

    try:
        expected = integrate(integrand, (var, lower, upper))
        expected = simplify(expected)
    except Exception:
        return unsupported_response(
            payload,
            "SymPy could not compute this definite integral.",
        )

    verified = expressions_match_or_numeric(expected, final_expr)

    return VerifyResponse(
        verified=verified,
        verification_status="verified" if verified else "mismatch",
        computed_value=str(expected),
        supported_rule="definite_integral",
        reason=(
            "The final answer matches the computed definite integral."
            if verified
            else "The final answer does not match the computed definite integral."
        ),
        steps=[
            verify_equivalent_step(step, expected)
            for step in payload.steps
        ],
    )

def extract_definite_integral_info(payload: VerifyRequest) -> dict | None:
    sources = [payload.problem_text, *[step.latex for step in payload.steps]]

    for source in sources:
        cleaned = source.replace("\\,", "").replace("\\;", "")
        cleaned = cleaned.replace("\\mathrm{d}x", "dx")

        # LaTeX: \int_{a}^{b} expr dx  or  \int_a^b expr dx
        m = re.search(
            r"\\int\s*_\s*\{?\s*(.+?)\s*\}?\s*\^\s*\{?\s*(.+?)\s*\}?\s*(.+?)(?:d\s*x|dx)(?:\b|$)",
            cleaned,
        )
        if m:
            return {
                "lower": m.group(1).strip(),
                "upper": m.group(2).strip(),
                "integrand": m.group(3).strip(),
            }

    # English: "integrate expr from a to b"
    lower_source = payload.problem_text.lower()
    m = re.search(
        r"(?:integrate|definite\s+integral\s+of)\s+(.+?)\s+from\s+(.+?)\s+to\s+(.+?)(?:\s|$|\.)",
        lower_source,
    )
    if m:
        return {
            "integrand": m.group(1).strip(),
            "lower": m.group(2).strip(),
            "upper": m.group(3).strip(),
        }

    return None
