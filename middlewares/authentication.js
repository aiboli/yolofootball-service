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
        if (expiredDate <= new Date()) {
            console.log('expired cookie');
            return res.sendStatus(403);
        }
        return next();
    } catch {
        return res.sendStatus(403);
    }
};

module.exports = authorization;