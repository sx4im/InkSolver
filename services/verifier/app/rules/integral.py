import re
from sympy import diff, simplify
from app.engine.parser import X, english_math_words, parse_math_expression
from app.engine.matcher import expressions_match
from app.engine.responses import StepVerification, SolveStep, VerifyRequest, VerifyResponse, unsupported_response

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
