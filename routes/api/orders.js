var express = require("express");
var router = express.Router();
var ENDPOINT_SELETOR = require("../../endpoints/endpoints");
var axios = require("axios");
const authentication = require("../../middlewares/authentication");
const { getUserDataFromRequest } = require("../../utils/auth");
const { getErrorMessage } = require("../../utils/api");

/* GET users listing. */
router.post("/", authentication, async function (req, res, next) {
  const authData = getUserDataFromRequest(req);
  if (!authData) {
    return res.sendStatus(403);
  }

  const userName = authData.data;
  const postbody = req.body;
  if (
    !postbody ||
    postbody.fixture_id === undefined ||
    postbody.bet_result === undefined ||
    postbody.odd_mount === undefined ||
    postbody.fixture_state === undefined ||
    postbody.odd_rate === undefined ||
    postbody.win_return === undefined
  ) {
    return res.status(400).json({ message: "invalid order payload" });
  }

  const orderToCreate = {
    fixture_id: postbody.fixture_id,
    bet_result: postbody.bet_result,
    odd_mount: postbody.odd_mount,
    fixture_state: postbody.fixture_state,
    odd_rate: postbody.odd_rate,
    win_return: postbody.win_return,
    user_name: userName,
  };

  try {
    let result = await axios.post(
      `http://${ENDPOINT_SELETOR(req.app.get("env"))}/order/`,
      orderToCreate
    );
    if (result && result.data && result.data.created_by) {
      return res.status(200).json(result.data);
    }
    return res.status(404).json("created order failed");
  } catch (error) {
    return res.status(502).json(getErrorMessage(error, "created order failed"));
  }
});
/**
 * get user's by its status
 */
router.post("/getOrders", authentication, async function (req, res, next) {
  const authData = getUserDataFromRequest(req);
  if (!authData) {
    return res.sendStatus(403);
  }

  const userName = authData.data;
  let userData = {
    created_by: userName,
  };
  if (req.body && req.body.order_state) {
    userData.state = req.body.order_state; //pending, completed, canceled
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
/**
 * get user's order with hydrated information v2
 */
router.post(
  "/getHydratedOrders",
  authentication,
  async function (req, res, next) {
    const authData = getUserDataFromRequest(req);
    if (!authData) {
      return res.sendStatus(403);
    }

    const userName = authData.data;
    let userData = {
      created_by: userName,
    };
    if (req.body && req.body.order_state) {
      userData.state = req.body.order_state; //pending, completed, canceled
    }
    if (req.body && req.body.order_ids) {
      userData.ids = req.body.order_ids;
    }

    try {
      let orderResult = await axios.post(
        `http://${ENDPOINT_SELETOR(req.app.get("env"))}/order/orders`,
        userData
      );

      let fixtureResult = await axios.get(
        `http://${ENDPOINT_SELETOR(req.app.get("env"))}/fixtures/`
      );
      let fixtureMap = {};
      if (fixtureResult && fixtureResult.data) {
        fixtureResult.data.forEach((fixture) => {
          fixtureMap[fixture.fixture.id] = fixture;
        });
      }
      if (orderResult && orderResult.data) {
        orderResult.data.forEach((order) => {
          order.fixture_details = fixtureMap[order.fixture_id];
        });
        return res.status(200).json(orderResult.data);
      } else {
        return res.status(404).json("get orders failed");
      }
    } catch (error) {
      return res.status(502).json(getErrorMessage(error, "get orders failed"));
    }
  }
);

module.exports = router;
