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
const CANCELED_EVENT_STATUS = "canceled";
const NOT_STARTED_FIXTURE_STATE = "notstarted";

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

const getOptionalAuthenticatedUserName = (req) => {
  try {
    const authData = getUserDataFromRequest(req);
    return authData?.data || null;
  } catch (error) {
    return null;
  }
};

const fetchEventById = async (app, eventId) => {
  const result = await axios.get(`${getDatacenterBaseUrl(app)}?id=${eventId}`);
  return result?.data && typeof result.data === "object" ? result.data : null;
};

const searchCustomOdds = async (app, payload) => {
  const result = await axios.post(`${getDatacenterBaseUrl(app)}/search`, payload);
  return groupEventsByFixture(result?.data?.events_by_fixture);
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

const resolveCancelableFixtureState = (event, fixtureMap) => {
  const fixtureId = parseInt(event?.fixture_id, 10);
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
  if (!Number.isInteger(parseInt(event.fixture_id, 10))) {
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

    return {
      events_by_fixture: eventsByFixture,
      own_events_by_fixture: ownEventsByFixture,
    };
  }

  return {
    events_by_fixture: await searchCustomOdds(req.app, {
      fixture_ids: normalizedPayload.fixtureIds,
      status: normalizedPayload.status,
    }),
    ...(normalizedPayload.includeUserContext ? { own_events_by_fixture: {} } : {}),
  };
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
    return res.status(200).json(
      normalizedPayload.includeUserContext && getOptionalAuthenticatedUserName(req)
        ? { events_by_fixture: {}, own_events_by_fixture: {} }
        : { events_by_fixture: {} }
    );
  }

  try {
    return res.status(200).json(
      await buildSearchResponse(
        req,
        normalizedPayload,
        getOptionalAuthenticatedUserName(req)
      )
    );
  } catch (error) {
    return res.status(502).json({
      message: getErrorMessage(error, "get custom odds failed"),
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
    const fixtureState = resolveCancelableFixtureState(event, fixtureMap);
    const cancelError = getCancelableEventError({
      event,
      userName: authData.data,
      fixtureState,
    });

    if (cancelError) {
      return res.status(cancelError.statusCode).json({ message: cancelError.message });
    }

    const updateResult = await axios.put(
      `${getDatacenterBaseUrl(req.app)}/${eventId}`,
      {
        status: CANCELED_EVENT_STATUS,
        fixture_state: fixtureState,
        event_history_entry: {
          time: new Date().toISOString(),
          info: "cancel custom event",
        },
      }
    );

    return res.status(200).json({
      message: "succeed",
      event: updateResult.data,
    });
  } catch (error) {
    const statusCode = error.response?.status === 404 ? 404 : 502;
    return res.status(statusCode).json({
      message:
        statusCode === 404
          ? "custom odds not found"
          : getErrorMessage(error, "cancel custom odds failed"),
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
module.exports._private = {
  CANCELED_EVENT_STATUS,
  NOT_STARTED_FIXTURE_STATE,
  normalizeEventId,
  normalizeAssociatedOrderIds,
  resolveCancelableFixtureState,
  getOptionalAuthenticatedUserName,
  getCancelableEventError,
  buildSearchResponse,
};
