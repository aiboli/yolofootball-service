const VALID_NOTIFICATION_FILTERS = new Set(["read", "unread"]);
const DEFAULT_NOTIFICATION_LIMIT = 20;
const MAX_NOTIFICATION_LIMIT = 50;

const clampNotificationLimit = (value, fallbackValue = DEFAULT_NOTIFICATION_LIMIT) => {
  const parsedValue = Number.parseInt(value, 10);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallbackValue;
  }

  return Math.min(parsedValue, MAX_NOTIFICATION_LIMIT);
};

const normalizeNotificationFilter = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  return VALID_NOTIFICATION_FILTERS.has(normalizedValue) ? normalizedValue : null;
};

const serializeNotification = (notification) => ({
  id: notification?.id || "",
  type: notification?.type || "",
  status: notification?.status || "unread",
  title: notification?.title || "",
  body: notification?.body || "",
  ctaPath: notification?.cta_path || "/",
  entityType: notification?.entity_type || null,
  entityId: notification?.entity_id || null,
  createdAt: notification?.created_at || null,
  priority: notification?.priority || "normal",
  metadata:
    notification?.metadata && typeof notification.metadata === "object"
      ? notification.metadata
      : {},
});

module.exports = {
  DEFAULT_NOTIFICATION_LIMIT,
  MAX_NOTIFICATION_LIMIT,
  VALID_NOTIFICATION_FILTERS,
  clampNotificationLimit,
  normalizeNotificationFilter,
  serializeNotification,
};
