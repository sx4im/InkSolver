from pydantic import BaseModel, Field
from typing import Literal

VerificationStatus = Literal["verified", "unverifiable", "mismatch"]

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
