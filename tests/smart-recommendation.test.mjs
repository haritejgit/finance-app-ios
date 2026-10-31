import test from "node:test";
import assert from "node:assert/strict";
import { isValidCustomRecommendation, nextRecommendationTap } from "../src/smart-recommendation.ts";

test("first two recommendation taps preserve the current action and third opens editor", () => {
  let state = { count: 0, lastTap: 0 };
  const first = nextRecommendationTap(state, 1000); state = first.state;
  const second = nextRecommendationTap(state, 1300); state = second.state;
  const third = nextRecommendationTap(state, 1600);
  assert.equal(first.shouldOpenEditor, false);
  assert.equal(second.shouldOpenEditor, false);
  assert.equal(third.shouldOpenEditor, true);
  assert.equal(third.state.count, 0);
});

test("tap sequence resets after inactivity", () => {
  const result = nextRecommendationTap({ count: 2, lastTap: 1000 }, 2000);
  assert.equal(result.shouldOpenEditor, false);
  assert.equal(result.state.count, 1);
});

test("custom amount validation rejects zero, fractions, negatives and unsupported values", () => {
  assert.equal(isValidCustomRecommendation(200000), true);
  assert.equal(isValidCustomRecommendation(0), false);
  assert.equal(isValidCustomRecommendation(-1), false);
  assert.equal(isValidCustomRecommendation(1.5), false);
  assert.equal(isValidCustomRecommendation(50_000_001), false);
});
