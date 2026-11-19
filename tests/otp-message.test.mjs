import test from "node:test";
import assert from "node:assert/strict";
import { formatLoanOtpMessage } from "../src/otp-format.ts";

test("formats loan approval OTP message with valid principal amount and OTP code", () => {
  const result = formatLoanOtpMessage({
    loanAmount: 10000,
    customerName: "Ramesh Kumar",
    purpose: "new_loan",
    otpCode: "582914",
  });

  assert.equal(
    result.promptText,
    "If you want to approve loan for ₹10,000 then share this OTP to our agent."
  );
  assert.equal(
    result.customerMessage,
    "If you want to approve loan for ₹10,000 then share this OTP: 582914 to our agent. - Karthikeya Finance"
  );
  assert.ok(result.shareMessage.includes("Dear Ramesh Kumar,"));
  assert.ok(result.shareMessage.includes("If you want to approve loan for ₹10,000 then share this OTP: 582914 to our agent. - Karthikeya Finance"));
});

test("formats loan renewal approval OTP message", () => {
  const result = formatLoanOtpMessage({
    loanAmount: "12000",
    customerName: "Lakshmi Devi",
    purpose: "renewal",
    otpCode: "948102",
  });

  assert.equal(
    result.promptText,
    "If you want to approve loan renewal for ₹12,000 then share this OTP to our agent."
  );
  assert.equal(
    result.customerMessage,
    "If you want to approve loan renewal for ₹12,000 then share this OTP: 948102 to our agent. - Karthikeya Finance"
  );
  assert.ok(result.shareMessage.includes("Dear Lakshmi Devi,"));
});

test("formats OTP message gracefully when loan amount is not provided", () => {
  const result = formatLoanOtpMessage({
    loanAmount: "",
    purpose: "new_loan",
    otpCode: "123456",
  });

  assert.equal(
    result.promptText,
    "If you want to approve loan then share this OTP to our agent."
  );
  assert.equal(
    result.customerMessage,
    "If you want to approve loan then share this OTP: 123456 to our agent. - Karthikeya Finance"
  );
});
