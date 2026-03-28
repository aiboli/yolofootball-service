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

const LEADERBOARD_LIMIT = 25;

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

const sortPredictionsByCreatedAtDesc = (predictions) =>
  [...(Array.isArray(predictions) ? predictions : [])].sort(
    (left, right) =>
      new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime()
  );

const hydratePredictionHistory = (predictionHistory, fixtureMap) =>
  sortPredictionsByCreatedAtDesc(
    (Array.isArray(predictionHistory) ? predictionHistory : []).map((prediction) =>
      hydratePrediction(prediction, fixtureMap)
    )
  );

const calculateCurrentStreak = (predictions) => {
  const settledPredictions = sortPredictionsByCreatedAtDesc(
    (Array.isArray(predictions) ? predictions : []).filter((prediction) => prediction?.is_settled)
  );
  let streak = 0;

  for (const prediction of settledPredictions) {
    if (prediction.result !== "won") {
      break;
    }
    streak += 1;
  }

  return streak;
};

const calculateBestStreak = (predictions) => {
  const settledPredictions = [...(Array.isArray(predictions) ? predictions : [])]
    .filter((prediction) => prediction?.is_settled)
    .sort(
      (left, right) =>
        new Date(left?.created_at || 0).getTime() - new Date(right?.created_at || 0).getTime()
    );

  let bestStreak = 0;
  let currentStreak = 0;

  settledPredictions.forEach((prediction) => {
    if (prediction.result === "won") {
      currentStreak += 1;
      bestStreak = Math.max(bestStreak, currentStreak);
      return;
    }

    currentStreak = 0;
  });

  return bestStreak;
};

const buildPredictionSummary = (predictions, now = new Date()) => {
  const allPredictions = sortPredictionsByCreatedAtDesc(predictions);
  const settledPredictions = allPredictions.filter((prediction) => prediction?.is_settled);
  const wins = settledPredictions.filter((prediction) => prediction.result === "won").length;
  const losses = settledPredictions.filter((prediction) => prediction.result === "lost").length;
  const pending = allPredictions.length - settledPredictions.length;
  const accuracy = settledPredictions.length
    ? Number(((wins / settledPredictions.length) * 100).toFixed(1))
    : 0;
  const currentStreak = calculateCurrentStreak(allPredictions);
  const bestStreak = calculateBestStreak(allPredictions);
  const recentForm = settledPredictions.slice(0, 5).map((prediction) => prediction.result);
  const weeklyThreshold = new Date(now);
  weeklyThreshold.setDate(weeklyThreshold.getDate() - 7);
  const weeklySettledPredictions = settledPredictions.filter(
    (prediction) => new Date(prediction?.created_at || 0).getTime() >= weeklyThreshold.getTime()
  );
  const weeklyWins = weeklySettledPredictions.filter(
    (prediction) => prediction.result === "won"
  ).length;
  const weeklyAccuracy = weeklySettledPredictions.length
    ? Number(((weeklyWins / weeklySettledPredictions.length) * 100).toFixed(1))
    : 0;

  return {
    totalPredictions: allPredictions.length,
    settledPredictions: settledPredictions.length,
    wins,
    losses,
    pending,
    accuracy,
    currentStreak,
    bestStreak,
    recentForm,
    weeklyWins,
    weeklySettledPredictions: weeklySettledPredictions.length,
    weeklyAccuracy,
    lastPredictionAt: allPredictions[0]?.created_at || null,
    lastSettledAt: settledPredictions[0]?.created_at || null,
  };
};

const buildLeaderboardEntry = (userRecord, predictions, now = new Date()) => {
  const summary = buildPredictionSummary(predictions, now);
  if (summary.settledPredictions === 0) {
    return null;
  }

  return {
    userName: userRecord?.user_name || "",
    predictionSummary: summary,
  };
};

const sortLeaderboardEntries = (entries) =>
  [...(Array.isArray(entries) ? entries : [])].sort((left, right) => {
    const summaryDelta =
      right.predictionSummary.accuracy - left.predictionSummary.accuracy;
    if (summaryDelta !== 0) {
      return summaryDelta;
    }

    const streakDelta =
      right.predictionSummary.currentStreak - left.predictionSummary.currentStreak;
    if (streakDelta !== 0) {
      return streakDelta;
    }

    const winsDelta = right.predictionSummary.wins - left.predictionSummary.wins;
    if (winsDelta !== 0) {
      return winsDelta;
    }

    const volumeDelta =
      right.predictionSummary.settledPredictions -
      left.predictionSummary.settledPredictions;
    if (volumeDelta !== 0) {
      return volumeDelta;
    }

    return (
      new Date(right.predictionSummary.lastSettledAt || 0).getTime() -
      new Date(left.predictionSummary.lastSettledAt || 0).getTime()
    );
  });

const sortHotPlayers = (entries) =>
  [...(Array.isArray(entries) ? entries : [])].sort((left, right) => {
    const weeklyWinsDelta =
      right.predictionSummary.weeklyWins - left.predictionSummary.weeklyWins;
    if (weeklyWinsDelta !== 0) {
      return weeklyWinsDelta;
    }

    const weeklyAccuracyDelta =
      right.predictionSummary.weeklyAccuracy - left.predictionSummary.weeklyAccuracy;
    if (weeklyAccuracyDelta !== 0) {
      return weeklyAccuracyDelta;
    }

    const streakDelta =
      right.predictionSummary.currentStreak - left.predictionSummary.currentStreak;
    if (streakDelta !== 0) {
      return streakDelta;
    }

    return (
      new Date(right.predictionSummary.lastPredictionAt || 0).getTime() -
      new Date(left.predictionSummary.lastPredictionAt || 0).getTime()
    );
  });

const addRanks = (entries) =>
  (Array.isArray(entries) ? entries : []).map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));

const buildPredictionLeaderboard = (userRecords, fixtureMap, now = new Date()) => {
  const entries = (Array.isArray(userRecords) ? userRecords : [])
    .map((userRecord) =>
      buildLeaderboardEntry(
        userRecord,
        hydratePredictionHistory(userRecord?.prediction_history || [], fixtureMap),
        now
      )
    )
    .filter((entry) => !!entry);

  const leaderboard = addRanks(sortLeaderboardEntries(entries)).slice(0, LEADERBOARD_LIMIT);
  const hotThisWeek = addRanks(
    sortHotPlayers(entries).filter(
      (entry) => entry.predictionSummary.weeklySettledPredictions > 0
    )
  ).slice(0, 10);

  return {
    leaderboard,
    hotThisWeek,
  };
};

module.exports = {
  FINISHED_FIXTURE_STATES,
  LEADERBOARD_LIMIT,
  RESULT_LABELS,
  addRanks,
  buildLeaderboardEntry,
  buildPredictionLeaderboard,
  buildPredictionSummary,
  calculateBestStreak,
  calculateCurrentStreak,
  hydratePrediction,
  hydratePredictionHistory,
  isFixtureFinished,
  normalizePredictionPayload,
  sortHotPlayers,
  sortLeaderboardEntries,
  sortPredictionsByCreatedAtDesc,
};
