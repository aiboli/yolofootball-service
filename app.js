var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var NodeCache = require('node-cache');
global.cache = new NodeCache();
//console.log(global.cache);

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var dataAPIRouter = require('./routes/api/data');
var userAPIRouter = require('./routes/api/users');
var orderAPIRouter = require('./routes/api/orders');

var app = express();
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/api/data', dataAPIRouter);
app.use('/api/users', userAPIRouter);
app.use('/api/orders', orderAPIRouter);
// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

//cache function

module.exports = app;
