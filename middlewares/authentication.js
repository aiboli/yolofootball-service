const jwt = require('jsonwebtoken');

const authorization = (req, res, next) => {
    const token = req.cookies.access_token;
    if (!token) {
        return res.sendStatus(403);
    }
    try {
        const data = jwt.verify(token, 'yolofootball');
        console.log(data);
        // check if expired
        const expiredDate = data.exp;
        const td = new Date();
        const ed = new Date(expiredDate * 1000);
        if (ed <= td) {
            console.log('expired cookie');
            return res.sendStatus(403);
        }
        return next();
    } catch {
        return res.sendStatus(403);
    }
};

const getUserDataFromToken = (token) => {
    return jwt.verify(token, 'yolofootball');
}


module.exports = authorization;
module.exports.getUserDataFromToken = getUserDataFromToken;