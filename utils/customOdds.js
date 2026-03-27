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
    return parseInt(fixtureId.split("@")[1], 10);
  }

  return parseInt(fixtureId, 10);
};

const normalizeFixtureState = (fixture) => {
  const shortState = fixture?.fixture?.status?.short;
  if (shortState === "FT") {
    return "finished";
  }
  if (shortState === "NS") {
    return "notstarted";
  }
  if (shortState === "CANC") {
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
    const result = parseInt(currentOption.result, 10);
    const odd = parseFloat(currentOption.odd);
    if (!Number.isInteger(result) || !Number.isFinite(odd) || odd <= 0) {
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

  return {
    fixtureId,
    oddData,
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
    hasInvalidFixtureIds:
      Array.isArray(body?.fixture_ids) && fixtureIds.length !== body.fixture_ids.length,
  };
};

const groupEventsByFixture = (eventsByFixture) => {
  return eventsByFixture && typeof eventsByFixture === "object"
    ? eventsByFixture
    : {};
};

module.exports = {
  ACTIVE_EVENT_STATUS,
  SUPPORTED_MARKET,
  SUPPORTED_STATUSES,
  normalizeFixtureId,
  normalizeFixtureState,
  normalizeOddData,
  normalizeCreatePayload,
  normalizeSearchPayload,
  groupEventsByFixture,
};
