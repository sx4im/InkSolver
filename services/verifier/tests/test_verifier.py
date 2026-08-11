import os
import sys
import unittest

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.main import SolveStep, VerifyRequest, verify_payload


class VerifierTests(unittest.TestCase):
    def test_power_rule_integral_verifies(self):
        response = verify_payload(
            VerifyRequest(
                problem_text="Evaluate the indefinite integral of x squared.",
                subject="math",
                final_answer="\\frac{x^3}{3}+C",
                steps=[
                    SolveStep(step_num=1, latex="\\int x^2\\,dx"),
                    SolveStep(step_num=2, latex="\\frac{x^{2+1}}{2+1}+C"),
                    SolveStep(step_num=3, latex="\\frac{x^3}{3}+C"),
                ],
            ),
        )

        self.assertEqual(response.verification_status, "verified")
        self.assertTrue(response.verified)
        self.assertTrue(all(step.verification_status == "verified" for step in response.steps))

    def test_wrong_integral_mismatches(self):
        response = verify_payload(
            VerifyRequest(
                problem_text="Integrate x^2 dx.",
                subject="math",
                final_answer="x^3+C",
                steps=[SolveStep(step_num=1, latex="x^3+C")],
            ),
        )

        self.assertEqual(response.verification_status, "mismatch")
        self.assertFalse(response.verified)
        self.assertEqual(response.steps[0].verification_status, "mismatch")

    def test_derivative_verifies(self):
        response = verify_payload(
            VerifyRequest(
                problem_text="Differentiate x^3 with respect to x.",
                subject="math",
                final_answer="3x^2",
                steps=[SolveStep(step_num=1, latex="3x^2")],
            ),
        )

        self.assertEqual(response.verification_status, "verified")
        self.assertTrue(response.verified)

    def test_trig_derivative_verifies(self):
        response = verify_payload(
            VerifyRequest(
                problem_text="d/dx(sin x)",
                subject="math",
                final_answer="cos x",
                steps=[SolveStep(step_num=1, latex="\\cos x")],
            ),
        )

        self.assertEqual(response.verification_status, "verified")
        self.assertTrue(response.verified)
        self.assertEqual(response.computed_value, "cos(x)")

    def test_trig_derivative_mismatches(self):
        response = verify_payload(
            VerifyRequest(
                problem_text="\\frac{d}{dx}\\sin x",
                subject="math",
                final_answer="-\\cos x",
                steps=[SolveStep(step_num=1, latex="-\\cos x")],
            ),
        )

        self.assertEqual(response.verification_status, "mismatch")
        self.assertFalse(response.verified)
        self.assertEqual(response.computed_value, "cos(x)")

    def test_unsupported_problem_is_unverifiable(self):
        response = verify_payload(
            VerifyRequest(
                problem_text="Balance this chemical equation.",
                subject="chem",
                final_answer="2H_2 + O_2 -> 2H_2O",
                steps=[SolveStep(step_num=1, latex="2H_2 + O_2 -> 2H_2O")],
            ),
        )

        self.assertEqual(response.verification_status, "unverifiable")

    def test_limit_verifies(self):
        response = verify_payload(
            VerifyRequest(
                problem_text="\\lim_{x \\to 0} \\frac{\\sin x}{x}",
                subject="math",
                final_answer="1",
                steps=[SolveStep(step_num=1, latex="1")],
            ),
        )

        self.assertEqual(response.verification_status, "verified")
        self.assertTrue(response.verified)
        self.assertEqual(
            response.steps[0].reason,
            "This step matches the expected symbolic expression.",
        )

    def test_limit_mismatches(self):
        response = verify_payload(
            VerifyRequest(
                problem_text="\\lim_{x \\to 0} \\frac{\\sin x}{x}",
                subject="math",
                final_answer="0",
                steps=[SolveStep(step_num=1, latex="0")],
            ),
        )

        self.assertEqual(response.verification_status, "mismatch")
        self.assertFalse(response.verified)

    def test_limit_english_verifies(self):
        response = verify_payload(
            VerifyRequest(
                problem_text="limit of x^2 as x approaches 3",
                subject="math",
                final_answer="9",
                steps=[SolveStep(step_num=1, latex="9")],
            ),
        )

        self.assertEqual(response.verification_status, "verified")
        self.assertTrue(response.verified)

    def test_definite_integral_verifies(self):
        response = verify_payload(
            VerifyRequest(
                problem_text="\\int_{0}^{1} x^2 dx",
                subject="math",
                final_answer="\\frac{1}{3}",
                steps=[SolveStep(step_num=1, latex="\\frac{x^3}{3}\\Big|_0^1")],
            ),
        )

        self.assertEqual(response.verification_status, "verified")
        self.assertTrue(response.verified)
        self.assertEqual(response.computed_value, "1/3")

    def test_definite_integral_mismatches(self):
        response = verify_payload(
            VerifyRequest(
                problem_text="\\int_{0}^{1} x^2 dx",
                subject="math",
                final_answer="1",
                steps=[SolveStep(step_num=1, latex="1")],
            ),
        )

        self.assertEqual(response.verification_status, "mismatch")
        self.assertFalse(response.verified)

    def test_linear_system_verifies(self):
        response = verify_payload(
            VerifyRequest(
                problem_text="Solve the system of equations: x + y = 5 and 2x - y = 1",
                subject="math",
                final_answer="x = 2, y = 3",
                steps=[SolveStep(step_num=1, latex="x=2, y=3")],
            ),
        )

        self.assertEqual(response.verification_status, "verified")
        self.assertTrue(response.verified)

    def test_linear_system_mismatches(self):
        response = verify_payload(
            VerifyRequest(
                problem_text="Solve the system of equations: x + y = 5 and 2x - y = 1",
                subject="math",
                final_answer="x = 3, y = 2",
                steps=[SolveStep(step_num=1, latex="x=3, y=2")],
            ),
        )

        self.assertEqual(response.verification_status, "mismatch")
        self.assertFalse(response.verified)


if __name__ == "__main__":
    unittest.main()
