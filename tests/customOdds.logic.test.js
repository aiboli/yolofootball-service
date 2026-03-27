const test = require("node:test");
const assert = require("node:assert/strict");

const customOdds = require("../utils/customOdds");

test("normalizeCreatePayload accepts a valid 1X2 custom odds payload", () => {
  const payload = customOdds.normalizeCreatePayload({
    fixture_id: "2026-03-27@915340",
    odd_data: {
      market: "match_winner",
      options: [
        { result: 0, label: "Home", odd: "2.55" },
        { result: 1, label: "Draw", odd: "3.20" },
        { result: 2, label: "Away", odd: "2.85" },
      ],
    },
  });

  assert.equal(payload.fixtureId, 915340);
  assert.deepEqual(payload.oddData, {
    market: "match_winner",
    options: [
      { result: 0, label: "Home", odd: 2.55 },
      { result: 1, label: "Draw", odd: 3.2 },
      { result: 2, label: "Away", odd: 2.85 },
    ],
  });
});

test("normalizeCreatePayload rejects malformed option sets", () => {
  const payload = customOdds.normalizeCreatePayload({
    fixture_id: 915340,
    odd_data: {
      market: "match_winner",
      options: [
        { result: 0, label: "Home", odd: 2.55 },
        { result: 1, label: "Draw", odd: 3.2 },
      ],
    },
  });

  assert.equal(payload.fixtureId, 915340);
  assert.equal(payload.oddData, null);
});

test("normalizeSearchPayload detects invalid fixture ids", () => {
  const payload = customOdds.normalizeSearchPayload({
    fixture_ids: [915340, "bad-id"],
    status: "active",
  });

  assert.deepEqual(payload.fixtureIds, [915340]);
  assert.equal(payload.hasInvalidFixtureIds, true);
});

test("normalizeFixtureState maps upstream fixture status codes", () => {
  assert.equal(
    customOdds.normalizeFixtureState({ fixture: { status: { short: "NS" } } }),
    "notstarted"
  );
  assert.equal(
    customOdds.normalizeFixtureState({ fixture: { status: { short: "FT" } } }),
    "finished"
  );
  assert.equal(
    customOdds.normalizeFixtureState({ fixture: { status: { short: "CANC" } } }),
    "canceled"
  );
});
