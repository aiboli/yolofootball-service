const SUPPORTED_MARKET = "match_winner";
const ACTIVE_EVENT_STATUS = "active";
const SUPPORTED_STATUSES = new Set([
  "active",
  "locked",
  "completed",
  "canceled",
]);
const EXPECTED_OPTIONS = [
  { result: 0, label: "Home" },
  { result: 1, label: "Draw" },
  { result: 2, label: "Away" },
];

const normalizeFixtureId = (fixtureId) => {
  if (typeof fixtureId === "string" && fixtureId.includes("@")) {
    return Number.parseInt(fixtureId.split("@")[1], 10);
  }

  return Number.parseInt(fixtureId, 10);
};

const toCurrency = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Number(numericValue.toFixed(2));
};

const normalizeFixtureState = (fixture) => {
  const shortState = fixture?.fixture?.status?.short;
  if (["FT", "AET", "PEN"].includes(shortState)) {
    return "finished";
  }
  if (shortState === "NS") {
    return "notstarted";
  }
  if (["CANC", "PST", "ABD", "AWD", "WO"].includes(shortState)) {
    return "canceled";
  }

  return "ongoing";
};

const normalizeOddData = (oddData) => {
  if (
    !oddData ||
    oddData.market !== SUPPORTED_MARKET ||
    !Array.isArray(oddData.options) ||
    oddData.options.length !== EXPECTED_OPTIONS.length
  ) {
    return null;
  }

  const optionsByResult = {};
  for (let i = 0; i < oddData.options.length; i++) {
    const currentOption = oddData.options[i];
    const result = Number.parseInt(currentOption.result, 10);
    const odd = Number.parseFloat(currentOption.odd);
    if (!Number.isInteger(result) || !Number.isFinite(odd) || odd <= 1) {
      return null;
    }
    optionsByResult[result] = odd;
  }

  const normalizedOptions = EXPECTED_OPTIONS.map((expectedOption) => {
    if (!Object.prototype.hasOwnProperty.call(optionsByResult, expectedOption.result)) {
      return null;
    }

    return {
      result: expectedOption.result,
      label: expectedOption.label,
      odd: optionsByResult[expectedOption.result],
    };
  });

  if (normalizedOptions.some((option) => !option)) {
    return null;
  }

  return {
    market: SUPPORTED_MARKET,
    options: normalizedOptions,
  };
};

const normalizeCreatePayload = (body) => {
  const fixtureId = normalizeFixtureId(body?.fixture_id);
  const oddData = normalizeOddData(body?.odd_data);
  const poolFund = toCurrency(body?.pool_fund);

  return {
    fixtureId,
    oddData,
    poolFund,
  };
};

const normalizeFundPayload = (body) => {
  const additionalPoolFund = toCurrency(body?.additional_pool_fund);

  return {
    additionalPoolFund,
  };
};

const normalizeBetPayload = (body) => {
  const betResult = Number.parseInt(body?.bet_result, 10);
  const stake = toCurrency(body?.stake);

  return {
    betResult,
    stake,
  };
};

const normalizeSearchPayload = (body) => {
  const fixtureIds = Array.isArray(body?.fixture_ids)
    ? body.fixture_ids
        .map((fixtureId) => normalizeFixtureId(fixtureId))
        .filter((fixtureId) => Number.isInteger(fixtureId))
    : [];

  return {
    fixtureIds,
    status: body?.status || ACTIVE_EVENT_STATUS,
    includeUserContext: body?.include_user_context === true,
    hasInvalidFixtureIds:
      Array.isArray(body?.fixture_ids) && fixtureIds.length !== body.fixture_ids.length,
  };
};

const groupEventsByFixture = (eventsByFixture) => {
  return eventsByFixture && typeof eventsByFixture === "object" ? eventsByFixture : {};
};

const getViewerBetEventIds = (orders = []) => {
  return new Set(
    (Array.isArray(orders) ? orders : [])
      .map((order) => order?.custom_event_id)
      .filter((eventId) => typeof eventId === "string" && eventId.length > 0)
  );
};

const enrichEventForViewer = (event, userName, viewerBetEventIds) => {
  const eventId = typeof event?.id === "string" ? event.id : "";
  const isOwner = !!userName && event?.created_by === userName;
  const hasViewerBet = !!eventId && viewerBetEventIds instanceof Set && viewerBetEventIds.has(eventId);

  return {
    ...event,
    is_owner: isOwner,
    has_viewer_bet: hasViewerBet,
    can_accept_bets: !!event?.can_accept_bets && !isOwner && !hasViewerBet,
  };
};

const enrichEventsByFixtureForViewer = (eventsByFixture, userName, viewerBetEventIds) => {
  const groupedEvents = groupEventsByFixture(eventsByFixture);
  const nextEventsByFixture = {};

  Object.keys(groupedEvents).forEach((fixtureId) => {
    nextEventsByFixture[fixtureId] = (Array.isArray(groupedEvents[fixtureId])
      ? groupedEvents[fixtureId]
      : []
    ).map((event) => enrichEventForViewer(event, userName, viewerBetEventIds));
  });

  return nextEventsByFixture;
};

module.exports = {
  ACTIVE_EVENT_STATUS,
  SUPPORTED_MARKET,
  SUPPORTED_STATUSES,
  EXPECTED_OPTIONS,
  normalizeFixtureId,
  normalizeFixtureState,
  normalizeOddData,
  normalizeCreatePayload,
  normalizeFundPayload,
  normalizeBetPayload,
  normalizeSearchPayload,
  groupEventsByFixture,
  getViewerBetEventIds,
  enrichEventForViewer,
  enrichEventsByFixtureForViewer,
};
