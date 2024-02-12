var express = require("express");
var router = express.Router();
var ENDPOINT_SELETOR = require("../../endpoints/endpoints");
var axios = require("axios");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const saltRounds = 10;
const salt = bcrypt.genSaltSync(saltRounds);

/* GET users listing. */
router.post("/signup", async function (req, res, next) {
  const userData = {
    username: req.body.user_name,
    email: req.body.user_email,
    password: req.body.user_password,
  };
  // check if user exists
  let result = await axios.get(
    `http://${ENDPOINT_SELETOR(req.app.get("env"))}/user?user_name=${
      userData.username
    }`
  );
  if (result && result.data && result.data.user_name) {
    return res.status(301).redirect("/login");
  }
  const hashPassword = bcrypt.hashSync(userData.password, salt);
  let signupResult = await axios.post(
    `http://${ENDPOINT_SELETOR(req.app.get("env"))}/user`,
    {
      user_name: userData.username,
      email: userData.email,
      user_wallet_id: "001",
      created_date: new Date(),
      order_ids: [],
      created_bid_ids: [],
      account_balance: 10000,
      password: hashPassword,
      is_valid_user: false,
      customized_field: {
        prefered_culture: "en-us",
      },
    }
  );
  if (signupResult.status == 200) {
    const token = jwt.sign(
      {
        data: userData.username,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      },
      "yolofootball"
    );
    console.log(token);
    return res
      .cookie("access_token", token)
      .status(200)
      .json({ message: "succeed" });
  } else {
    return res.status(301).json({ message: "failed" });
  }
});

router.post("/signin", async function (req, res, next) {
  const userData = {
    username: req.body.user_name,
    password: req.body.user_password,
    redirectURL: req.body.redirect_to,
  };
  console.log(userData);
  // check if user exists
  let result = await axios.get(
    `http://${ENDPOINT_SELETOR(req.app.get("env"))}/user?user_name=${
      userData.username
    }`
  );
  console.log(result);
  if (result && !result.data && !result.data.user_name) {
    console.log("user not found");
    return res.status(401).json({ message: "wrong user" });
  }
  const currentpassword = result.data.password;
  console.log(currentpassword);
  console.log(userData.password);
  // no need to hash
  //const hashPassword = bcrypt.hashSync(userData.password, salt);
  const passwordResult = await bcrypt.compare(
    userData.password,
    currentpassword
  );
  console.log(passwordResult);
  if (!passwordResult) {
    return res.status(401).json({ message: "wrong password" });
  }
  const token = jwt.sign(
    {
      data: userData.username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    },
    "yolofootball"
  );
  return res
    .cookie("access_token", token)
    .status(200)
    .json({ message: "succeed", redirectURL: userData.redirectURL });
});

module.exports = router;
