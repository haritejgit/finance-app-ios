import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Colors, darkColors } from "../src/theme.ts";

const rootHtml = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const expoHtml = await readFile(new URL("../app/+html.tsx", import.meta.url), "utf8");

test("web startup applies the saved or system theme using the design-system colors", () => {
  assert.match(rootHtml, /localStorage\.getItem\('finance_app_theme'\)/);
  assert.match(rootHtml, /matchMedia\('\(prefers-color-scheme: dark\)'\)/);
  assert.match(rootHtml, /isDark \? 'dark' : 'light'/);
  const normalizedHtml = rootHtml.toLowerCase();
  for (const color of [Colors.bg, Colors.nearBlack, darkColors.background, darkColors.text]) {
    assert.ok(normalizedHtml.includes(color.toLowerCase()), `expected initial web theme to use ${color}`);
  }
  assert.match(rootHtml, /viewport-fit=cover/);
  assert.doesNotMatch(rootHtml, /#root\s*\{[^}]*max-width:\s*430px/);
  assert.doesNotMatch(expoHtml, /#root\s*\{[^}]*max-width:\s*430px/);
});

test("text fields avoid focus zoom without disabling browser zoom", () => {
  assert.match(rootHtml, /input,\s*textarea\s*\{\s*font-size: 16px !important;/);
  assert.doesNotMatch(rootHtml, /user-scalable\s*=\s*no|max-scale\s*=\s*1/);
});
