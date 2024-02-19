var express = require("express");
var router = express.Router();
const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("./openapi.json");
const authentication = require("../middlewares/authentication");
var ENDPOINT_SELETOR = require("../endpoints/endpoints");
var axios = require("axios");
const getUserDataFromToken =
  require("../middlewares/authentication").getUserDataFromToken;

/* GET home page. */
router.get("/", function (req, res, next) {
  res.render("index", { title: "Express" });
});

router.use("/api-docs", swaggerUi.serve);
router.get("/api-docs", swaggerUi.setup(swaggerDocument));

router.get("/login", function (req, res, next) {
  res.render("login", { title: "login page" });
});

router.get("/signup", function (req, res, next) {
  res.render("signup", { title: "signup page" });
});

router.get("/profile", authentication, async function (req, res, next) {
  // check if user exists
  const authData = getUserDataFromToken(req.cookies.access_token);
  const userName = authData.data;
  let result = await axios.get(
    `http://${ENDPOINT_SELETOR(req.app.get("env"))}/user?user_name=${userName}`
  );
  console.log(result.data);
  res.render("profile", {
    title: "profile page",
    username: result.data.user_name,
  });
});

module.exports = router;
