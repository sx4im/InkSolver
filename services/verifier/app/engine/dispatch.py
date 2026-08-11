import re
from app.engine.responses import VerifyRequest, VerifyResponse, unsupported_response
from app.rules.integral import verify_integral
from app.rules.definite_integral import verify_definite_integral
from app.rules.derivative import verify_derivative
from app.rules.limit import verify_limit
from app.rules.linear_system import verify_linear_system

def verify_payload(payload: VerifyRequest) -> VerifyResponse:
    kind = detect_problem_kind(payload)

    if kind == "integral":
        return verify_integral(payload)

    if kind == "definite_integral":
        return verify_definite_integral(payload)

    if kind == "derivative":
        return verify_derivative(payload)

    if kind == "limit":
        return verify_limit(payload)

    if kind == "linear_system":
        return verify_linear_system(payload)

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

    # Definite integrals (with bounds) before indefinite integrals.
    # (?<!in) prevents "indefinite integral" from matching.
    if re.search(r"\\int_|\\int\s*_|(?<!in)definite\s+integral|from\s+.+?\s+to\s+.+?\s+integrate", source):
        return "definite_integral"

    if "\\int" in source or "integral" in source or "integrate" in source:
        return "integral"

    if "derivative" in source or "differentiate" in source or "d/dx" in source or "\\frac{d" in source:
        return "derivative"

    if re.search(r"\\lim|limit\b", source):
        return "limit"

    if re.search(r"linear\s+system|system\s+of\s+(linear\s+)?equations|solve.*\{|solve.*and\b", source):
        return "linear_system"

    return None
