import test from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx-js-style";
import { formatLoanDisbursementWeekCell } from "../src/excel-format.ts";

function makeStyledWorkbook() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([["Payment summary", "Amount"], ["Sample", 1234]]);
  sheet.A1.s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "123456" } } };
  XLSX.utils.book_append_sheet(workbook, sheet, "Summary");
  return workbook;
}

test("styled Excel export supports both array and base64 output used by reports", () => {
  const arrayOutput = XLSX.write(makeStyledWorkbook(), { bookType: "xlsx", type: "array" });
  assert.ok(arrayOutput.byteLength > 0);
  assert.equal(Buffer.from(arrayOutput).subarray(0, 4).toString("hex"), "504b0304");

  const base64Output = XLSX.write(makeStyledWorkbook(), { bookType: "xlsx", type: "base64" });
  assert.equal(Buffer.from(base64Output, "base64").subarray(0, 4).toString("hex"), "504b0304");
});

test("formatLoanDisbursementWeekCell shows old balance, new loan, and installment on separate lines", () => {
  // Scenario 1: Customer has 1000 balance, renewed to 7000 (8400 total payable), no same-day installment
  const withoutInstallment = formatLoanDisbursementWeekCell({
    renewalClosureAmount: 1000,
    displayedAmount: 8400,
    regularPaidAmount: 0,
  });
  assert.equal(withoutInstallment, "1000\n8400");

  // Scenario 2: Customer has 1000 balance, renewed to 7000 (8400 total payable), pays 700 installment on loan taken day
  // Must show 1000 / 8400 / 700, NOT 1700 / 8400
  const withInstallment = formatLoanDisbursementWeekCell({
    renewalClosureAmount: 1000,
    displayedAmount: 8400,
    regularPaidAmount: 700,
  });
  assert.equal(withInstallment, "1000\n8400\n700");
  assert.notEqual(withInstallment, "1700\n8400");

  // Scenario 3: Brand new loan (no renewal closure) with same-day installment
  const newLoanWithInstallment = formatLoanDisbursementWeekCell({
    renewalClosureAmount: 0,
    displayedAmount: 8400,
    regularPaidAmount: 700,
  });
  assert.equal(newLoanWithInstallment, "8400\n700");

  // Scenario 4: With carry forward note
  const withNote = formatLoanDisbursementWeekCell({
    renewalClosureAmount: 1000,
    displayedAmount: 8400,
    regularPaidAmount: 700,
    carryForwardNote: "Paid till moved: ₹500\nAmount given: ₹10000",
  });
  assert.equal(withNote, "Paid till moved: ₹500\nAmount given: ₹10000\n1000\n8400\n700");
});

