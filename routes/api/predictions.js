var express = require("express");
var router = express.Router();
var ENDPOINT_SELETOR = require("../../endpoints/endpoints");
var axios = require("axios");
const authentication = require("../../middlewares/authentication");
const { getUserDataFromRequest } = require("../../utils/auth");
const { getErrorMessage } = require("../../utils/api");
const {
  buildPredictionLeaderboard,
  buildPredictionSummary,
  normalizePredictionPayload,
  hydratePredictionHistory,
} = require("../../utils/predictions");

const getDatacenterBaseUrl = (app) =>
  `http://${ENDPOINT_SELETOR(app.get("env"))}`;

const fetchUserRecord = async (app, userName) => {
  const result = await axios.get(
    `${getDatacenterBaseUrl(app)}/user?user_name=${encodeURIComponent(userName)}`
  );
  return result?.data || null;
};

const fetchFixtureMap = async (app) => {
  const fixtureResult = await axios.get(`${getDatacenterBaseUrl(app)}/fixtures/`);
  const fixtureMap = {};

  if (fixtureResult && Array.isArray(fixtureResult.data)) {
    fixtureResult.data.forEach((fixture) => {
      fixtureMap[fixture.fixture.id] = fixture;
    });
  }

  return fixtureMap;
};

const updateUserRecord = async (app, userName, payload) => {
  const result = await axios.put(
    `${getDatacenterBaseUrl(app)}/user/${encodeURIComponent(userName)}`,
    payload
  );
  return result?.data || null;
};

const fetchUsersWithPredictions = async (app) => {
  const result = await axios.get(`${getDatacenterBaseUrl(app)}/user/all?has_predictions=true`);
  return Array.isArray(result?.data) ? result.data : [];
};

const serializePrediction = (prediction) => ({
  id: prediction.id || `${prediction.fixture_id}-${prediction.created_at || "prediction"}`,
  fixtureId: Number(prediction.fixture_id),
  predictedResult: Number(prediction.predicted_result),
  predictedLabel: prediction.predicted_label || null,
  fixtureState: prediction.fixture_state || "notstarted",
  createdAt: prediction.created_at || null,
  result: prediction.result || "pending",
  isSettled: !!prediction.is_settled,
  actualResult:
    prediction.actual_result !== undefined ? Number(prediction.actual_result) : null,
  fixture: prediction.fixture
    ? {
        id: prediction.fixture.fixture?.id ?? null,
        date: prediction.fixture.fixture?.date ?? null,
        status: prediction.fixture.fixture?.status?.short ?? null,
        league: prediction.fixture.league
          ? {
              id: prediction.fixture.league.id ?? null,
              name: prediction.fixture.league.name ?? null,
              logo: prediction.fixture.league.logo ?? null,
            }
          : null,
        teams:
          prediction.fixture.teams && prediction.fixture.teams.home && prediction.fixture.teams.away
            ? {
                home: {
                  id: prediction.fixture.teams.home.id ?? null,
                  name: prediction.fixture.teams.home.name ?? null,
                  logo: prediction.fixture.teams.home.logo ?? null,
                },
                away: {
                  id: prediction.fixture.teams.away.id ?? null,
                  name: prediction.fixture.teams.away.name ?? null,
                  logo: prediction.fixture.teams.away.logo ?? null,
                },
              }
            : null,
      }
    : null,
});

const serializePredictionSummary = (summary) => ({
  totalPredictions: Number(summary?.totalPredictions || 0),
  settledPredictions: Number(summary?.settledPredictions || 0),
  wins: Number(summary?.wins || 0),
  losses: Number(summary?.losses || 0),
  pending: Number(summary?.pending || 0),
  accuracy: Number(summary?.accuracy || 0),
  currentStreak: Number(summary?.currentStreak || 0),
  bestStreak: Number(summary?.bestStreak || 0),
  weeklyWins: Number(summary?.weeklyWins || 0),
  weeklySettledPredictions: Number(summary?.weeklySettledPredictions || 0),
  weeklyAccuracy: Number(summary?.weeklyAccuracy || 0),
  recentForm: Array.isArray(summary?.recentForm) ? summary.recentForm : [],
  lastPredictionAt: summary?.lastPredictionAt || null,
  lastSettledAt: summary?.lastSettledAt || null,
});

const serializeLeaderboardEntry = (entry) => ({
  rank: Number(entry?.rank || 0),
  userName: entry?.userName || "",
  predictionSummary: serializePredictionSummary(entry?.predictionSummary),
});

router.get("/", authentication, async function (req, res, next) {
  const authData = getUserDataFromRequest(req);
  if (!authData?.data) {
    return res.sendStatus(403);
  }

  try {
    const [userRecord, fixtureMap] = await Promise.all([
      fetchUserRecord(req.app, authData.data),
      fetchFixtureMap(req.app),
    ]);
    const predictions = hydratePredictionHistory(userRecord?.prediction_history || [], fixtureMap);

    return res.status(200).json({
      message: "succeed",
      predictions: predictions.map(serializePrediction),
    });
  } catch (error) {
    return res.status(502).json({
      message: getErrorMessage(error, "failed to load predictions"),
    });
  }
});

router.get("/leaderboard", async function (req, res, next) {
  try {
    const [userRecords, fixtureMap] = await Promise.all([
      fetchUsersWithPredictions(req.app),
      fetchFixtureMap(req.app),
    ]);
    const leaderboardResult = buildPredictionLeaderboard(
      userRecords,
      fixtureMap,
      new Date()
    );

    let viewerEntry = null;
    try {
      const authData = getUserDataFromRequest(req);
      if (authData?.data) {
        const matchedEntry = leaderboardResult.leaderboard.find(
          (entry) => entry.userName === authData.data
        );
        if (matchedEntry) {
          viewerEntry = serializeLeaderboardEntry(matchedEntry);
        } else {
          const userRecord = userRecords.find((user) => user.user_name === authData.data);
          if (userRecord) {
            const hydratedPredictions = hydratePredictionHistory(
              userRecord?.prediction_history || [],
              fixtureMap
            );
            viewerEntry = {
              rank: null,
              userName: authData.data,
              predictionSummary: serializePredictionSummary(
                buildPredictionSummary(hydratedPredictions, new Date())
              ),
            };
          }
        }
      }
    } catch (error) {
      viewerEntry = null;
    }

    return res.status(200).json({
      message: "succeed",
      leaderboard: leaderboardResult.leaderboard.map(serializeLeaderboardEntry),
      hotThisWeek: leaderboardResult.hotThisWeek.map(serializeLeaderboardEntry),
      viewerEntry,
    });
  } catch (error) {
    return res.status(502).json({
      message: getErrorMessage(error, "failed to load prediction leaderboard"),
    });
  }
});

router.post("/", authentication, async function (req, res, next) {
  const authData = getUserDataFromRequest(req);
  if (!authData?.data) {
    return res.sendStatus(403);
  }

  const normalizedPrediction = normalizePredictionPayload(req.body || {});
  if (!normalizedPrediction) {
    return res.status(400).json({ message: "invalid prediction payload" });
  }

  try {
    const fixtureMap = await fetchFixtureMap(req.app);
    if (!fixtureMap[normalizedPrediction.fixture_id]) {
      return res.status(400).json({ message: "fixture not found" });
    }

    const updatedUser = await updateUserRecord(req.app, authData.data, {
      upsert_prediction: normalizedPrediction,
      onboarding_state: {
        first_prediction_completed: true,
      },
    });
    const predictions = hydratePredictionHistory(updatedUser?.prediction_history || [], fixtureMap);

    return res.status(200).json({
      message: "succeed",
      prediction: serializePrediction(predictions[0]),
      predictions: predictions.map(serializePrediction),
    });
  } catch (error) {
    return res.status(502).json({
      message: getErrorMessage(error, "failed to save prediction"),
    });
  }
});

module.exports = router;
module.exports._private = {
  fetchUserRecord,
  fetchUsersWithPredictions,
  fetchFixtureMap,
  updateUserRecord,
  serializePrediction,
  serializePredictionSummary,
  serializeLeaderboardEntry,
};
