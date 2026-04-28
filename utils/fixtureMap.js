const axios = require("axios");
const ENDPOINT_SELECTOR = require("../endpoints/endpoints");

const FIXTURE_MAP_CACHE_KEY = "fixtures:fixture-map";
const FIXTURE_MAP_FRESH_TTL_MS = 30 * 1000;
const FIXTURE_MAP_STALE_TTL_SECONDS = 3 * 60;
const DATACENTER_TIMEOUT_MS = 15 * 1000;

const datacenterClient = axios.create({
  timeout: DATACENTER_TIMEOUT_MS,
});

let fixtureMapRefreshPromise = null;

const getDatacenterRootUrl = (app) => `http://${ENDPOINT_SELECTOR(app.get("env"))}`;

const buildFixtureMap = (fixtures = []) => {
  const fixtureMap = {};

  if (!Array.isArray(fixtures)) {
    return fixtureMap;
  }

  fixtures.forEach((fixture) => {
    const fixtureId = Number.parseInt(fixture?.fixture?.id, 10);
    if (Number.isInteger(fixtureId)) {
      fixtureMap[fixtureId] = fixture;
    }
  });

  return fixtureMap;
};

const getCachedEnvelope = () => {
  const cacheEntry = global.cache?.get(FIXTURE_MAP_CACHE_KEY);
  if (!cacheEntry || typeof cacheEntry !== "object") {
    return null;
  }

  return cacheEntry;
};

const getCachedFixtureMap = () => {
  const cacheEntry = getCachedEnvelope();
  if (!cacheEntry) {
    return {
      isFresh: false,
      value: null,
    };
  }

  return {
    isFresh: Date.now() - cacheEntry.cachedAt < FIXTURE_MAP_FRESH_TTL_MS,
    value: cacheEntry.value,
  };
};

const setCachedFixtureMap = (fixtureMap) => {
  global.cache?.set(
    FIXTURE_MAP_CACHE_KEY,
    {
      cachedAt: Date.now(),
      value: fixtureMap,
    },
    FIXTURE_MAP_STALE_TTL_SECONDS
  );

  return fixtureMap;
};

const refreshFixtureMap = async (app) => {
  if (fixtureMapRefreshPromise) {
    return fixtureMapRefreshPromise;
  }

  fixtureMapRefreshPromise = (async () => {
    const result = await datacenterClient.get(`${getDatacenterRootUrl(app)}/fixtures/`);
    const fixtureMap = buildFixtureMap(result?.data);
    setCachedFixtureMap(fixtureMap);
    return fixtureMap;
  })();

  try {
    return await fixtureMapRefreshPromise;
  } finally {
    fixtureMapRefreshPromise = null;
  }
};

const fetchFixtureMap = async (app) => {
  const { isFresh, value } = getCachedFixtureMap();
  if (isFresh) {
    return value;
  }

  if (value) {
    refreshFixtureMap(app).catch(() => {});
    return value;
  }

  return refreshFixtureMap(app);
};

module.exports = {
  buildFixtureMap,
  fetchFixtureMap,
  refreshFixtureMap,
  FIXTURE_MAP_CACHE_KEY,
};
