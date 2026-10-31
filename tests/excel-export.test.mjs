import test from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx-js-style";

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
