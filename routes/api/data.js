var express = require('express');
var router = express.Router();
var ENDPOINTS = require('../../endpoints/endpoints');
var axios = require('axios');


/* GET users listing. */
router.get('/prepareData', async function(req, res, next) {
    let result = await axios.get(`http://${ENDPOINTS.DATACENTER_DEV}/actions/prepareData`);
    console.log(result.data);
    res.status(200).json(result.data);
});

module.exports = router;
