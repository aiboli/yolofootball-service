const { resolveMatchWinnerResult } = require("./orderSettlement");

const FINISHED_FIXTURE_STATES = new Set([
  "FT",
  "AET",
  "PEN",
  "CANC",
  "ABD",
  "AWD",
  "WO",
]);

const RESULT_LABELS = {
  0: "Home",
  1: "Draw",
  2: "Away",
};

const normalizePredictionPayload = (body) => {
  const fixtureId = Number.parseInt(body?.fixture_id, 10);
  const predictedResult = Number.parseInt(
    body?.predicted_result ?? body?.selection_code,
    10
  );

  if (!Number.isInteger(fixtureId) || !Number.isInteger(predictedResult)) {
    return null;
  }

  return {
    fixture_id: fixtureId,
    market: "match_winner",
    predicted_result: predictedResult,
    predicted_label: RESULT_LABELS[predictedResult] || null,
    fixture_state: body?.fixture_state || "notstarted",
    created_at: body?.created_at || new Date().toISOString(),
  };
};

const isFixtureFinished = (fixtureDetails) => {
  const statusShort = fixtureDetails?.fixture?.status?.short;
  return statusShort ? FINISHED_FIXTURE_STATES.has(statusShort) : false;
};

const hydratePrediction = (prediction, fixtureMap) => {
  const fixtureDetails = fixtureMap?.[prediction.fixture_id] || null;
  const fixtureState =
    fixtureDetails?.fixture?.status?.short || prediction.fixture_state || "notstarted";

  if (!fixtureDetails) {
    return {
      ...prediction,
      fixture_state: fixtureState,
      fixture: null,
      result: "pending",
      is_settled: false,
      actual_result: null,
    };
  }

  if (!isFixtureFinished(fixtureDetails)) {
    return {
      ...prediction,
      fixture_state: fixtureState,
      fixture: fixtureDetails,
      result: "pending",
      is_settled: false,
      actual_result: null,
    };
  }

  const actualResult = resolveMatchWinnerResult(fixtureDetails);
  const result =
    Number.isInteger(actualResult) && actualResult === prediction.predicted_result
      ? "won"
      : "lost";

  return {
    ...prediction,
    fixture_state: fixtureState,
    fixture: fixtureDetails,
    result,
    is_settled: Number.isInteger(actualResult),
    actual_result: Number.isInteger(actualResult) ? actualResult : null,
  };
};

const hydratePredictionHistory = (predictionHistory, fixtureMap) =>
  (Array.isArray(predictionHistory) ? predictionHistory : [])
    .map((prediction) => hydratePrediction(prediction, fixtureMap))
    .sort(
      (left, right) =>
        new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime()
    );

module.exports = {
  RESULT_LABELS,
  normalizePredictionPayload,
  hydratePrediction,
  hydratePredictionHistory,
};
