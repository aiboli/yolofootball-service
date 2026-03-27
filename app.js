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

var app = express();
// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Add headers before the routes are defined
// const allowedOrigins = new Set([
//   "https://www.yolofootball.com",
//   "http://localhost:3001",
// ]);

app.use(function(req, res, next) {
  // const requestOrigin = req.headers.origin;
  // if (requestOrigin && allowedOrigins.has(requestOrigin)) {
  //   res.setHeader("Access-Control-Allow-Origin", requestOrigin);
  // }

  res.setHeader("Access-Control-Allow-Origin", "*");

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-Requested-With,content-type,Authorization"
  );

  res.setHeader("Access-Control-Allow-Credentials", true);

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/api/data", dataAPIRouter);
app.use("/api/users", userAPIRouter);
app.use("/api/orders", orderAPIRouter);
app.use("/api/events", eventAPIRouter);
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
