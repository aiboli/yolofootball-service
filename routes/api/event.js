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
  normalizeFundPayload,
  normalizeBetPayload,
  groupEventsByFixture,
  getViewerBetEventIds,
  enrichEventForViewer,
  enrichEventsByFixtureForViewer,
} = require("../../utils/customOdds");

const getDatacenterBaseUrl = (app) =>
  `http://${ENDPOINT_SELETOR(app.get("env"))}/customevent`;
const getDatacenterRootUrl = (app) => `http://${ENDPOINT_SELETOR(app.get("env"))}`;
const NOT_STARTED_FIXTURE_STATE = "notstarted";

const fetchUserProfile = async (app, userName) => {
  const userProfile = await axios.get(
    `${getDatacenterRootUrl(app)}/user?user_name=${encodeURIComponent(userName)}`
  );

  return userProfile?.data;
};

const fetchFixtureMap = async (app) => {
  const fixtureResult = await axios.get(`${getDatacenterRootUrl(app)}/fixtures/`);
  const fixtureMap = {};

  if (fixtureResult && Array.isArray(fixtureResult.data)) {
    fixtureResult.data.forEach((fixture) => {
      fixtureMap[fixture.fixture.id] = fixture;
    });
  }

  return fixtureMap;
};

const updateUserOnboardingState = async (app, userName, onboardingState) => {
  if (!userName) {
    return;
  }

  await axios.put(
    `${getDatacenterRootUrl(app)}/user/${encodeURIComponent(userName)}`,
    {
      onboarding_state: onboardingState,
    }
  );
};

const searchCustomOdds = async (app, payload) => {
  const result = await axios.post(`${getDatacenterBaseUrl(app)}/search`, payload);
  return groupEventsByFixture(result?.data?.events_by_fixture);
};

const getOptionalAuthenticatedUserName = (req) => {
  try {
    const authData = getUserDataFromRequest(req);
    return authData?.data || null;
  } catch (error) {
    return null;
  }
};

const fetchEventById = async (app, eventId) => {
  const result = await axios.get(
    `${getDatacenterBaseUrl(app)}?id=${encodeURIComponent(eventId)}`
  );
  return result?.data && typeof result.data === "object" ? result.data : null;
};

const fetchViewerBetEventIds = async (app, userName, eventIds) => {
  if (!userName || !Array.isArray(eventIds) || eventIds.length === 0) {
    return new Set();
  }

  const result = await axios.post(`${getDatacenterRootUrl(app)}/order/orders`, {
    created_by: userName,
    order_source: "custom_event",
    custom_event_ids: eventIds,
  });

  return getViewerBetEventIds(result?.data);
};

const normalizeEventId = (eventId) => {
  if (typeof eventId !== "string") {
    return "";
  }

  return eventId.trim();
};

const normalizeAssociatedOrderIds = (event) => {
  return Array.isArray(event?.associated_order_ids) ? event.associated_order_ids : [];
};

const resolveFixtureState = (fixture) => {
  if (!fixture) {
    return null;
  }

  return normalizeFixtureState(fixture);
};

const resolveEventFixtureState = (event, fixtureMap) => {
  const fixtureId = Number.parseInt(event?.fixture_id, 10);
  if (Number.isInteger(fixtureId)) {
    const liveFixtureState = resolveFixtureState(fixtureMap[fixtureId]);
    if (liveFixtureState) {
      return liveFixtureState;
    }
  }

  return typeof event?.fixture_state === "string" ? event.fixture_state : null;
};

const getCancelableEventError = ({ event, userName, fixtureState }) => {
  if (!event) {
    return {
      statusCode: 404,
      message: "custom odds not found",
    };
  }
  if (event.created_by !== userName) {
    return {
      statusCode: 403,
      message: "you can only cancel your own custom odds",
    };
  }
  if (event.status !== ACTIVE_EVENT_STATUS) {
    return {
      statusCode: 409,
      message: "custom odds can only be canceled while active",
    };
  }
  if (!Number.isInteger(Number.parseInt(event.fixture_id, 10))) {
    return {
      statusCode: 409,
      message: "custom odds are missing a valid fixture reference",
    };
  }
  if (fixtureState !== NOT_STARTED_FIXTURE_STATE) {
    return {
      statusCode: 409,
      message:
        fixtureState === null
          ? "custom odds fixture state is unavailable"
          : "custom odds can only be canceled before kickoff",
    };
  }
  if (normalizeAssociatedOrderIds(event).length > 0) {
    return {
      statusCode: 409,
      message: "custom odds with linked orders cannot be canceled",
    };
  }

  return null;
};

const flattenEventIds = (eventsByFixture = {}) => {
  return Object.values(eventsByFixture)
    .flatMap((events) => (Array.isArray(events) ? events : []))
    .map((event) => event?.id)
    .filter((eventId) => typeof eventId === "string" && eventId.length > 0);
};

const buildSearchResponse = async (req, normalizedPayload, userName) => {
  if (normalizedPayload.includeUserContext && userName) {
    const [eventsByFixture, ownEventsByFixture] = await Promise.all([
      searchCustomOdds(req.app, {
        fixture_ids: normalizedPayload.fixtureIds,
        status: normalizedPayload.status,
        exclude_created_by: userName,
      }),
      searchCustomOdds(req.app, {
        fixture_ids: normalizedPayload.fixtureIds,
        status: normalizedPayload.status,
        created_by: userName,
      }),
    ]);

    const viewerBetEventIds = await fetchViewerBetEventIds(req.app, userName, [
      ...flattenEventIds(eventsByFixture),
      ...flattenEventIds(ownEventsByFixture),
    ]);

    return {
      events_by_fixture: enrichEventsByFixtureForViewer(
        eventsByFixture,
        userName,
        viewerBetEventIds
      ),
      own_events_by_fixture: enrichEventsByFixtureForViewer(
        ownEventsByFixture,
        userName,
        viewerBetEventIds
      ),
    };
  }

  const eventsByFixture = await searchCustomOdds(req.app, {
    fixture_ids: normalizedPayload.fixtureIds,
    status: normalizedPayload.status,
  });
  const viewerBetEventIds = await fetchViewerBetEventIds(
    req.app,
    userName,
    flattenEventIds(eventsByFixture)
  );

  return {
    events_by_fixture: enrichEventsByFixtureForViewer(
      eventsByFixture,
      userName,
      viewerBetEventIds
    ),
    ...(normalizedPayload.includeUserContext ? { own_events_by_fixture: {} } : {}),
  };
};

router.post("/", authentication, async function (req, res, next) {
  const authData = getUserDataFromRequest(req);
  if (!authData?.data) {
    return res.sendStatus(403);
  }

  const normalizedPayload = normalizeCreatePayload(req.body || {});
  if (
    !Number.isInteger(normalizedPayload.fixtureId) ||
    !normalizedPayload.oddData ||
    normalizedPayload.poolFund === null ||
    normalizedPayload.poolFund <= 0
  ) {
    return res.status(400).json({ message: "invalid custom odds payload" });
  }

  try {
    const userProfile = await fetchUserProfile(req.app, authData.data);
    if (!userProfile || !userProfile.user_name) {
      return res.status(404).json({ message: "user not found" });
    }
    if (Number(userProfile.account_balance || 0) < normalizedPayload.poolFund) {
      return res.status(409).json({ message: "insufficient balance" });
    }

    const fixtureMap = await fetchFixtureMap(req.app);
    const fixture = fixtureMap[normalizedPayload.fixtureId];
    if (!fixture) {
      return res.status(400).json({ message: "fixture not found" });
    }

    const fixtureState = normalizeFixtureState(fixture);
    if (fixtureState !== NOT_STARTED_FIXTURE_STATE) {
      return res.status(400).json({ message: "custom odds can only be created before kickoff" });
    }

    const existingEvents =
      (
        await searchCustomOdds(req.app, {
          fixture_ids: [normalizedPayload.fixtureId],
          status: ACTIVE_EVENT_STATUS,
        })
      )[String(normalizedPayload.fixtureId)] || [];
    const normalizedExistingEvents = Array.isArray(existingEvents) ? existingEvents : [];
    const hasDuplicate = normalizedExistingEvents.some(
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
      pool_fund: normalizedPayload.poolFund,
    });

    await updateUserOnboardingState(req.app, authData.data, {
      first_custom_odds_completed: true,
    });

    return res.status(200).json({
      message: "succeed",
      event: enrichEventForViewer(createResult.data, authData.data, new Set()),
    });
  } catch (error) {
    return res.status(error.response?.status || 502).json({
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

  const userName = getOptionalAuthenticatedUserName(req);
  if (normalizedPayload.fixtureIds.length === 0) {
    return res.status(200).json(
      normalizedPayload.includeUserContext && userName
        ? { events_by_fixture: {}, own_events_by_fixture: {} }
        : { events_by_fixture: {} }
    );
  }

  try {
    return res.status(200).json(
      await buildSearchResponse(req, normalizedPayload, userName)
    );
  } catch (error) {
    return res.status(502).json({
      message: getErrorMessage(error, "get custom odds failed"),
    });
  }
});

router.post("/:eventId/bets", authentication, async function (req, res, next) {
  const authData = getUserDataFromRequest(req);
  if (!authData?.data) {
    return res.sendStatus(403);
  }

  const eventId = normalizeEventId(req.params.eventId);
  const normalizedPayload = normalizeBetPayload(req.body || {});
  if (!eventId) {
    return res.status(400).json({ message: "event id is required" });
  }
  if (
    !Number.isInteger(normalizedPayload.betResult) ||
    normalizedPayload.stake === null ||
    normalizedPayload.stake <= 0
  ) {
    return res.status(400).json({ message: "invalid custom bet payload" });
  }

  try {
    const [event, userProfile, fixtureMap] = await Promise.all([
      fetchEventById(req.app, eventId),
      fetchUserProfile(req.app, authData.data),
      fetchFixtureMap(req.app),
    ]);
    if (!event) {
      return res.status(404).json({ message: "custom odds not found" });
    }
    if (!userProfile?.user_name) {
      return res.status(404).json({ message: "user not found" });
    }
    if (event.created_by === authData.data) {
      return res.status(403).json({ message: "you cannot bet on your own custom odds" });
    }
    if (event.status !== ACTIVE_EVENT_STATUS) {
      return res.status(409).json({ message: "custom odds are not accepting bets" });
    }
    if (Number(userProfile.account_balance || 0) < normalizedPayload.stake) {
      return res.status(409).json({ message: "insufficient balance" });
    }

    const fixtureState = resolveEventFixtureState(event, fixtureMap);
    if (fixtureState !== NOT_STARTED_FIXTURE_STATE) {
      return res
        .status(409)
        .json({ message: "custom odds can only accept bets before kickoff" });
    }

    const viewerBetEventIds = await fetchViewerBetEventIds(req.app, authData.data, [eventId]);
    if (viewerBetEventIds.has(eventId)) {
      return res.status(409).json({ message: "you already have an active bet on this custom odds" });
    }

    const maxStakeByResult = event?.max_stake_by_result || {};
    const maxStake = Number(maxStakeByResult[normalizedPayload.betResult] || 0);
    if (!Number.isFinite(maxStake) || maxStake <= 0) {
      return res.status(409).json({ message: "no bet capacity remains for this outcome" });
    }
    if (normalizedPayload.stake > maxStake) {
      return res.status(409).json({
        message: `stake exceeds the remaining max of ${maxStake.toFixed(2)}`,
      });
    }

    const betResult = await axios.post(
      `${getDatacenterBaseUrl(req.app)}/${encodeURIComponent(eventId)}/bets`,
      {
        user_name: authData.data,
        bet_result: normalizedPayload.betResult,
        stake: normalizedPayload.stake,
        fixture_state: fixtureState,
      }
    );

    return res.status(200).json({
      message: "succeed",
      event: enrichEventForViewer(betResult?.data?.event, authData.data, new Set([eventId])),
      order: betResult?.data?.order || null,
    });
  } catch (error) {
    return res.status(error.response?.status || 502).json({
      message: getErrorMessage(error, "place custom bet failed"),
    });
  }
});

router.put("/:eventId/fund", authentication, async function (req, res, next) {
  const authData = getUserDataFromRequest(req);
  if (!authData?.data) {
    return res.sendStatus(403);
  }

  const eventId = normalizeEventId(req.params.eventId);
  const normalizedPayload = normalizeFundPayload(req.body || {});
  if (!eventId) {
    return res.status(400).json({ message: "event id is required" });
  }
  if (
    normalizedPayload.additionalPoolFund === null ||
    normalizedPayload.additionalPoolFund <= 0
  ) {
    return res.status(400).json({ message: "additional_pool_fund must be greater than 0" });
  }

  try {
    const [event, userProfile, fixtureMap] = await Promise.all([
      fetchEventById(req.app, eventId),
      fetchUserProfile(req.app, authData.data),
      fetchFixtureMap(req.app),
    ]);
    if (!event) {
      return res.status(404).json({ message: "custom odds not found" });
    }
    if (!userProfile?.user_name) {
      return res.status(404).json({ message: "user not found" });
    }
    if (event.created_by !== authData.data) {
      return res.status(403).json({ message: "you can only fund your own custom odds" });
    }
    if (event.status !== ACTIVE_EVENT_STATUS) {
      return res.status(409).json({ message: "custom odds can only be funded while active" });
    }
    if (Number(userProfile.account_balance || 0) < normalizedPayload.additionalPoolFund) {
      return res.status(409).json({ message: "insufficient balance" });
    }

    const fixtureState = resolveEventFixtureState(event, fixtureMap);
    if (fixtureState !== NOT_STARTED_FIXTURE_STATE) {
      return res.status(409).json({ message: "custom odds can only be funded before kickoff" });
    }

    const fundResult = await axios.put(
      `${getDatacenterBaseUrl(req.app)}/${encodeURIComponent(eventId)}/fund`,
      {
        user_name: authData.data,
        additional_pool_fund: normalizedPayload.additionalPoolFund,
        fixture_state: fixtureState,
      }
    );

    return res.status(200).json({
      message: "succeed",
      event: enrichEventForViewer(fundResult?.data, authData.data, new Set()),
    });
  } catch (error) {
    return res.status(error.response?.status || 502).json({
      message: getErrorMessage(error, "fund custom odds failed"),
    });
  }
});

router.put("/:eventId/cancel", authentication, async function (req, res, next) {
  const authData = getUserDataFromRequest(req);
  if (!authData?.data) {
    return res.sendStatus(403);
  }

  const eventId = normalizeEventId(req.params.eventId);
  if (!eventId) {
    return res.status(400).json({ message: "event id is required" });
  }

  try {
    const event = await fetchEventById(req.app, eventId);
    if (!event) {
      return res.status(404).json({ message: "custom odds not found" });
    }

    const fixtureMap = await fetchFixtureMap(req.app);
    const fixtureState = resolveEventFixtureState(event, fixtureMap);
    const cancelError = getCancelableEventError({
      event,
      userName: authData.data,
      fixtureState,
    });

    if (cancelError) {
      return res.status(cancelError.statusCode).json({ message: cancelError.message });
    }

    const updateResult = await axios.put(
      `${getDatacenterBaseUrl(req.app)}/${encodeURIComponent(eventId)}/cancel`,
      {
        user_name: authData.data,
        fixture_state: fixtureState,
      }
    );

    return res.status(200).json({
      message: "succeed",
      event: enrichEventForViewer(updateResult.data, authData.data, new Set()),
    });
  } catch (error) {
    const statusCode = error.response?.status || 502;
    return res.status(statusCode).json({
      message: getErrorMessage(error, "cancel custom odds failed"),
    });
  }
});

router.get("/", async function (req, res, next) {
  if (!req.query?.id) {
    return res.status(400).json({ message: "id is required" });
  }

  try {
    const userName = getOptionalAuthenticatedUserName(req);
    const event = await fetchEventById(req.app, req.query.id);
    if (!event) {
      return res.status(404).json({ message: "custom odds not found" });
    }
    const viewerBetEventIds = await fetchViewerBetEventIds(req.app, userName, [event.id]);

    return res.status(200).json(
      enrichEventForViewer(event, userName, viewerBetEventIds)
    );
  } catch (error) {
    const statusCode = error.response?.status || 502;
    return res.status(statusCode).json({
      message: getErrorMessage(error, "get custom odds failed"),
    });
  }
});

module.exports = router;
module.exports._private = {
  NOT_STARTED_FIXTURE_STATE,
  normalizeEventId,
  normalizeAssociatedOrderIds,
  resolveEventFixtureState,
  getOptionalAuthenticatedUserName,
  getCancelableEventError,
  buildSearchResponse,
  fetchViewerBetEventIds,
  flattenEventIds,
};
