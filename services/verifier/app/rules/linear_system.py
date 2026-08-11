import re
from sympy import Eq
from sympy.solvers.solveset import linsolve
from app.engine.parser import X, Y, Z, T, parse_math_expression, clean_latex_expression
from app.engine.matcher import expressions_match_or_numeric
from app.engine.responses import StepVerification, VerifyRequest, VerifyResponse, unsupported_response

def verify_linear_system(payload: VerifyRequest) -> VerifyResponse:
    equations = extract_linear_equations(payload)
    if not equations or len(equations) < 2:
        return unsupported_response(
            payload,
            "The verifier could not identify a system of linear equations.",
        )

    parsed_eqs = []
    variables = set()
    for eq_text in equations:
        parsed = parse_equation(eq_text)
        if parsed is None:
            return unsupported_response(
                payload,
                f"Could not parse equation: {eq_text}",
            )
        parsed_eqs.append(parsed)
        variables.update(parsed.free_symbols)

    # Sort variables consistently (x, y, z, t, ...).
    var_order = [v for v in [X, Y, Z, T] if v in variables]
    var_order.extend(sorted(variables - set(var_order), key=str))

    if not var_order:
        return unsupported_response(payload, "No variables found in the system.")

    try:
        result = linsolve(parsed_eqs, *var_order)
        solutions_list = list(result)
    except Exception:
        return unsupported_response(
            payload,
            "SymPy could not solve this linear system.",
        )

    if not solutions_list:
        return VerifyResponse(
            verified=False,
            verification_status="mismatch",
            computed_value="no solution",
            supported_rule="linear_system",
            reason="The system has no solution.",
            steps=[
                StepVerification(
                    step_num=step.step_num,
                    verified=False,
                    verification_status="unverifiable",
                    reason="Cannot verify steps for a system with no solution.",
                )
                for step in payload.steps
            ],
        )

    solution_tuple = solutions_list[0]
    computed_pairs = {str(var): val for var, val in zip(var_order, solution_tuple)}
    computed_value = ", ".join(f"{k} = {v}" for k, v in computed_pairs.items())

    # Check if the final answer contains the correct values.
    final_text = clean_latex_expression(payload.final_answer)
    verified = all(
        check_value_in_answer(final_text, str(var), val)
        for var, val in zip(var_order, solution_tuple)
    )

    return VerifyResponse(
        verified=verified,
        verification_status="verified" if verified else "mismatch",
        computed_value=computed_value,
        supported_rule="linear_system",
        reason=(
            "The final answer matches the computed solution to the linear system."
            if verified
            else "The final answer does not match the computed solution."
        ),
        steps=[
            StepVerification(
                step_num=step.step_num,
                verified=False,
                verification_status="unverifiable",
                reason="Individual step verification is not supported for linear systems.",
            )
            for step in payload.steps
        ],
    )

def extract_linear_equations(payload: VerifyRequest) -> list[str] | None:
    source = payload.problem_text

    # LaTeX system: \begin{cases} ... \end{cases} or \{ ... \}
    cases_match = re.search(
        r"\\begin\{cases\}(.+?)\\end\{cases\}",
        source,
        re.DOTALL,
    )
    if cases_match:
        body = cases_match.group(1)
        return [eq.strip() for eq in re.split(r"\\\\|\\cr", body) if eq.strip()]

    # Strip common preamble so the first equation isn't polluted.
    cleaned = re.sub(
        r"^.*?(?:solve\s+(?:the\s+)?(?:system\s+of\s+(?:linear\s+)?equations|following)|system\s+of\s+(?:linear\s+)?equations|given)\s*[:.]?\s*",
        "",
        source,
        flags=re.IGNORECASE,
    ).strip()

    # Equations separated by " and " or semicolons or commas with "=".
    equations = re.split(r"\s+and\s+|;\s*|,\s*(?=[^,]*=)", cleaned)
    equations = [eq.strip() for eq in equations if "=" in eq]
    if len(equations) >= 2:
        return equations

    # Try splitting on newlines.
    equations = [eq.strip() for eq in cleaned.split("\n") if "=" in eq.strip()]
    if len(equations) >= 2:
        return equations

    return None

def parse_equation(eq_text: str):
    """Parse 'lhs = rhs' into a SymPy Eq, or return None."""
    cleaned = clean_latex_expression(eq_text)
    parts = cleaned.split("=", 1)
    if len(parts) != 2:
        return None

    lhs = parse_math_expression(parts[0].strip())
    rhs = parse_math_expression(parts[1].strip())
    if lhs is None or rhs is None:
        return None

    return Eq(lhs, rhs)

def check_value_in_answer(answer_text: str, var_name: str, expected_value) -> bool:
    """Check if the answer text contains var = expected_value."""
    answer_expr = parse_math_expression(answer_text)
    if answer_expr is not None and expressions_match_or_numeric(answer_expr, expected_value):
        return True

    # Look for patterns like "x = 3" or "x=3" in the text.
    pattern = rf"{re.escape(var_name)}\s*=\s*([^,;\s]+)"
    for m in re.finditer(pattern, answer_text):
        val = parse_math_expression(m.group(1))
        if val is not None and expressions_match_or_numeric(val, expected_value):
            return True

    return False
