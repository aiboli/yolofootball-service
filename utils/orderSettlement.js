const FINISHED_FIXTURE_STATES = new Set([
  "FT",
  "AET",
  "PEN",
  "CANC",
  "ABD",
  "AWD",
  "WO",
]);

const normalizeBetResult = (selection) => {
  if (selection.bet_result !== undefined) {
    return Number(selection.bet_result);
  }

  if (selection.selection_code !== undefined) {
    return Number(selection.selection_code);
  }

  if (selection.selection) {
    const normalizedSelection = String(selection.selection).toLowerCase();
    if (normalizedSelection === "home") {
      return 0;
    }
    if (normalizedSelection === "draw") {
      return 1;
    }
    if (normalizedSelection === "away") {
      return 2;
    }
  }

  return NaN;
};

const calculateCombinedOdd = (selections) => {
  return selections.reduce((total, selection) => {
    return total * (parseFloat(selection.odd_rate) || 1);
  }, 1);
};

const normalizeSelectionsFromOrder = (order) => {
  if (Array.isArray(order.selections) && order.selections.length > 0) {
    return order.selections;
  }

  if (order.fixture_id === undefined) {
    return [];
  }

  return [
    {
      fixture_id: order.fixture_id,
      bet_result: Number(order.bet_result),
      odd_rate: parseFloat(order.odd_rate),
      fixture_state: order.fixture_state || "notstarted",
      market: order.market || "match_winner",
    },
  ];
};

const getFixtureStatusShort = (fixtureDetails) => {
  if (!fixtureDetails || !fixtureDetails.fixture || !fixtureDetails.fixture.status) {
    return null;
  }

  return fixtureDetails.fixture.status.short || null;
};

const isFixtureFinished = (fixtureDetails) => {
  const statusShort = getFixtureStatusShort(fixtureDetails);
  return statusShort ? FINISHED_FIXTURE_STATES.has(statusShort) : false;
};

const getFixtureScore = (fixtureDetails) => {
  if (!fixtureDetails) {
    return null;
  }

  const home =
    fixtureDetails.goals?.home ??
    fixtureDetails.score?.fulltime?.home ??
    fixtureDetails.score?.full_time?.home;
  const away =
    fixtureDetails.goals?.away ??
    fixtureDetails.score?.fulltime?.away ??
    fixtureDetails.score?.full_time?.away;

  if (!Number.isFinite(Number(home)) || !Number.isFinite(Number(away))) {
    return null;
  }

  return {
    home: Number(home),
    away: Number(away),
  };
};

const resolveMatchWinnerResult = (fixtureDetails) => {
  const score = getFixtureScore(fixtureDetails);
  if (!score) {
    return null;
  }

  if (score.home > score.away) {
    return 0;
  }
  if (score.home === score.away) {
    return 1;
  }
  return 2;
};

const gradeSelection = (selection, fixtureMap) => {
  const fixtureDetails = fixtureMap[selection.fixture_id];
  const selectionWithFixture = {
    ...selection,
    fixture_details: fixtureDetails,
  };

  if (!fixtureDetails) {
    return {
      ...selectionWithFixture,
      fixture_result: "unknown",
      is_settled: false,
    };
  }

  if (!isFixtureFinished(fixtureDetails)) {
    return {
      ...selectionWithFixture,
      fixture_state:
        selection.fixture_state || getFixtureStatusShort(fixtureDetails) || "notstarted",
      fixture_result: "pending",
      is_settled: false,
    };
  }

  let actualResult = null;
  if ((selection.market || "match_winner") === "match_winner") {
    actualResult = resolveMatchWinnerResult(fixtureDetails);
  }

  if (!Number.isFinite(actualResult)) {
    return {
      ...selectionWithFixture,
      fixture_state: getFixtureStatusShort(fixtureDetails) || selection.fixture_state,
      fixture_result: "void",
      is_settled: true,
    };
  }

  const expectedResult = Number(selection.bet_result);
  const fixtureResult = expectedResult === actualResult ? "won" : "lost";

  return {
    ...selectionWithFixture,
    fixture_state: getFixtureStatusShort(fixtureDetails) || selection.fixture_state,
    actual_result: actualResult,
    fixture_result: fixtureResult,
    is_settled: true,
  };
};

const calculateOrderOutcome = (order, fixtureMap) => {
  const selections = normalizeSelectionsFromOrder(order);

  if (!selections.length) {
    return {
      ...order,
      selections: [],
      selection_details: [],
      order_result: "unknown",
      is_settled: false,
      settled_win_return: null,
    };
  }

  const selectionDetails = selections.map((selection) =>
    gradeSelection(selection, fixtureMap)
  );
  const hasLostSelection = selectionDetails.some(
    (selection) => selection.fixture_result === "lost"
  );
  const allSelectionsSettled = selectionDetails.every(
    (selection) => selection.is_settled
  );
  const allSelectionsWon =
    allSelectionsSettled &&
    selectionDetails.every((selection) => selection.fixture_result === "won");

  const numericWinReturn = Number(order.win_return);
  const numericStake = Number(order.odd_mount);

  let orderResult = "pending";
  let settledWinReturn = null;

  if (hasLostSelection) {
    orderResult = "lost";
    settledWinReturn = 0;
  } else if (allSelectionsWon) {
    orderResult = "won";
    settledWinReturn = Number.isFinite(numericWinReturn)
      ? numericWinReturn
      : null;
  } else if (allSelectionsSettled) {
    orderResult = "void";
    settledWinReturn = Number.isFinite(numericStake) ? numericStake : null;
  }

  return {
    ...order,
    order_type:
      order.order_type || (selectionDetails.length > 1 ? "accumulator" : "single"),
    selection_count: order.selection_count || selectionDetails.length,
    selections,
    selection_details: selectionDetails,
    fixture_details:
      selectionDetails[0].fixture_details || order.fixture_details,
    order_result: orderResult,
    is_settled: allSelectionsSettled,
    settled_win_return: settledWinReturn,
  };
};

const normalizeOrderPayload = (body) => {
  if (Array.isArray(body.selections) && body.selections.length > 0) {
    const selections = body.selections.map((selection) => ({
      fixture_id: selection.fixture_id,
      bet_result: normalizeBetResult(selection),
      odd_rate: parseFloat(selection.odd_rate),
      fixture_state: selection.fixture_state || "notstarted",
      market: selection.market || "match_winner",
      selection: selection.selection,
    }));

    return {
      orderType:
        body.order_type || (selections.length > 1 ? "accumulator" : "single"),
      stake: parseFloat(body.stake),
      combinedOdd:
        body.combined_odd !== undefined
          ? parseFloat(body.combined_odd)
          : calculateCombinedOdd(selections),
      winReturn:
        body.win_return !== undefined ? parseFloat(body.win_return) : null,
      selections,
    };
  }

  return {
    orderType: "single",
    stake: parseFloat(body.odd_mount),
    combinedOdd: parseFloat(body.odd_rate),
    winReturn: body.win_return !== undefined ? parseFloat(body.win_return) : null,
    selections: [
      {
        fixture_id: body.fixture_id,
        bet_result: Number(body.bet_result),
        odd_rate: parseFloat(body.odd_rate),
        fixture_state: body.fixture_state || "notstarted",
        market: "match_winner",
      },
    ],
  };
};

const isOrderPayloadValid = (normalizedPayload) => {
  if (!normalizedPayload.selections.length) {
    return false;
  }

  if (!Number.isFinite(normalizedPayload.stake) || normalizedPayload.stake <= 0) {
    return false;
  }

  if (!Number.isFinite(normalizedPayload.combinedOdd)) {
    return false;
  }

  if (
    normalizedPayload.winReturn !== null &&
    !Number.isFinite(normalizedPayload.winReturn)
  ) {
    return false;
  }

  const seenFixtureIds = new Set();
  return normalizedPayload.selections.every((selection) => {
    if (
      selection.fixture_id === undefined ||
      !Number.isFinite(selection.bet_result) ||
      !Number.isFinite(selection.odd_rate)
    ) {
      return false;
    }

    if (seenFixtureIds.has(selection.fixture_id)) {
      return false;
    }

    seenFixtureIds.add(selection.fixture_id);
    return true;
  });
};

module.exports = {
  calculateCombinedOdd,
  normalizeOrderPayload,
  isOrderPayloadValid,
  normalizeSelectionsFromOrder,
  gradeSelection,
  calculateOrderOutcome,
  getFixtureScore,
  resolveMatchWinnerResult,
};
