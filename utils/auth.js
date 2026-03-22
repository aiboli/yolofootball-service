const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "yolofootball";

const getAccessToken = (req) => {
  return req.cookies.access_token || req.headers.authorization;
};

const getUserDataFromRequest = (req) => {
  const token = getAccessToken(req);
  if (!token) {
    return null;
  }

  return jwt.verify(token, JWT_SECRET);
};

module.exports = {
  JWT_SECRET,
  getAccessToken,
  getUserDataFromRequest,
};
