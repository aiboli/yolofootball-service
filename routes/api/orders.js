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
  const userData = {
    ids: JSON.parse(req.body.order_ids),
    state: req.body.order_state, //pending, completed, canceled
    created_by: userName,
  };
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

module.exports = router;
