var express = require("express");
var router = express.Router();
var ENDPOINT_SELETOR = require("../../endpoints/endpoints");
var axios = require("axios");
const authentication = require("../../middlewares/authentication");
const { getUserDataFromRequest } = require("../../utils/auth");
const { getErrorMessage } = require("../../utils/api");

const normalizeBetResult = (selection) => {
  if (selection.bet_result !== undefined) {
    return Number(selection.bet_result);
  }

  if (selection.selection_code !== undefined) {
    return Number(selection.selection_code);
  }

  if (selection.selection) {
    const normalizedSelection = String(selection.selection).toLowerCase();
    if (normalizedSelection === "home") {
      return 0;
    }
    if (normalizedSelection === "draw") {
      return 1;
    }
    if (normalizedSelection === "away") {
      return 2;
    }
  }

  return NaN;
};

const calculateCombinedOdd = (selections) => {
  return selections.reduce((total, selection) => {
    return total * (parseFloat(selection.odd_rate) || 1);
  }, 1);
};

const normalizeOrderPayload = (body) => {
  if (Array.isArray(body.selections) && body.selections.length > 0) {
    const selections = body.selections.map((selection) => ({
      fixture_id: selection.fixture_id,
      bet_result: normalizeBetResult(selection),
      odd_rate: parseFloat(selection.odd_rate),
      fixture_state: selection.fixture_state || "notstarted",
      market: selection.market || "match_winner",
      selection: selection.selection,
    }));

    return {
      orderType:
        body.order_type || (selections.length > 1 ? "accumulator" : "single"),
      stake: parseFloat(body.stake),
      combinedOdd:
        body.combined_odd !== undefined
          ? parseFloat(body.combined_odd)
          : calculateCombinedOdd(selections),
      winReturn: parseFloat(body.win_return),
      selections,
    };
  }

  return {
    orderType: "single",
    stake: parseFloat(body.odd_mount),
    combinedOdd: parseFloat(body.odd_rate),
    winReturn: parseFloat(body.win_return),
    selections: [
      {
        fixture_id: body.fixture_id,
        bet_result: Number(body.bet_result),
        odd_rate: parseFloat(body.odd_rate),
        fixture_state: body.fixture_state || "notstarted",
        market: "match_winner",
      },
    ],
  };
};

const isOrderPayloadValid = (normalizedPayload) => {
  if (!normalizedPayload.selections.length) {
    return false;
  }

  if (!Number.isFinite(normalizedPayload.stake) || normalizedPayload.stake <= 0) {
    return false;
  }

  if (!Number.isFinite(normalizedPayload.combinedOdd)) {
    return false;
  }

  if (!Number.isFinite(normalizedPayload.winReturn)) {
    return false;
  }

  const seenFixtureIds = new Set();
  return normalizedPayload.selections.every((selection) => {
    if (
      selection.fixture_id === undefined ||
      !Number.isFinite(selection.bet_result) ||
      !Number.isFinite(selection.odd_rate)
    ) {
      return false;
    }

    if (seenFixtureIds.has(selection.fixture_id)) {
      return false;
    }

    seenFixtureIds.add(selection.fixture_id);
    return true;
  });
};

const attachFixtureDetails = (order, fixtureMap) => {
  if (Array.isArray(order.selections) && order.selections.length > 0) {
    order.selection_details = order.selections.map((selection) => ({
      ...selection,
      fixture_details: fixtureMap[selection.fixture_id],
    }));
    order.fixture_details =
      fixtureMap[order.selections[0].fixture_id] || order.fixture_details;
  } else if (order.fixture_id !== undefined) {
    order.fixture_details = fixtureMap[order.fixture_id];
  }

  return order;
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
      const hydratedOrder = attachFixtureDetails(result.data, fixtureMap);

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
    if (result && result.data) {
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
          attachFixtureDetails(order, fixtureMap);
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
