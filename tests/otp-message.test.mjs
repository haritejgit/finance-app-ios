import test from "node:test";
import assert from "node:assert/strict";
import { formatLoanOtpMessage } from "../src/otp-format.ts";

test("formats loan approval OTP message with valid principal amount", () => {
  const result = formatLoanOtpMessage({
    loanAmount: 10000,
    customerName: "Ramesh Kumar",
    purpose: "new_loan",
  });

  assert.equal(
    result.promptText,
    "If you want to approve loan for ₹10,000 then share this OTP to our agent."
  );
  assert.ok(result.shareMessage.includes("Dear Ramesh Kumar,"));
  assert.ok(result.shareMessage.includes("If you want to approve loan for ₹10,000 then share this OTP to our agent."));
  assert.ok(result.shareMessage.includes("- Karthikeya Finance"));
});

test("formats loan renewal approval OTP message", () => {
  const result = formatLoanOtpMessage({
    loanAmount: "12000",
    customerName: "Lakshmi Devi",
    purpose: "renewal",
  });

  assert.equal(
    result.promptText,
    "If you want to approve loan renewal for ₹12,000 then share this OTP to our agent."
  );
  assert.ok(result.shareMessage.includes("Dear Lakshmi Devi,"));
  assert.ok(result.shareMessage.includes("If you want to approve loan renewal for ₹12,000 then share this OTP to our agent."));
});

test("formats OTP message gracefully when loan amount is not provided", () => {
  const result = formatLoanOtpMessage({
    loanAmount: "",
    purpose: "new_loan",
  });

  assert.equal(
    result.promptText,
    "If you want to approve loan then share this OTP to our agent."
  );
  assert.ok(result.shareMessage.includes("Dear Customer,"));
});

test("includes OTP code in shareMessage when provided", () => {
  const result = formatLoanOtpMessage({
    loanAmount: 7000,
    customerName: "Suresh",
    purpose: "new_loan",
    otpCode: "654321",
  });

  assert.equal(
    result.promptText,
    "If you want to approve loan for ₹7,000 then share this OTP to our agent."
  );
  assert.ok(result.shareMessage.includes("Your OTP is 654321."));
});
