from sympy import N, simplify
from app.engine.parser import parse_math_expression
from app.engine.responses import SolveStep, StepVerification

NUMERIC_MATCH_TOL = 1e-8

def expressions_match(left, right) -> bool:
    reduced = simplify(left - right)
    if reduced == 0:
        return True

    equals = reduced.equals(0)
    return equals is True

def numeric_match(left, right, tol: float = NUMERIC_MATCH_TOL) -> bool:
    """Fallback comparison: evaluate numerically when simplify can't prove equality."""
    try:
        diff_val = complex(N(left - right))
        return abs(diff_val) < tol
    except Exception:
        return False

def expressions_match_or_numeric(left, right) -> bool:
    if expressions_match(left, right):
        return True
    return numeric_match(left, right)

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
            "This step matches the expected symbolic expression."
            if verified
            else "This step does not match the expected symbolic expression."
        ),
    )
