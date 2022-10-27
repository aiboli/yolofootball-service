var express = require('express');
var router = express.Router();
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./openapi.json');
const authentication = require('../middlewares/authentication');

/* GET home page. */
router.get('/', authentication, function (req, res, next) {
  res.render('index', { title: 'Express' });
});

router.use('/api-docs', swaggerUi.serve);
router.get('/api-docs', swaggerUi.setup(swaggerDocument));

router.get('/login', function (req, res, next) {
  res.render('login', {title: 'login page'});
});

module.exports = router;
