import re
from sympy import limit
from app.engine.parser import X, LOCAL_SYMBOLS, parse_math_expression
from app.engine.matcher import expressions_match_or_numeric, verify_equivalent_step
from app.engine.responses import VerifyRequest, VerifyResponse, unsupported_response

def verify_limit(payload: VerifyRequest) -> VerifyResponse:
    target = extract_limit_info(payload)
    if not target:
        return unsupported_response(
            payload,
            "The verifier could not identify the limit expression, variable, or point.",
        )

    expr = parse_math_expression(target["expr"])
    point = parse_math_expression(target["point"])
    final_expr = parse_math_expression(payload.final_answer)

    if expr is None or point is None or final_expr is None:
        return unsupported_response(
            payload,
            "The limit expression or final answer could not be parsed.",
        )

    var = LOCAL_SYMBOLS.get(target.get("var", "x"), X)

    try:
        expected = limit(expr, var, point)
    except Exception:
        return unsupported_response(
            payload,
            "SymPy could not compute this limit.",
        )

    verified = expressions_match_or_numeric(expected, final_expr)

    return VerifyResponse(
        verified=verified,
        verification_status="verified" if verified else "mismatch",
        computed_value=str(expected),
        supported_rule="limit",
        reason=(
            "The final answer matches the computed limit."
            if verified
            else "The final answer does not match the computed limit."
        ),
        steps=[
            verify_equivalent_step(step, expected)
            for step in payload.steps
        ],
    )

def extract_limit_info(payload: VerifyRequest) -> dict | None:
    source = payload.problem_text

    # LaTeX: \lim_{x \to a} expr  or  \lim_{x\to a} expr
    m = re.search(
        r"\\lim\s*_\s*\{?\s*([a-z])\s*(?:\\to|\\rightarrow|->)\s*(.+?)\s*\}?\s*(.+)",
        source,
    )
    if m:
        return {"var": m.group(1), "point": m.group(2).strip(), "expr": m.group(3).strip()}

    # English: "limit of expr as x approaches a"
    m = re.search(
        r"limit\s+of\s+(.+?)\s+as\s+([a-z])\s+(?:approaches|goes\s+to|->|→)\s+(.+)",
        source,
        re.IGNORECASE,
    )
    if m:
        return {"expr": m.group(1).strip(), "var": m.group(2), "point": m.group(3).strip()}

    # Simpler: "limit x->a of expr"
    m = re.search(
        r"limit\s+([a-z])\s*(?:->|→|\\to)\s*(.+?)\s+(?:of\s+)?(.+)",
        source,
        re.IGNORECASE,
    )
    if m:
        return {"var": m.group(1), "point": m.group(2).strip(), "expr": m.group(3).strip()}

    return None
