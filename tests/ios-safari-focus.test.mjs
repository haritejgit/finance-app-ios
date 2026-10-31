import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("global web styles prevent Safari focus zoom on inputs and text areas", async () => {
  const css = await readFile(new URL("../app/global.css", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/_layout.tsx", import.meta.url), "utf8");
  assert.match(css, /input\s*,\s*textarea\s*\{[^}]*font-size:\s*16px\s*!important/s);
  assert.match(layout, /import\s+["']\.\/global\.css["']/);
});
