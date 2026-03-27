var express = require("express");
var router = express.Router();
var ENDPOINT_SELETOR = require("../../endpoints/endpoints");
var axios = require("axios");
const authentication = require("../../middlewares/authentication");
const { getUserDataFromRequest } = require("../../utils/auth");
const { getErrorMessage } = require("../../utils/api");
const {
  ACTIVE_EVENT_STATUS,
  SUPPORTED_STATUSES,
  normalizeCreatePayload,
  normalizeFixtureState,
  normalizeSearchPayload,
  groupEventsByFixture,
} = require("../../utils/customOdds");

const getDatacenterBaseUrl = (app) =>
  `http://${ENDPOINT_SELETOR(app.get("env"))}/customevent`;

const fetchUserProfile = async (app, userName) => {
  const userProfile = await axios.get(
    `http://${ENDPOINT_SELETOR(app.get("env"))}/user?user_name=${userName}`
  );

  return userProfile?.data;
};

const fetchFixtureMap = async (app) => {
  const fixtureResult = await axios.get(
    `http://${ENDPOINT_SELETOR(app.get("env"))}/fixtures/`
  );
  const fixtureMap = {};

  if (fixtureResult && Array.isArray(fixtureResult.data)) {
    fixtureResult.data.forEach((fixture) => {
      fixtureMap[fixture.fixture.id] = fixture;
    });
  }

  return fixtureMap;
};

router.post("/", authentication, async function (req, res, next) {
  const authData = getUserDataFromRequest(req);
  if (!authData?.data) {
    return res.sendStatus(403);
  }

  const normalizedPayload = normalizeCreatePayload(req.body || {});
  if (!Number.isInteger(normalizedPayload.fixtureId) || !normalizedPayload.oddData) {
    return res.status(400).json({ message: "invalid custom odds payload" });
  }

  try {
    const userProfile = await fetchUserProfile(req.app, authData.data);
    if (!userProfile || !userProfile.user_name) {
      return res.status(404).json({ message: "user not found" });
    }

    const fixtureMap = await fetchFixtureMap(req.app);
    const fixture = fixtureMap[normalizedPayload.fixtureId];
    if (!fixture) {
      return res.status(400).json({ message: "fixture not found" });
    }

    const fixtureState = normalizeFixtureState(fixture);
    if (fixtureState !== "notstarted") {
      return res.status(400).json({ message: "custom odds can only be created before kickoff" });
    }

    const existingEventsResult = await axios.post(
      `${getDatacenterBaseUrl(req.app)}/search`,
      {
        fixture_ids: [normalizedPayload.fixtureId],
        status: ACTIVE_EVENT_STATUS,
      }
    );
    const existingEvents =
      existingEventsResult?.data?.events_by_fixture?.[String(normalizedPayload.fixtureId)] || [];
    const hasDuplicate = existingEvents.some(
      (eventItem) => eventItem.created_by === authData.data
    );
    if (hasDuplicate) {
      return res.status(409).json({
        message: "an active custom odds post already exists for this fixture",
      });
    }

    const createResult = await axios.post(getDatacenterBaseUrl(req.app), {
      fixture_id: normalizedPayload.fixtureId,
      fixture_state: fixtureState,
      user_name: authData.data,
      status: ACTIVE_EVENT_STATUS,
      market: normalizedPayload.oddData.market,
      odd_data: normalizedPayload.oddData,
      pool_fund: 0,
      matched_pool_fund: 0,
      invested_pool_fund: 0,
      associated_order_ids: [],
      actual_return: 0,
      event_history: [],
    });

    return res.status(200).json({
      message: "succeed",
      event: createResult.data,
    });
  } catch (error) {
    return res.status(502).json({
      message: getErrorMessage(error, "create custom odds failed"),
    });
  }
});

router.post("/search", async function (req, res, next) {
  const normalizedPayload = normalizeSearchPayload(req.body || {});
  if (normalizedPayload.hasInvalidFixtureIds) {
    return res.status(400).json({ message: "fixture_ids must contain valid ids" });
  }
  if (!SUPPORTED_STATUSES.has(normalizedPayload.status)) {
    return res.status(400).json({ message: "unsupported status" });
  }

  if (normalizedPayload.fixtureIds.length === 0) {
    return res.status(200).json({ events_by_fixture: {} });
  }

  try {
    const result = await axios.post(`${getDatacenterBaseUrl(req.app)}/search`, {
      fixture_ids: normalizedPayload.fixtureIds,
      status: normalizedPayload.status,
    });

    return res.status(200).json({
      events_by_fixture: groupEventsByFixture(result?.data?.events_by_fixture),
    });
  } catch (error) {
    return res.status(502).json({
      message: getErrorMessage(error, "get custom odds failed"),
    });
  }
});

router.get("/", async function (req, res, next) {
  if (!req.query?.id) {
    return res.status(400).json({ message: "id is required" });
  }

  try {
    const result = await axios.get(
      `${getDatacenterBaseUrl(req.app)}?id=${req.query.id}`
    );
    return res.status(200).json(result.data);
  } catch (error) {
    const statusCode = error.response?.status || 502;
    return res.status(statusCode).json({
      message: getErrorMessage(error, "get custom odds failed"),
    });
  }
});

module.exports = router;
