import type { Solution, SolutionStep, VerificationStatus } from "@/lib/types";

type VerifierStep = {
  step_num: number;
  verified: boolean;
  verification_status: VerificationStatus;
  computed_value?: string | null;
  reason?: string | null;
};

type VerifierResponse = {
  verified: boolean;
  verification_status: VerificationStatus;
  computed_value?: string | null;
  reason?: string | null;
  steps?: VerifierStep[];
};

const defaultTimeoutMs = 3500;

export async function verifySolution(solution: Solution): Promise<Solution> {
  const remote = await verifyWithService(solution);

  if (remote) {
    return applyVerification(solution, remote);
  }

  return applyVerification(solution, verifyWithLocalRules(solution));
}

async function verifyWithService(solution: Solution): Promise<VerifierResponse | null> {
  const baseUrl = process.env.SYMPY_VERIFIER_URL?.replace(/\/$/, "");
  if (!baseUrl) return null;

  const controller = new AbortController();
  const timeoutMs = Number(process.env.SYMPY_VERIFIER_TIMEOUT_MS ?? defaultTimeoutMs);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        problem_text: solution.problemText,
        subject: solution.subject,
        final_answer: solution.finalAnswer,
        steps: solution.steps.map((step) => ({
          step_num: step.stepNum,
          latex: step.latex,
          explanation: step.explanation,
        })),
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    return (await response.json()) as VerifierResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function applyVerification(solution: Solution, result: VerifierResponse): Solution {
  const stepResults = new Map((result.steps ?? []).map((step) => [step.step_num, step]));
  const steps = solution.steps.map((step) => {
    const verification = stepResults.get(step.stepNum);
    if (!verification) return step;

    return {
      ...step,
      verified: verification.verified,
      verificationStatus: verification.verification_status,
      computedValue: verification.computed_value ?? null,
      verificationReason: verification.reason ?? null,
    };
  });

  return {
    ...solution,
    verificationStatus: result.verification_status,
    computedValue: result.computed_value ?? null,
    verificationReason: result.reason ?? null,
    steps,
  };
}

function verifyWithLocalRules(solution: Solution): VerifierResponse {
  const powerRule = detectPowerRuleIntegral(solution);

  if (!powerRule) {
    return {
      verified: false,
      verification_status: "unverifiable",
      reason: "No local symbolic rule matched this solution. Configure SYMPY_VERIFIER_URL for broader checks.",
      steps: solution.steps.map((step) => ({
        step_num: step.stepNum,
        verified: false,
        verification_status: "unverifiable",
        reason: "No local symbolic rule matched this step.",
      })),
    };
  }

  const finalVerified = latexContainsAntiderivative(
    solution.finalAnswer,
    powerRule.integrandPower + 1,
    powerRule.integrandPower + 1,
  );

  return {
    verified: finalVerified,
    verification_status: finalVerified ? "verified" : "mismatch",
    computed_value: `x^${powerRule.integrandPower}`,
    reason: finalVerified
      ? "Local power-rule check passed: differentiating the answer gives the selected integrand."
      : "Local power-rule check failed: the answer does not match the selected integrand.",
    steps: solution.steps.map((step) => verifyPowerRuleStep(step, powerRule.integrandPower)),
  };
}

function verifyPowerRuleStep(step: SolutionStep, integrandPower: number): VerifierStep {
  const antiderivativePower = integrandPower + 1;

  if (latexContainsIntegralSetup(step.latex, integrandPower)) {
    return {
      step_num: step.stepNum,
      verified: true,
      verification_status: "verified",
      computed_value: `x^${integrandPower}`,
      reason: "The setup uses the selected integrand.",
    };
  }

  if (
    latexContainsAntiderivative(step.latex, antiderivativePower, antiderivativePower) ||
    latexContainsPowerRuleIntermediate(step.latex, integrandPower)
  ) {
    return {
      step_num: step.stepNum,
      verified: true,
      verification_status: "verified",
      computed_value: `x^${integrandPower}`,
      reason: "This step matches the power-rule antiderivative.",
    };
  }

  if (looksLikeMathExpression(step.latex)) {
    return {
      step_num: step.stepNum,
      verified: false,
      verification_status: "mismatch",
      computed_value: `x^${integrandPower}`,
      reason: "This step does not match the expected power-rule antiderivative.",
    };
  }

  return {
    step_num: step.stepNum,
    verified: false,
    verification_status: "unverifiable",
    reason: "This step is not covered by the local verifier.",
  };
}

function detectPowerRuleIntegral(solution: Solution) {
  const source = [
    solution.problemText,
    solution.finalAnswer,
    ...solution.steps.map((step) => step.latex),
  ].join(" ");
  const normalized = normalizeMathText(source);
  const powerMatch = normalized.match(/(?:\\int|integral(?:of)?|integrate)[^a-z0-9]*(?:x\^?\{?(\d+)\}?|xsquared)/);

  if (!powerMatch) return null;

  const power = powerMatch[1] ? Number(powerMatch[1]) : 2;
  if (!Number.isFinite(power) || power < 0) return null;

  return { integrandPower: power };
}

function latexContainsIntegralSetup(latex: string, integrandPower: number) {
  const normalized = normalizeMathText(latex);
  return normalized.includes("\\int") && normalized.includes(`x^${integrandPower}`);
}

function latexContainsAntiderivative(latex: string, power: number, denominator: number) {
  const normalized = normalizeMathText(latex);
  const fracPattern = new RegExp(`(?:\\\\frac\\{?x\\^?\\{?${power}\\}?\\}?\\{?${denominator}\\}?|x\\^?\\{?${power}\\}?/${denominator})`);
  return fracPattern.test(normalized);
}

function latexContainsPowerRuleIntermediate(latex: string, integrandPower: number) {
  const normalized = normalizeMathText(latex);
  return normalized.includes(`x^${integrandPower}+1`) && normalized.includes(`${integrandPower}+1`);
}

function looksLikeMathExpression(value: string) {
  return /[x\d]|\\frac|\\int/.test(value);
}

function normalizeMathText(value: string) {
  return value
    .toLowerCase()
    .replace(/\\left|\\right|\\,|\\;/g, "")
    .replace(/\s+/g, "")
    .replace(/xsquared/g, "x^2")
    .replace(/xcubed/g, "x^3")
    .replace(/\^\{([^}]+)\}/g, "^$1");
}
