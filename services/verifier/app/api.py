from fastapi import FastAPI
from app.engine.responses import VerifyRequest, VerifyResponse, SolveStep, StepVerification, VerificationStatus
from app.engine.dispatch import verify_payload

app = FastAPI(title="InkSolver Verifier", version="0.1.0")

@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "true"}

@app.post("/verify", response_model=VerifyResponse)
def verify(payload: VerifyRequest) -> VerifyResponse:
    return verify_payload(payload)
