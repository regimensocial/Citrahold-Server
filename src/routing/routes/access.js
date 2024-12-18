const express = require("express");
const router = express.Router();

const bcrypt = require("bcrypt");
const validator = require("email-validator");

const SERVER_CONFIG = require("../../../config.json");

const { v4: uuidv4 } = require("uuid");

const { CONSTANTS, error } = require("../../shared.js");

const { shorthandTokens } = require("../../shared.js");
const { getUserID, getToken, checkIfEmailIsVerified, handleToken } = require("../../userAuthentication");
const { executeStatement, query } = require("../../database");
const { sendVerificationEmail, sendPasswordResetEmail } = require("../../emailFunctions");
const { generateRandomNumberString } = require("../../helpers");

const startTime = new Date();

router.all("/", (req, res) => {
	res.status(200).send({
		message: "Citrahold API",
		uptime: startTime.toISOString()
	});
});

router.post("/register", (req, res) => {

	let email = req.body.email;
	const password = req.body.password;

	if (
		!req.body.email ||
		!password ||
		typeof email !== "string" ||
		typeof password !== "string" ||
		!validator.validate(email) ||
		email.length > CONSTANTS.MAX_EMAIL_LENGTH ||
		password.length > CONSTANTS.MAX_PASSWORD_LENGTH
	) {
		return res.status(400).send({
			error: "Invalid email or password."
		});
	} else {

		email = email.toLowerCase();

		const queryString = "SELECT id FROM user WHERE email = ?"; 
		const queryParams = [email];

		query(queryString, queryParams).then((rows) => {
			if (rows.length > 0) {
				return res.status(409).send({
					error: "Email already in use."
				});

			} else {
				bcrypt.hash(password,
					SERVER_CONFIG.bcryptSaltRounds).then((hashedPassword) => {
						let sql = "INSERT INTO user (email, hash, timestamp, id, verified) VALUES (?, ?, ?, ?, ?)";
						const userID = uuidv4();
						let params = [email, hashedPassword, Date.now(), userID, 0];

						executeStatement(sql, params).then(() => {

							sql = "INSERT INTO verification (userID, id, timestamp) VALUES (?, ?, ?)";
							params = [userID, generateRandomNumberString(6), Date.now()];

							sendVerificationEmail(email, params[1]);

							executeStatement(sql, params).then(() => {

								res.send({
									userID: userID,
									note: "This account must be verified before it can be used."
								});
							}).catch((err) => {
								error(err);
								res.status(500).send({
									error: "Something went wrong."
								});
							});

						}).catch((err) => {
							error(err);
							res.status(500).send({
								error: "Something went wrong."
							});
						});
					});
			}
		});
	}
});

router.all("/getUserID", (req, res) => {

	if (!req.body.token || typeof req.body.token !== "string") {
		return res.status(400).send({
			error: "Invalid token."
		});
	}

	getUserID(req.body.token).then((userID) => {
		res.json({
			userID: userID
		});
	}).catch(() => {
		res.status(401).json({
			userID: "unknown"
		});
	});
});

router.post("/getToken", (req, res) => {
	
	if (
		req.body.shorthandToken &&
		typeof req.body.shorthandToken === "string" &&
		shorthandTokens[req.body.shorthandToken]
	) {

		getToken(shorthandTokens[req.body.shorthandToken][0]).then((token) => {
			res.send({ token });

			if (req.body.shorthandToken.length === 7) {
				const userID = shorthandTokens[req.body.shorthandToken][0];

				const sql = "UPDATE user SET hash = NULL WHERE id = ?";
				const params = [userID];

				executeStatement(sql, params).then().catch((err) => {
					error(err);
				});
			}

			delete shorthandTokens[req.body.shorthandToken];
		}).catch(() => { });

	} else {
		let email = req.body.email;
		const password = req.body.password;

		if (
			!email || !password ||
			typeof email !== "string" ||
			typeof password !== "string" ||
			email.length > CONSTANTS.MAX_EMAIL_LENGTH ||
			password.length > CONSTANTS.MAX_PASSWORD_LENGTH ||
			!validator.validate(email)
		) {
			return res.status(400).send({
				error: "Invalid email or password."
			});
		} else {
			email = email.toLowerCase();

			let queryString = "SELECT id, hash FROM user WHERE email = ?"; 
			let queryParams = [email];

			query(queryString, queryParams).then((rows) => {
				if (rows.length > 0) {
					const hashedPassword = rows[0].hash;
					const userID = rows[0].id;

					if (hashedPassword === null) {

						let userHasAlreadyRequestedPasswordReset = false;
						Object.keys(shorthandTokens).forEach(shorthandToken => {
							if (shorthandTokens[shorthandToken][0] === userID) {
								
								if (shorthandToken.length === 7) {
									userHasAlreadyRequestedPasswordReset = true;
									return;
								}
							}
						});

						if (!userHasAlreadyRequestedPasswordReset) {

							const shorthandToken = uuidv4().substring(0, 7);
							shorthandTokens[shorthandToken] = [userID, setTimeout(() => {
								delete shorthandTokens[shorthandToken];
							}, 120000)];

							sendPasswordResetEmail(email, shorthandToken);
						}

						return res.status(403).send({
							webStatus: "PASSWORD_RESET",
							userID: userID,
							note: "This account requires its password to be reset. Please check your email."
						});

					} else {
						bcrypt.compare(password, hashedPassword, function (err, result) {
							if (result === true) {

								checkIfEmailIsVerified(userID).then(() => {
									if (!req.body.new) {
										getToken(userID).then((token) => {
											res.send({ token });
										}).catch(() => { });
									} else {

										handleToken(userID).then((token) => {
											res.send({ token });
										});
									}
								}).catch(() => {
									
									queryString = "SELECT timestamp, id FROM verification WHERE userID = ?";
									queryParams = [userID];

									query(queryString, queryParams).then((rows) => {
										if (rows.length > 0) {
											
											if ((Date.now() - rows[0].timestamp) > 120000) {
												sendVerificationEmail(email, rows[0].id);
												
												const sql = "UPDATE verification SET timestamp = ? WHERE userID = ?";
												const params = [Date.now(), userID];

												executeStatement(sql, params).then().catch((err) => {
													error(err);
												});
											}

											res.status(403).send({
												webStatus: "VERIFY_EMAIL",
												userID: userID,
												note: "This account must be verified before it can be used."
											});

										} else { 
											res.status(500).send({
												webStatus: "INTERNAL_SERVER_ERROR",
												error: "Something went wrong."
											});
										}
									}).catch(() => {
										res.status(500).send({
											webStatus: "INTERNAL_SERVER_ERROR",
											error: "Something went wrong."
										});
									});

								});

							} else {
								return res.status(400).send({
									webStatus: "INVALID_DETAILS",
									error: "Invalid email or password."
								});
							}
						});

					}

				} else {
					return res.status(400).send({
						webStatus: "ACCOUNT_NOT_FOUND",
						error: "Account not found."
					});
				}
			});
		}
	}
});

router.post("/checkShorthandTokenExists", (req, res) => {
	if (!req.body.shorthandToken || typeof req.body.shorthandToken !== "string") {
		return res.status(400).send({
			error: "Invalid shorthand token."
		});
	}
	if (shorthandTokens[req.body.shorthandToken]) {
		res.send({
			exists: true
		});
	} else {
		res.send({
			exists: false
		});
	}
});

router.post("/shorthandToken", (req, res) => {

	const token = req.body.token;

	if (!token || typeof token !== "string") {
		return res.status(400).send({
			error: "Invalid token."
		});
	}

	getUserID(token).then((userID) => {
		
		Object.keys(shorthandTokens).forEach(shorthandToken => {
			if (shorthandTokens[shorthandToken][0] === userID) {
				
				clearTimeout(shorthandTokens[shorthandToken][1]);
				delete shorthandTokens[shorthandToken];
			}
		});

		if (!req.body.empty) {
			
			const shorthandToken = uuidv4().substring(0, 5);
			res.send({ shorthandToken });

			var timeout = setTimeout(() => { 
				delete shorthandTokens[shorthandToken];
			}, 120000);

			shorthandTokens[shorthandToken] = [userID, timeout];
		} else {
			res.send("cleared");
		}

	}).catch((err) => {
		error(err);
		res.status(401).send({
			error: "Invalid token."
		});
	});

});

module.exports = router;