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
const { calculateOrderOutcome } = require("../../utils/orderSettlement");

const MAX_RECENT_ITEMS = 5;

const getDatacenterBaseUrl = (app) =>
  `http://${ENDPOINT_SELETOR(app.get("env"))}`;

const serializeFixtureSummary = (fixtureDetails) => {
  if (!fixtureDetails) {
    return null;
  }

  return {
    id: fixtureDetails.fixture?.id ?? null,
    date: fixtureDetails.fixture?.date ?? null,
    status: fixtureDetails.fixture?.status?.short ?? null,
    league: fixtureDetails.league
      ? {
          id: fixtureDetails.league.id ?? null,
          name: fixtureDetails.league.name ?? null,
          logo: fixtureDetails.league.logo ?? null,
        }
      : null,
    teams:
      fixtureDetails.teams && fixtureDetails.teams.home && fixtureDetails.teams.away
        ? {
            home: {
              id: fixtureDetails.teams.home.id ?? null,
              name: fixtureDetails.teams.home.name ?? null,
              logo: fixtureDetails.teams.home.logo ?? null,
            },
            away: {
              id: fixtureDetails.teams.away.id ?? null,
              name: fixtureDetails.teams.away.name ?? null,
              logo: fixtureDetails.teams.away.logo ?? null,
            },
          }
        : null,
  };
};

const serializeSelectionDetail = (selection) => ({
  fixtureId: selection.fixture_id,
  betResult: selection.bet_result,
  oddRate: selection.odd_rate,
  fixtureState: selection.fixture_state || "notstarted",
  market: selection.market || "match_winner",
  selection: selection.selection || null,
  fixtureResult: selection.fixture_result || "pending",
  isSettled: !!selection.is_settled,
  actualResult:
    selection.actual_result !== undefined ? selection.actual_result : null,
  fixture: serializeFixtureSummary(selection.fixture_details),
});

const serializeRecentOrder = (order) => ({
  id: order.id,
  orderDate: order.orderdate || null,
  state: order.state || "pending",
  orderType: order.order_type || "single",
  selectionCount: order.selection_count || 1,
  oddRate: Number(order.odd_rate || 0),
  stake: Number(order.odd_mount || 0),
  winReturn: Number(order.win_return || 0),
  actualReturn: Number(order.actual_return || 0),
  orderResult: order.order_result || "pending",
  isSettled: !!order.is_settled,
  settledWinReturn:
    order.settled_win_return !== null && order.settled_win_return !== undefined
      ? Number(order.settled_win_return)
      : null,
  fixture: serializeFixtureSummary(order.fixture_details),
  selectionDetails: Array.isArray(order.selection_details)
    ? order.selection_details.map(serializeSelectionDetail)
    : [],
});

const serializeRecentCustomEvent = (event, fixtureMap) => ({
  id: event.id,
  fixtureId: Number(event.fixture_id),
  fixtureState: event.fixture_state || "notstarted",
  createdBy: event.created_by || null,
  createdDate: event.create_date || null,
  status: event.status || "active",
  market: event.market || event?.odd_data?.market || "match_winner",
  oddData: event.odd_data || null,
  poolFund: Number(event.pool_fund || 0),
  matchedPoolFund: Number(event.matched_pool_fund || 0),
  investedPoolFund: Number(event.invested_pool_fund || 0),
  actualReturn: Number(event.actual_return || 0),
  associatedOrderIds: Array.isArray(event.associated_order_ids)
    ? event.associated_order_ids
    : [],
  fixture: serializeFixtureSummary(fixtureMap[Number(event.fixture_id)]),
});

const buildUserProfilePayload = async (app, userRecord) => {
  const orderIds = Array.isArray(userRecord.order_ids) ? userRecord.order_ids : [];
  const customEventIds = Array.isArray(userRecord.created_bid_ids)
    ? userRecord.created_bid_ids
    : [];
  const needsActivityHydration = orderIds.length > 0 || customEventIds.length > 0;

  let fixtureMap = {};
  if (needsActivityHydration) {
    try {
      const fixtureResult = await axios.get(`${getDatacenterBaseUrl(app)}/fixtures/`);
      if (Array.isArray(fixtureResult?.data)) {
        fixtureResult.data.forEach((fixture) => {
          fixtureMap[fixture.fixture.id] = fixture;
        });
      }
    } catch (error) {
      fixtureMap = {};
    }
  }

  let recentOrders = [];
  if (orderIds.length > 0) {
    try {
      const orderResult = await axios.post(`${getDatacenterBaseUrl(app)}/order/orders`, {
        ids: orderIds,
      });
      recentOrders = Array.isArray(orderResult?.data)
        ? orderResult.data
            .map((order) => calculateOrderOutcome(order, fixtureMap))
            .sort((left, right) => Number(right.orderdate || 0) - Number(left.orderdate || 0))
            .slice(0, MAX_RECENT_ITEMS)
            .map(serializeRecentOrder)
        : [];
    } catch (error) {
      recentOrders = [];
    }
  }

  let recentCustomEvents = [];
  if (customEventIds.length > 0) {
    try {
      const customEventResult = await axios.post(
        `${getDatacenterBaseUrl(app)}/customevent/bulk`,
        {
          ids: customEventIds,
        }
      );
      recentCustomEvents = Array.isArray(customEventResult?.data)
        ? customEventResult.data
            .sort(
              (left, right) => Number(right.create_date || 0) - Number(left.create_date || 0)
            )
            .slice(0, MAX_RECENT_ITEMS)
            .map((event) => serializeRecentCustomEvent(event, fixtureMap))
        : [];
    } catch (error) {
      recentCustomEvents = [];
    }
  }

  return {
    userName: userRecord.user_name,
    userEmail: userRecord.user_email,
    userId: userRecord.id,
    userOrderIds: orderIds,
    userCreatedBidIds: customEventIds,
    userBalance: userRecord.account_balance ?? userRecord.amount ?? 0,
    createdDate: userRecord.created_date || null,
    isValidUser: !!userRecord.is_valid_user,
    preferredCulture: userRecord.customized_field?.prefered_culture || null,
    walletId: userRecord.user_wallet_id || null,
    orderCount: orderIds.length,
    customEventCount: customEventIds.length,
    recentOrders,
    recentCustomEvents,
  };
};

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
      const userProfile = await buildUserProfilePayload(req.app, signupResult.data);
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
        userProfile,
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
        userProfile: await buildUserProfilePayload(req.app, result.data),
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
      const userProfile = await buildUserProfilePayload(req.app, result.data);
      return res.status(200).json({
        message: "succeed",
        userProfile,
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
module.exports._private = {
  MAX_RECENT_ITEMS,
  serializeFixtureSummary,
  serializeSelectionDetail,
  serializeRecentOrder,
  serializeRecentCustomEvent,
  buildUserProfilePayload,
};
