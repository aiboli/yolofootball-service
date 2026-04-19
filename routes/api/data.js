var express = require("express");
var router = express.Router();
var ENDPOINT_SELETOR = require("../../endpoints/endpoints");
var axios = require("axios");
var verifyCache = require("../../middlewares/memcache");
const { getErrorMessage } = require("../../utils/api");
const { buildHomeFeed } = require("../../utils/homeFeed");
const { createEmptySportsDb, getSportsDbPayload } = require("../../utils/sportsdb");

const getDatacenterBaseUrl = (app) => `http://${ENDPOINT_SELETOR(app.get("env"))}`;
const PREPARED_FIXTURE_MAP_CACHE_KEY = "data:prepared-fixture-map";
const PREPARED_FIXTURE_MAP_FRESH_TTL_MS = 30 * 1000;
const PREPARED_FIXTURE_MAP_STALE_TTL_SECONDS = 3 * 60;
const CUSTOM_EVENTS_FRESH_TTL_MS = 15 * 1000;
const CUSTOM_EVENTS_STALE_TTL_SECONDS = 90;
const PREPARE_DATA_ROUTE_CACHE_TTL_SECONDS = 30;
const HOME_FEED_ROUTE_CACHE_TTL_SECONDS = 30;
const DATACENTER_TIMEOUT_MS = 15 * 1000;
const SPORTSDB_HTTP_TIMEOUT_MS = 2500;
const SPORTSDB_TIMEOUT_MS = 3500;

const datacenterClient = axios.create({
  timeout: DATACENTER_TIMEOUT_MS,
});
const sportsDbClient = axios.create({
  timeout: SPORTSDB_HTTP_TIMEOUT_MS,
});

let preparedFixtureMapRefreshPromise = null;
const customEventsRefreshPromises = {};

const getCachedEnvelope = (cacheKey) => {
  const cacheEntry = global.cache?.get(cacheKey);
  if (!cacheEntry || typeof cacheEntry !== "object") {
    return null;
  }

  return cacheEntry;
};

const getCachedValue = (cacheKey, freshTtlMs) => {
  const cacheEntry = getCachedEnvelope(cacheKey);
  if (!cacheEntry) {
    return {
      isFresh: false,
      value: null,
    };
  }

  return {
    isFresh: Date.now() - cacheEntry.cachedAt < freshTtlMs,
    value: cacheEntry.value,
  };
};

const setCachedValue = (cacheKey, value, staleTtlSeconds) => {
  global.cache?.set(
    cacheKey,
    {
      cachedAt: Date.now(),
      value,
    },
    staleTtlSeconds
  );

  return value;
};

const buildCustomEventsCacheKey = (fixtureIds = []) =>
  `data:custom-events:${fixtureIds.join(",")}`;

const withTimeoutFallback = async (task, timeoutMs, fallbackValue) => {
  return Promise.race([
    task,
    new Promise((resolve) => {
      setTimeout(() => resolve(fallbackValue), timeoutMs);
    }),
  ]);
};

const refreshPreparedFixtureMap = async (app) => {
  if (preparedFixtureMapRefreshPromise) {
    return preparedFixtureMapRefreshPromise;
  }

  preparedFixtureMapRefreshPromise = (async () => {
    const result = await datacenterClient.get(`${getDatacenterBaseUrl(app)}/actions/prepareData`);
    const fixtureMap = result?.data || null;
    if (fixtureMap && typeof fixtureMap === "object") {
      setCachedValue(
        PREPARED_FIXTURE_MAP_CACHE_KEY,
        fixtureMap,
        PREPARED_FIXTURE_MAP_STALE_TTL_SECONDS
      );
    }
    return fixtureMap;
  })();

  try {
    return await preparedFixtureMapRefreshPromise;
  } finally {
    preparedFixtureMapRefreshPromise = null;
  }
};

const getPreparedFixtureMap = async (app) => {
  const { isFresh, value } = getCachedValue(
    PREPARED_FIXTURE_MAP_CACHE_KEY,
    PREPARED_FIXTURE_MAP_FRESH_TTL_MS
  );
  if (isFresh) {
    return value;
  }

  if (value) {
    refreshPreparedFixtureMap(app).catch(() => {});
    return value;
  }

  return refreshPreparedFixtureMap(app);
};

const refreshCustomEventsByFixture = async (app, fixtureIds = []) => {
  if (!fixtureIds.length) {
    return {};
  }

  const cacheKey = buildCustomEventsCacheKey(fixtureIds);
  if (customEventsRefreshPromises[cacheKey]) {
    return customEventsRefreshPromises[cacheKey];
  }

  customEventsRefreshPromises[cacheKey] = (async () => {
    const result = await datacenterClient.post(`${getDatacenterBaseUrl(app)}/customevent/search`, {
      fixture_ids: fixtureIds,
      status: "active",
    });
    const eventsByFixture = result?.data?.events_by_fixture || {};
    setCachedValue(cacheKey, eventsByFixture, CUSTOM_EVENTS_STALE_TTL_SECONDS);
    return eventsByFixture;
  })();

  try {
    return await customEventsRefreshPromises[cacheKey];
  } finally {
    delete customEventsRefreshPromises[cacheKey];
  }
};

const getCustomEventsByFixture = async (app, fixtureIds = []) => {
  if (!fixtureIds.length) {
    return {};
  }

  const cacheKey = buildCustomEventsCacheKey(fixtureIds);
  const { isFresh, value } = getCachedValue(cacheKey, CUSTOM_EVENTS_FRESH_TTL_MS);
  if (isFresh) {
    return value;
  }

  if (value) {
    refreshCustomEventsByFixture(app, fixtureIds).catch(() => {});
    return value;
  }

  return refreshCustomEventsByFixture(app, fixtureIds);
};

const getSafeSportsDbPayload = async ({ fixtureMap, customEventsByFixture, cache }) => {
  return withTimeoutFallback(
    getSportsDbPayload({
      fixtureMap,
      customEventsByFixture,
      cache,
      httpClient: sportsDbClient,
    }),
    SPORTSDB_TIMEOUT_MS,
    createEmptySportsDb()
  );
};
/* GET users listing. */
router.get("/prepareData", verifyCache, async function (req, res, next) {
  try {
    const fixtureMap = await getPreparedFixtureMap(req.app);
    if (fixtureMap && typeof fixtureMap === "object") {
      global.cache.set(req.originalUrl, fixtureMap, PREPARE_DATA_ROUTE_CACHE_TTL_SECONDS);
      return res.status(200).json(fixtureMap);
    }
    return res.status(404).json("fetch data failed");
  } catch (error) {
    return res.status(502).json("fetch data failed");
  }
});

router.get("/homeFeed", verifyCache, async function (req, res, next) {
  try {
    const fixtureMap = await getPreparedFixtureMap(req.app);
    if (!fixtureMap || typeof fixtureMap !== "object") {
      return res.status(404).json({ message: "fetch home feed failed" });
    }

    const fixtureIds = Object.values(fixtureMap)
      .map((fixture) => fixture?.fixture?.id)
      .filter((fixtureId) => Number.isInteger(fixtureId));
    const customEventsByFixture = await getCustomEventsByFixture(req.app, fixtureIds);
    const sportsdb = await getSafeSportsDbPayload({
      fixtureMap,
      customEventsByFixture,
      cache: global.cache,
    });
    const homeFeed = buildHomeFeed(fixtureMap, customEventsByFixture, sportsdb);

    global.cache.set(req.originalUrl, homeFeed, HOME_FEED_ROUTE_CACHE_TTL_SECONDS);
    return res.status(200).json(homeFeed);
  } catch (error) {
    return res.status(502).json({
      message: getErrorMessage(error, "fetch home feed failed"),
    });
  }
});

module.exports = router;
