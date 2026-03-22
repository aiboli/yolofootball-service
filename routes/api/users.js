var express = require("express");
var router = express.Router();
var ENDPOINT_SELETOR = require("../../endpoints/endpoints");
const getUserDataFromToken =
  require("../../middlewares/authentication").getUserDataFromToken;
var axios = require("axios");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../../utils/auth");
const { getErrorMessage } = require("../../utils/api");

/* GET users listing. */
router.post("/signup", async function (req, res, next) {
  if (!req.body.user_name || !req.body.user_email || !req.body.user_password) {
    return res.status(400).json({ message: "failed" });
  }

  const userData = {
    username: req.body.user_name,
    email: req.body.user_email,
    password: req.body.user_password,
    redirectURL: req.body.redirect_to,
  };

  try {
    let result = await axios.get(
      `http://${ENDPOINT_SELETOR(req.app.get("env"))}/user?user_name=${
        userData.username
      }`
    );
    if (result && result.data && result.data.user_name) {
      return res.status(409).json({ message: "failed" });
    }

    const hashPassword = await bcrypt.hash(userData.password, 10);
    let signupResult = await axios.post(
      `http://${ENDPOINT_SELETOR(req.app.get("env"))}/user`,
      {
        user_name: userData.username,
        email: userData.email,
        user_wallet_id: "001",
        created_date: new Date(),
        order_ids: [],
        created_bid_ids: [],
        amount: 10000,
        password: hashPassword,
        is_valid_user: false,
        customized_field: {
          prefered_culture: "en-us",
        },
      }
    );
    if (signupResult.status === 200) {
      const token = jwt.sign(
        {
          data: userData.username,
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
        },
        JWT_SECRET
      );
      return res.status(200).json({
        message: "succeed",
        redirectURL: userData.redirectURL,
        accessToken: token,
        userProfile: {
          userName: signupResult.data.user_name,
          userEmail: signupResult.data.user_email || userData.email,
          userId: signupResult.data.id,
          userOrderIds: signupResult.data.order_ids || [],
          userCreatedBidIds: signupResult.data.created_bid_ids || [],
          userBalance: signupResult.data.account_balance ?? signupResult.data.amount,
        },
      });
    }

    return res.status(500).json({ message: "failed" });
  } catch (error) {
    return res.status(502).json({ message: getErrorMessage(error, "failed") });
  }
});

router.post("/signin", async function (req, res, next) {
  const userData = {
    username: req.body.user_name,
    password: req.body.user_password,
    redirectURL: req.body.redirect_to,
  };
  if (!userData.username || !userData.password) {
    return res.status(400).json({ message: "wrong user" });
  }

  try {
    let result = await axios.get(
      `http://${ENDPOINT_SELETOR(req.app.get("env"))}/user?user_name=${
        userData.username
      }`
    );
    if (!result || !result.data || !result.data.user_name) {
      return res.status(401).json({ message: "wrong user" });
    }

    const currentpassword = result.data.password;
    const passwordResult = await bcrypt.compare(
      userData.password,
      currentpassword
    );
    if (!passwordResult) {
      return res.status(401).json({ message: "wrong password" });
    }

    const token = jwt.sign(
      {
        data: userData.username,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      },
      JWT_SECRET
    );
    return res
      .cookie("access_token", token, { httpOnly: false })
      .status(200)
      .json({
        message: "succeed",
        redirectURL: userData.redirectURL,
        accessToken: token,
        userProfile: {
          userName: result.data.user_name,
          userEmail: result.data.user_email,
          userId: result.data.id,
          userOrderIds: result.data.order_ids || [],
          userCreatedBidIds: result.data.created_bid_ids || [],
          userBalance: result.data.account_balance ?? result.data.amount,
        },
      });
  } catch (error) {
    return res.status(502).json({ message: getErrorMessage(error, "wrong user") });
  }
});

router.get("/profile", async function (req, res, next) {
  if (!req.headers || !req.headers.authorization) {
    return res.status(401).json({
      message: "unauth",
    });
  }

  try {
    const authData = getUserDataFromToken(req.headers.authorization);
    const userName = authData.data;
    let result = await axios.get(
      `http://${ENDPOINT_SELETOR(req.app.get("env"))}/user?user_name=${userName}`
    );
    if (result.data && result.data.user_name) {
      return res.status(200).json({
        message: "succeed",
        userProfile: {
          userName: result.data.user_name,
          userEmail: result.data.user_email,
          userId: result.data.id,
          userOrderIds: result.data.order_ids || [],
          userCreatedBidIds: result.data.created_bid_ids || [],
          userBalance: result.data.account_balance ?? result.data.amount,
        },
      });
    }
  } catch (error) {
    return res.status(401).json({
      message: "unauth",
    });
  }

  return res.status(401).json({
    message: "unauth",
  });
});

module.exports = router;
