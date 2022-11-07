const verifyCache = (req, res, next) => {
    try {
        const id = req.originalUrl;
        if (global.cache.has(id)) {
            console.log('has cache, returned from cache!')
            return res.status(200).json(global.cache.get(id));
        }
        console.log('no cache go next');
        return next();
    } catch (err) {
        throw new Error(err);
    }
}

module.exports = verifyCache;