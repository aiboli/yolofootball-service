var express = require("express");
var router = express.Router();
var ENDPOINT_SELETOR = require("../../endpoints/endpoints");
var axios = require("axios");
var verifyCache = require("../../middlewares/memcache");
const { getErrorMessage } = require("../../utils/api");
const { buildHomeFeed } = require("../../utils/homeFeed");
const { getSportsDbPayload } = require("../../utils/sportsdb");

const getDatacenterBaseUrl = (app) => `http://${ENDPOINT_SELETOR(app.get("env"))}`;

const getPreparedFixtureMap = async (app) => {
  const result = await axios.get(`${getDatacenterBaseUrl(app)}/actions/prepareData`);
  return result?.data || null;
};

const getCustomEventsByFixture = async (app, fixtureIds = []) => {
  if (!fixtureIds.length) {
    return {};
  }

  const result = await axios.post(`${getDatacenterBaseUrl(app)}/customevent/search`, {
    fixture_ids: fixtureIds,
    status: "active",
  });

  return result?.data?.events_by_fixture || {};
};
/* GET users listing. */
router.get("/prepareData", verifyCache, async function (req, res, next) {
  try {
    let result = await axios.get(`${getDatacenterBaseUrl(req.app)}/actions/prepareData`);
    if (result && result.data) {
      global.cache.set(req.originalUrl, result.data, 7);
      return res.status(200).json(result.data);
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
    const sportsdb = await getSportsDbPayload({
      fixtureMap,
      customEventsByFixture,
      cache: global.cache,
      httpClient: axios,
    });
    const homeFeed = buildHomeFeed(fixtureMap, customEventsByFixture, sportsdb);

    global.cache.set(req.originalUrl, homeFeed, 30);
    return res.status(200).json(homeFeed);
  } catch (error) {
    return res.status(502).json({
      message: getErrorMessage(error, "fetch home feed failed"),
    });
  }
});

module.exports = router;
