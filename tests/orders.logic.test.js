const test = require("node:test");
const assert = require("node:assert/strict");

const settlement = require("../utils/orderSettlement");

test("normalizeOrderPayload accepts multi-selection orders without win_return", () => {
  const payload = settlement.normalizeOrderPayload({
    stake: "10",
    selections: [
      { fixture_id: 1, bet_result: 0, odd_rate: "1.5" },
      { fixture_id: 2, bet_result: 2, odd_rate: "2.0" },
    ],
  });

  assert.equal(payload.orderType, "accumulator");
  assert.equal(payload.selections.length, 2);
  assert.equal(payload.combinedOdd, 3);
  assert.equal(payload.winReturn, null);
  assert.equal(settlement.isOrderPayloadValid(payload), true);
});

test("calculateOrderOutcome settles an accumulator as won when all selections win", () => {
  const order = {
    odd_mount: 10,
    win_return: 45,
    selections: [
      { fixture_id: 101, bet_result: 0, odd_rate: 1.5, market: "match_winner" },
      { fixture_id: 202, bet_result: 2, odd_rate: 3.0, market: "match_winner" },
    ],
  };
  const fixtureMap = {
    101: {
      fixture: { status: { short: "FT" } },
      goals: { home: 2, away: 1 },
    },
    202: {
      fixture: { status: { short: "FT" } },
      goals: { home: 0, away: 1 },
    },
  };

  const gradedOrder = settlement.calculateOrderOutcome(order, fixtureMap);

  assert.equal(gradedOrder.order_result, "won");
  assert.equal(gradedOrder.is_settled, true);
  assert.equal(gradedOrder.settled_win_return, 45);
  assert.equal(gradedOrder.selection_details[0].fixture_result, "won");
  assert.equal(gradedOrder.selection_details[1].fixture_result, "won");
});

test("calculateOrderOutcome settles an accumulator as lost when any selection loses", () => {
  const order = {
    odd_mount: 10,
    win_return: 30,
    selections: [
      { fixture_id: 101, bet_result: 0, odd_rate: 1.5, market: "match_winner" },
      { fixture_id: 202, bet_result: 2, odd_rate: 2.0, market: "match_winner" },
    ],
  };
  const fixtureMap = {
    101: {
      fixture: { status: { short: "FT" } },
      goals: { home: 2, away: 1 },
    },
    202: {
      fixture: { status: { short: "FT" } },
      goals: { home: 1, away: 1 },
    },
  };

  const gradedOrder = settlement.calculateOrderOutcome(order, fixtureMap);

  assert.equal(gradedOrder.order_result, "lost");
  assert.equal(gradedOrder.is_settled, true);
  assert.equal(gradedOrder.settled_win_return, 0);
  assert.equal(gradedOrder.selection_details[1].fixture_result, "lost");
});

test("calculateOrderOutcome keeps an order pending until every selection is finished", () => {
  const order = {
    odd_mount: 10,
    win_return: 30,
    selections: [
      { fixture_id: 101, bet_result: 0, odd_rate: 1.5, market: "match_winner" },
      { fixture_id: 202, bet_result: 2, odd_rate: 2.0, market: "match_winner" },
    ],
  };
  const fixtureMap = {
    101: {
      fixture: { status: { short: "FT" } },
      goals: { home: 2, away: 1 },
    },
    202: {
      fixture: { status: { short: "NS" } },
      goals: { home: null, away: null },
    },
  };

  const gradedOrder = settlement.calculateOrderOutcome(order, fixtureMap);

  assert.equal(gradedOrder.order_result, "pending");
  assert.equal(gradedOrder.is_settled, false);
  assert.equal(gradedOrder.settled_win_return, null);
  assert.equal(gradedOrder.selection_details[0].fixture_result, "won");
  assert.equal(gradedOrder.selection_details[1].fixture_result, "pending");
});
