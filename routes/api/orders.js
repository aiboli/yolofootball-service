var express = require("express");
var router = express.Router();
var ENDPOINT_SELETOR = require("../../endpoints/endpoints");
var axios = require("axios");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const saltRounds = 10;
const salt = bcrypt.genSaltSync(saltRounds);
const authentication = require("../../middlewares/authentication");

/* GET users listing. */
router.post("/", authentication, async function (req, res, next) {
  const accessToken = req.cookies.access_token || req.headers.authorization;
  const authData = jwt.verify(accessToken, "yolofootball");
  const userName = authData.data;
  const postbody = req.body;
  const orderToCreate = {
    fixture_id: postbody.fixture_id,
    bet_result: postbody.bet_result,
    odd_mount: postbody.odd_mount,
    fixture_state: postbody.fixture_state,
    odd_rate: postbody.odd_rate,
    win_return: postbody.win_return,
    user_name: userName,
  };
  console.log(orderToCreate);
  // check if user exists
  let result = await axios.post(
    `http://${ENDPOINT_SELETOR(req.app.get("env"))}/order/`,
    orderToCreate
  );
  console.log(result);
  if (result && result.data && result.data.created_by) {
    return res.status(200).json(result.data);
  } else {
    return res.status(404).json("created order failed");
  }
});
/**
 * get user's by its status
 */
router.post("/getOrders", authentication, async function (req, res, next) {
  console.log(req);
  const accessToken = req.cookies.access_token || req.headers.authorization;
  const authData = jwt.verify(accessToken, "yolofootball");
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
  console.log(userData);
  // check if user exists
  let result = await axios.post(
    `http://${ENDPOINT_SELETOR(req.app.get("env"))}/order/orders`,
    userData
  );
  if (result && result.data) {
    return res.status(200).json(result.data);
  } else {
    return res.status(404).json("get orders failed");
  }
});
/**
 * get user's order with hydrated information
 */
router.post(
  "/getHydatedOrders",
  authentication,
  async function (req, res, next) {
    console.log(req);
    const accessToken = req.cookies.access_token || req.headers.authorization;
    const authData = jwt.verify(accessToken, "yolofootball");
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
    console.log(userData);
    // check if user exists
    let orderResult = await axios.post(
      `http://${ENDPOINT_SELETOR(req.app.get("env"))}/order/orders`,
      userData
    );

    // get fixture information
    let fixtureResult = await axios.get(
      `http://${ENDPOINT_SELETOR(req.app.get("env"))}/fixtures/`
    );
    let fixtureMap = {};
    if (fixtureResult && fixtureResult.data) {
      fixtureResult.data.forEach((fixture) => {
        fixtureMap[fixture.id] = fixture;
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
  }
);

module.exports = router;
