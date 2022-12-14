var express = require('express');
var router = express.Router();
var ENDPOINT_SELETOR = require('../../endpoints/endpoints');
var axios = require('axios');
var verifyCache = require('../../middlewares/memcache');
/* GET users listing. */
router.get('/prepareData', verifyCache, async function (req, res, next) {
    let result = await axios.get(`http://${ENDPOINT_SELETOR(req.app.get('env'))}/actions/prepareData`);
    if (result && result.data) {
        global.cache.set(req.originalUrl, result.data, 7); // second in time
        return res.status(200).json(result.data);
    }
    return res.status(404).json('fetch data failed');
});

module.exports = router;
