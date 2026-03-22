const jwt = require("jsonwebtoken");
const { JWT_SECRET, getAccessToken } = require("../utils/auth");

const authorization = (req, res, next) => {
  const token = getAccessToken(req);
  if (!token) {
    return res.sendStatus(403);
  }

  try {
    jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.sendStatus(403);
  }
};

const getUserDataFromToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

module.exports = authorization;
module.exports.getUserDataFromToken = getUserDataFromToken;
