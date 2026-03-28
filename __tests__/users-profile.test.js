const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const router = require("../routes/api/users");
const { JWT_SECRET } = require("../utils/auth");

const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

const createServer = async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/users", router);
  app.use((error, req, res, next) => {
    res.status(500).json({ error: error.message });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
  };
};

test.afterEach(() => {
  axios.get = originalAxiosGet;
  axios.post = originalAxiosPost;
});

test("GET /api/users/profile returns expanded dashboard profile without sensitive fields", async () => {
  const token = jwt.sign(
    {
      data: "alice",
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    JWT_SECRET
  );
  const { server, baseUrl } = await createServer();

  axios.get = async (url) => {
    if (url === "http://datacenter.yolofootball.com/user?user_name=alice") {
      return {
        data: {
          user_name: "alice",
          user_email: "alice@example.com",
          user_wallet_id: "wallet-001",
          created_date: "2026-03-27T23:13:46.840Z",
          order_ids: ["order-2", "order-1", "order-6", "order-4", "order-3", "order-5"],
          created_bid_ids: ["event-4", "event-2", "event-6", "event-1", "event-5", "event-3"],
          account_balance: 10000,
          password: "sensitive-hash",
          is_valid_user: false,
          customized_field: {
            prefered_culture: "en-us",
          },
          id: "user-1",
          _etag: "private",
          _ts: 1774653240,
        },
      };
    }

    if (url === "http://datacenter.yolofootball.com/fixtures/") {
      return {
        data: [
          {
            fixture: {
              id: 101,
              date: "2026-03-28T18:00:00.000Z",
              status: {
                short: "NS",
              },
            },
            league: {
              id: 39,
              name: "Premier League",
              logo: "league.png",
            },
            teams: {
              home: {
                id: 1,
                name: "Arsenal",
                logo: "arsenal.png",
              },
              away: {
                id: 2,
                name: "Chelsea",
                logo: "chelsea.png",
              },
            },
            goals: {
              home: null,
              away: null,
            },
          },
          {
            fixture: {
              id: 202,
              date: "2026-03-28T21:00:00.000Z",
              status: {
                short: "FT",
              },
            },
            league: {
              id: 140,
              name: "La Liga",
              logo: "laliga.png",
            },
            teams: {
              home: {
                id: 3,
                name: "Real Madrid",
                logo: "real.png",
              },
              away: {
                id: 4,
                name: "Barcelona",
                logo: "barca.png",
              },
            },
            goals: {
              home: 2,
              away: 1,
            },
          },
        ],
      };
    }

    throw new Error(`Unexpected GET ${url}`);
  };

  axios.post = async (url) => {
    if (url === "http://datacenter.yolofootball.com/order/orders") {
      return {
        data: [
          {
            id: "order-1",
            orderdate: 101,
            fixture_id: 101,
            bet_result: 0,
            odd_rate: 1.8,
            odd_mount: 100,
            win_return: 180,
            actual_return: 0,
            state: "pending",
            fixture_state: "notstarted",
          },
          {
            id: "order-2",
            orderdate: 202,
            fixture_id: 202,
            bet_result: 0,
            odd_rate: 2.1,
            odd_mount: 120,
            win_return: 252,
            actual_return: 252,
            state: "completed",
            fixture_state: "finished",
          },
          {
            id: "order-3",
            orderdate: 303,
            fixture_id: 101,
            bet_result: 1,
            odd_rate: 3.4,
            odd_mount: 50,
            win_return: 170,
            actual_return: 0,
            state: "pending",
            fixture_state: "notstarted",
          },
          {
            id: "order-4",
            orderdate: 404,
            fixture_id: 202,
            bet_result: 1,
            odd_rate: 3.2,
            odd_mount: 70,
            win_return: 224,
            actual_return: 0,
            state: "completed",
            fixture_state: "finished",
          },
          {
            id: "order-5",
            orderdate: 505,
            fixture_id: 101,
            bet_result: 2,
            odd_rate: 4.2,
            odd_mount: 30,
            win_return: 126,
            actual_return: 0,
            state: "pending",
            fixture_state: "notstarted",
          },
          {
            id: "order-6",
            orderdate: 606,
            fixture_id: 202,
            bet_result: 0,
            odd_rate: 1.7,
            odd_mount: 90,
            win_return: 153,
            actual_return: 153,
            state: "completed",
            fixture_state: "finished",
          },
        ],
      };
    }

    if (url === "http://datacenter.yolofootball.com/customevent/bulk") {
      return {
        data: [
          {
            id: "event-1",
            fixture_id: 101,
            fixture_state: "notstarted",
            created_by: "alice",
            create_date: 1001,
            status: "active",
            market: "match_winner",
            odd_data: {
              market: "match_winner",
              options: [
                { result: 0, label: "Home", odd: 1.8 },
                { result: 1, label: "Draw", odd: 3.2 },
                { result: 2, label: "Away", odd: 4.5 },
              ],
            },
            associated_order_ids: [],
          },
          {
            id: "event-2",
            fixture_id: 202,
            fixture_state: "finished",
            created_by: "alice",
            create_date: 2002,
            status: "completed",
            market: "match_winner",
            odd_data: {
              market: "match_winner",
              options: [
                { result: 0, label: "Home", odd: 2.0 },
                { result: 1, label: "Draw", odd: 3.3 },
                { result: 2, label: "Away", odd: 3.8 },
              ],
            },
            associated_order_ids: ["order-2"],
          },
          {
            id: "event-3",
            fixture_id: 101,
            fixture_state: "notstarted",
            created_by: "alice",
            create_date: 3003,
            status: "active",
            market: "match_winner",
            odd_data: {
              market: "match_winner",
              options: [
                { result: 0, label: "Home", odd: 1.9 },
                { result: 1, label: "Draw", odd: 3.1 },
                { result: 2, label: "Away", odd: 4.1 },
              ],
            },
            associated_order_ids: [],
          },
          {
            id: "event-4",
            fixture_id: 202,
            fixture_state: "finished",
            created_by: "alice",
            create_date: 4004,
            status: "completed",
            market: "match_winner",
            odd_data: {
              market: "match_winner",
              options: [
                { result: 0, label: "Home", odd: 1.7 },
                { result: 1, label: "Draw", odd: 3.4 },
                { result: 2, label: "Away", odd: 4.0 },
              ],
            },
            associated_order_ids: ["order-6"],
          },
          {
            id: "event-5",
            fixture_id: 101,
            fixture_state: "notstarted",
            created_by: "alice",
            create_date: 5005,
            status: "active",
            market: "match_winner",
            odd_data: {
              market: "match_winner",
              options: [
                { result: 0, label: "Home", odd: 1.85 },
                { result: 1, label: "Draw", odd: 3.15 },
                { result: 2, label: "Away", odd: 4.35 },
              ],
            },
            associated_order_ids: [],
          },
          {
            id: "event-6",
            fixture_id: 202,
            fixture_state: "finished",
            created_by: "alice",
            create_date: 6006,
            status: "completed",
            market: "match_winner",
            odd_data: {
              market: "match_winner",
              options: [
                { result: 0, label: "Home", odd: 1.95 },
                { result: 1, label: "Draw", odd: 3.25 },
                { result: 2, label: "Away", odd: 3.9 },
              ],
            },
            associated_order_ids: ["order-4"],
          },
        ],
      };
    }

    throw new Error(`Unexpected POST ${url}`);
  };

  try {
    const response = await fetch(`${baseUrl}/api/users/profile`, {
      headers: {
        Authorization: token,
      },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.message, "succeed");
    assert.equal(body.userProfile.userName, "alice");
    assert.equal(body.userProfile.userEmail, "alice@example.com");
    assert.equal(body.userProfile.walletId, "wallet-001");
    assert.equal(body.userProfile.preferredCulture, "en-us");
    assert.equal(body.userProfile.createdDate, "2026-03-27T23:13:46.840Z");
    assert.equal(body.userProfile.isValidUser, false);
    assert.equal(body.userProfile.orderCount, 6);
    assert.equal(body.userProfile.customEventCount, 6);
    assert.equal(body.userProfile.recentOrders.length, 5);
    assert.equal(body.userProfile.recentCustomEvents.length, 5);
    assert.equal(body.userProfile.recentOrders[0].id, "order-6");
    assert.equal(body.userProfile.recentCustomEvents[0].id, "event-6");
    assert.equal(
      body.userProfile.recentOrders[0].selectionDetails[0].fixture.teams.home.name,
      "Real Madrid"
    );
    assert.equal(
      body.userProfile.recentCustomEvents[0].fixture.league.name,
      "La Liga"
    );
    assert.equal("password" in body.userProfile, false);
    assert.equal("_etag" in body.userProfile, false);
    assert.equal("_ts" in body.userProfile, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
