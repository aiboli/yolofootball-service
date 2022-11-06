var express = require('express');
var router = express.Router();
var ENDPOINTS = require('../../endpoints/endpoints');
var axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const saltRounds = 10;
const salt = bcrypt.genSaltSync(saltRounds);

/* GET users listing. */
router.post('/', async function(req, res, next) {
    const token = req.cookies.access_token;
    const authData = jwt.verify(token, 'yolofootball');
    const userName = authData.data;
    const postbody = req.body;
    console.log(req.body);
    const orderToCreate = {
        fixture_id: postbody.fixture_id,
        bet_result: postbody.bet_result,
        odd_mount: postbody.odd_mount,
        fixture_state: postbody.fixture_state,
        user_name: userName
    }
    console.log(orderToCreate); 
  // check if user exists
  let result = await axios.post(`http://${ENDPOINTS.DATACENTER_DEV}/orders/`, orderToCreate);
  console.log(result);
  if (result && result.data && result.data.created_by) {
      return res.status(200).json('succeed');
  }
});

router.post('/signin', async function(req, res, next) {
    const userData = {
        username: req.body.user_name,
        password: req.body.user_password
    }
    // check if user exists
    let result = await axios.get(`http://${ENDPOINTS.DATACENTER_DEV}/user?user_name=${userData.username}`);
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
    const token = jwt.sign({data: userData.username}, 'yolofootball', { expiresIn: '7d' });
    return res.cookie("access_token", token).status(200).json({message: 'succeed'});
  });

module.exports = router;
