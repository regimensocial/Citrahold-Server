const { log } = require("../shared");
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

	if (!req.body.token && ((req.cookies && req.cookies["token"] && req.cookies["token"].length) || (req.signedCookies && req.signedCookies["token"] && req.signedCookies["token"].length))) {
		var token = req.cookies["token"] || req.signedCookies["token"];

		if (!token || typeof token !== "string") {
			return next();
		}

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

const usageLogger = async (req, _res, next) => {
	let userID = "notLoggedIn";
	const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
	if (req.body.token && typeof req.body.token === "string") {
		await getUserID(req.body.token).then((id) => {
			userID = id;
		}).catch(() => {
		});
	}

	log(`${ip} (${userID}) | ${req.originalUrl} | ${req.get("User-Agent")}`);
	
	next();
};

module.exports = {
	jsonChecker,
	cookieChecker,
	usageLogger
};