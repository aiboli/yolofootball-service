var express = require("express");
var axios = require("axios");
var ENDPOINT_SELETOR = require("../../endpoints/endpoints");
const authentication = require("../../middlewares/authentication");
const { getUserDataFromRequest } = require("../../utils/auth");
const { getErrorMessage } = require("../../utils/api");
const {
  DEFAULT_NOTIFICATION_LIMIT,
  clampNotificationLimit,
  normalizeNotificationFilter,
  serializeNotification,
} = require("../../utils/notifications");

const getDatacenterBaseUrl = (app) =>
  `http://${ENDPOINT_SELETOR(app.get("env"))}/notification`;

const createNotificationsRouter = ({
  httpClient = axios,
  authMiddleware = authentication,
  getAuthenticatedUser = getUserDataFromRequest,
} = {}) => {
  const router = express.Router();

  router.get("/", authMiddleware, async function (req, res, next) {
    const authData = getAuthenticatedUser(req);
    if (!authData?.data) {
      return res.sendStatus(403);
    }

    const status = req.query?.status ? normalizeNotificationFilter(req.query.status) : null;
    if (req.query?.status && !status) {
      return res.status(400).json({ message: "status must be read or unread" });
    }

    try {
      const response = await httpClient.get(getDatacenterBaseUrl(req.app), {
        params: {
          user_name: authData.data,
          ...(status ? { status } : {}),
          limit: clampNotificationLimit(req.query?.limit, DEFAULT_NOTIFICATION_LIMIT),
        },
      });
      const notifications = Array.isArray(response?.data?.notifications)
        ? response.data.notifications.map(serializeNotification)
        : [];

      return res.status(200).json({
        message: "succeed",
        notifications,
      });
    } catch (error) {
      return res.status(502).json({
        message: getErrorMessage(error, "failed to load notifications"),
      });
    }
  });

  router.get("/unread-count", authMiddleware, async function (req, res, next) {
    const authData = getAuthenticatedUser(req);
    if (!authData?.data) {
      return res.sendStatus(403);
    }

    try {
      const response = await httpClient.get(`${getDatacenterBaseUrl(req.app)}/unread-count`, {
        params: {
          user_name: authData.data,
        },
      });

      return res.status(200).json({
        message: "succeed",
        unreadCount: Number(response?.data?.unread_count || 0),
      });
    } catch (error) {
      return res.status(502).json({
        message: getErrorMessage(error, "failed to load unread count"),
      });
    }
  });

  router.put("/:notificationId/read", authMiddleware, async function (req, res, next) {
    const authData = getAuthenticatedUser(req);
    if (!authData?.data) {
      return res.sendStatus(403);
    }

    const notificationId = req.params?.notificationId;
    if (!notificationId) {
      return res.status(400).json({ message: "notification id is required" });
    }

    try {
      const response = await httpClient.put(
        `${getDatacenterBaseUrl(req.app)}/${encodeURIComponent(notificationId)}/read`,
        {
          user_name: authData.data,
        }
      );

      return res.status(200).json({
        message: "succeed",
        notification: serializeNotification(response?.data),
      });
    } catch (error) {
      const statusCode = error.response?.status === 404 ? 404 : 502;
      return res.status(statusCode).json({
        message:
          statusCode === 404
            ? "notification not found"
            : getErrorMessage(error, "failed to mark notification read"),
      });
    }
  });

  router.put("/read-all", authMiddleware, async function (req, res, next) {
    const authData = getAuthenticatedUser(req);
    if (!authData?.data) {
      return res.sendStatus(403);
    }

    try {
      const response = await httpClient.put(
        `${getDatacenterBaseUrl(req.app)}/read-all/${encodeURIComponent(authData.data)}`
      );

      return res.status(200).json({
        message: "succeed",
        updatedCount: Number(response?.data?.updated_count || 0),
      });
    } catch (error) {
      return res.status(502).json({
        message: getErrorMessage(error, "failed to mark all notifications read"),
      });
    }
  });

  return router;
};

module.exports = createNotificationsRouter();
module.exports.createNotificationsRouter = createNotificationsRouter;
