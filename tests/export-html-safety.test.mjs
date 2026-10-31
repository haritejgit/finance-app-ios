import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const exportsSource = await readFile(new URL("../src/exports.ts", import.meta.url), "utf8");

test("JPG export renders error text and download URLs without HTML interpolation", () => {
  assert.match(exportsSource, /copy\.textContent = message/);
  assert.match(exportsSource, /downloadLink\.href = url/);
  assert.match(exportsSource, /preview\.src = url/);
  assert.match(exportsSource, /data-export-filename="\$\{escapeHtml\(jpgFilename\)\}"/);
  assert.doesNotMatch(exportsSource, /overlay\.innerHTML/);
  assert.doesNotMatch(exportsSource, /var filename = \$\{JSON\.stringify\(jpgFilename\)\}/);
});
