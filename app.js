var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var NodeCache = require("node-cache");
global.cache = new NodeCache();
//console.log(global.cache);

var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");
var dataAPIRouter = require("./routes/api/data");
var userAPIRouter = require("./routes/api/users");
var orderAPIRouter = require("./routes/api/orders");
var eventAPIRouter = require("./routes/api/event");
var predictionAPIRouter = require("./routes/api/predictions");
var notificationAPIRouter = require("./routes/api/notifications");

var app = express();
var DEFAULT_ALLOWED_ORIGINS = [
  "https://yolofootball.com",
  "https://www.yolofootball.com",
  "http://localhost:3000",
  "http://localhost:3001",
];
var configuredAllowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(function(origin) {
    return origin.trim();
  })
  .filter(Boolean);
var allowedOrigins = new Set(
  DEFAULT_ALLOWED_ORIGINS.concat(configuredAllowedOrigins)
    .map(function(origin) {
      return origin.trim();
    })
    .filter(Boolean)
);

var applyCorsHeaders = function(req, res) {
  var requestOrigin = req.headers.origin;

  if (requestOrigin && allowedOrigins.has(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
};
// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(logger("dev"));

app.use(function(req, res, next) {
  applyCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/api/data", dataAPIRouter);
app.use("/api/users", userAPIRouter);
app.use("/api/orders", orderAPIRouter);
app.use("/api/events", eventAPIRouter);
app.use("/api/predictions", predictionAPIRouter);
app.use("/api/notifications", notificationAPIRouter);
// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

//cache function

module.exports = app;
