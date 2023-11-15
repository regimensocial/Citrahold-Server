
const express = require("express");
const router = express.Router();

const { getUserID } = require("../../userAuthentication.js");
const SERVER_CONFIG = require("../../../config.json");

router.post("/setTokenCookie", (req, res) => {

	if (!req.body.token || typeof req.body.token !== "string") {
		return res.status(400).send({
			error: "Invalid token."
		});
	}

	getUserID(req.body.token).then(() => {
		res.cookie("token", req.body.token, {
			maxAge: 1000 * 60 * 60 * 24 * 365,
			httpOnly: true,
			sameSite: SERVER_CONFIG.sameSitePolicy,
			secure: true
		});
		res.send({
			success: true
		});
	}).catch(() => {
		res.status(401).send({
			error: "Invalid token."
		});
	});
});

router.all("/deleteTokenCookie", (req, res) => {
	res.cookie("token", "", { 
		name: "token",
		sameSite: SERVER_CONFIG.sameSitePolicy,
		secure: true,
		maxAge: 0
	});
	res.send({
		success: true
	});
});

module.exports = router;