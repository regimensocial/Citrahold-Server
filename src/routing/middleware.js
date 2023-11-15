const { getUserID } = require("../userAuthentication");

const jsonChecker = (err, _req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        return res.status(400).send({
            error: "Invalid JSON format.",
        });
    }
    next();
};

const cookieChecker = (req, res, next) => {
	if (!req.body.token && (req.cookies["token"] || req.signedCookies["token"])) {
		var token = req.cookies["token"] || req.signedCookies["token"];
		getUserID(token).then((userID) => {
			req.body.token = token;
			req.body.userID = userID;
			next();
		}).catch(() => {
			res.clearCookie("token");
			next();
		});
	} else {
		next();
	}
};

module.exports = {
    jsonChecker,
    cookieChecker
};