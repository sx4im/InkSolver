# Re-export public symbols so tests and consumers continue to work seamlessly
from app.api import app, VerifyRequest, VerifyResponse, SolveStep, StepVerification, VerificationStatus
from app.engine.dispatch import verify_payload

__all__ = [
    "app",
    "VerifyRequest",
    "VerifyResponse",
    "SolveStep",
    "StepVerification",
    "VerificationStatus",
    "verify_payload",
]
