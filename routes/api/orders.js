var express = require("express");
var router = express.Router();
var ENDPOINT_SELETOR = require("../../endpoints/endpoints");
var axios = require("axios");
const authentication = require("../../middlewares/authentication");
const { getUserDataFromRequest } = require("../../utils/auth");
const { getErrorMessage } = require("../../utils/api");
const {
  calculateCombinedOdd,
  normalizeOrderPayload,
  isOrderPayloadValid,
  calculateOrderOutcome,
} = require("../../utils/orderSettlement");

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
  if (!authData) {
    return res.sendStatus(403);
  }

  const normalizedPayload = normalizeOrderPayload(req.body || {});
  if (!isOrderPayloadValid(normalizedPayload)) {
    return res.status(400).json({ message: "invalid order payload" });
  }

  const computedCombinedOdd = calculateCombinedOdd(normalizedPayload.selections);
  const expectedWinReturn = normalizedPayload.stake * computedCombinedOdd;
  const roundedCombinedOdd = Number(computedCombinedOdd.toFixed(4));
  const roundedWinReturn = Number(expectedWinReturn.toFixed(2));

  const orderToCreate = {
    fixture_id: normalizedPayload.selections[0].fixture_id,
    bet_result: normalizedPayload.selections[0].bet_result,
    odd_mount: normalizedPayload.stake,
    fixture_state: "notstarted",
    odd_rate: roundedCombinedOdd,
    win_return: roundedWinReturn,
    user_name: authData.data,
    order_type: normalizedPayload.orderType,
    selection_count: normalizedPayload.selections.length,
    selections: normalizedPayload.selections,
  };

  try {
    let result = await axios.post(
      `http://${ENDPOINT_SELETOR(req.app.get("env"))}/order/`,
      orderToCreate
    );
    if (result && result.data && result.data.created_by) {
      const fixtureMap = await fetchFixtureMap(req.app);
      const hydratedOrder = calculateOrderOutcome(result.data, fixtureMap);

      return res.status(200).json({
        message: "succeed",
        orderdate: hydratedOrder.orderdate || new Date().toISOString(),
        order: hydratedOrder,
        orders: [hydratedOrder],
      });
    }

    return res.status(404).json("created order failed");
  } catch (error) {
    return res.status(502).json(getErrorMessage(error, "created order failed"));
  }
});

router.post("/getOrders", authentication, async function (req, res, next) {
  const authData = getUserDataFromRequest(req);
  if (!authData) {
    return res.sendStatus(403);
  }

  let userData = {
    created_by: authData.data,
  };
  if (req.body && req.body.order_state) {
    userData.state = req.body.order_state;
  }
  if (req.body && req.body.order_ids) {
    userData.ids = req.body.order_ids;
  }

  try {
    let result = await axios.post(
      `http://${ENDPOINT_SELETOR(req.app.get("env"))}/order/orders`,
      userData
    );
    if (result && Array.isArray(result.data)) {
      const fixtureMap = await fetchFixtureMap(req.app);
      result.data.forEach((order) => {
        Object.assign(order, calculateOrderOutcome(order, fixtureMap));
      });
      return res.status(200).json(result.data);
    }

    return res.status(404).json("get orders failed");
  } catch (error) {
    return res.status(502).json(getErrorMessage(error, "get orders failed"));
  }
});

router.post(
  "/getHydratedOrders",
  authentication,
  async function (req, res, next) {
    const authData = getUserDataFromRequest(req);
    if (!authData) {
      return res.sendStatus(403);
    }

    let userData = {
      created_by: authData.data,
    };
    if (req.body && req.body.order_state) {
      userData.state = req.body.order_state;
    }
    if (req.body && req.body.order_ids) {
      userData.ids = req.body.order_ids;
    }

    try {
      let orderResult = await axios.post(
        `http://${ENDPOINT_SELETOR(req.app.get("env"))}/order/orders`,
        userData
      );
      const fixtureMap = await fetchFixtureMap(req.app);

      if (orderResult && Array.isArray(orderResult.data)) {
        orderResult.data.forEach((order) => {
          Object.assign(order, calculateOrderOutcome(order, fixtureMap));
        });
        return res.status(200).json(orderResult.data);
      }

      return res.status(404).json("get orders failed");
    } catch (error) {
      return res.status(502).json(getErrorMessage(error, "get orders failed"));
    }
  }
);

module.exports = router;
