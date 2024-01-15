var express = require('express');
var router = express.Router();
var ENDPOINT_SELETOR = require('../../endpoints/endpoints');
var axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const saltRounds = 10;
const salt = bcrypt.genSaltSync(saltRounds);
const authentication = require('../../middlewares/authentication');

/*POST create customized event*/
router.post('/', authentication, async function (req, res, next) {
    const accessToken = req.cookies.access_token;
    const authData = jwt.verify(accessToken, 'yolofootball');
    const userName = authData.data;
    const postbody = req.body;
    const oddData = JSON.parse(postbody.odd_data);
    /**
     * oddData : {
     * home: 1.2,
     * draw: 2.2,
     * away: 3.5
     * }
     */
    const poolFund = postbody.pool_fund;
    const maxBid = postbody.max_bid;
    const fixtureId = postbody.fixture_id;
    const matchedFund = 0; // todo


    // check if user exists
    let userProfile = await axios.get(`http://${ENDPOINT_SELETOR(req.app.get('env'))}/user?user_name=${userName}`);
    if (userProfile && !userProfile.data && !userProfile.data.user_name) {
        return res.status(401).redirect('/login');
    }
    // eligibility check
    let userBalance = userProfile.data.account_balance;
    if (!oddData || !poolFund || !fixtureId || !maxBid) {
        return res.status(400).send({ errorcode: 'createEventInvalidInput', errormessage: 'event input is invalid' });
    }
    if (poolFund > userBalance || poolFund == 0) {
        return res.status(400).send({ errorcode: 'createEventInvalidPoolFund', errormessage: 'your pool fund is invalid' });
    }
    if (maxBid > poolFund || maxBid == 0) {
        return res.status(400).send({ errorcode: 'createEventInvalidMaxBid', errormessage: 'your MaxBid is invalid' });
    }
    const eventToCreate = {
        fixture_id: fixtureId,
        odd_data: JSON.stringify(oddData),
        poll_fund: poolFund,
        matched_poll_fund: matchedFund,
        max_bid: maxBid
    };
    // create event

    let result = await axios.post(`http://${ENDPOINT_SELETOR(req.app.get('env'))}/customevents/`, eventToCreate);
    console.log(result);
    if (result && result.data && result.data.created_by) {
        return res.status(200).json(result.data);
    } else {
        return res.status(404).json('event create failed');
    }
});

/*GET customized event*/
/**
 * anonymous call that getting customized event 
 */
router.get('/', async function (req, res, next) {
    const queryParameters = req.query;
    if (!queryParameters) {
        return res.status(400).send({ errorcode: 'getEventInvalidInput', errormessage: 'event input is invalid' });
    }
    const eventId = queryParameters.id;
    // get event
    let result = await axios.get(`http://${ENDPOINT_SELETOR(req.app.get('env'))}/customevents?id=${eventId}`);
    console.log(result);
    if (result && result.data && result.data.created_by) {
        return res.status(200).json(result.data);
    } else {
        return res.status(404).json('get create failed');
    }
});

router.post('/signin', async function (req, res, next) {
    const userData = {
        username: req.body.user_name,
        password: req.body.user_password
    }
    // check if user exists
    let result = await axios.get(`http://${ENDPOINT_SELETOR(req.app.get('env'))}/user?user_name=${userData.username}`);
    if (result && !result.data && !result.data.user_name) {
        return res.status(401).redirect('/login');
    }
    const currentpassword = result.data.password;
    console.log(currentpassword);
    console.log(userData.password);
    //const hashPassword = bcrypt.hashSync(userData.password, salt);
    const passwordResult = await bcrypt.compare(userData.password, currentpassword);
    console.log(passwordResult);
    if (!passwordResult) {
        return res.status(401).redirect('/login');
    }
    const token = jwt.sign({ data: userData.username, exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24), }, 'yolofootball');
    return res.cookie("access_token", token).status(200).json({ message: 'succeed' });
});

module.exports = router;
