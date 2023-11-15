const express = require("express");
const router = express.Router();

const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");
const validator = require("email-validator");
const { v4: uuidv4 } = require("uuid");

const { CONSTANTS, shorthandTokens, ROOT_DIRECTORY } = require("../../shared.js");
const { getUserID, changePassword, handleToken, checkIfEmailIsVerified, getToken, getUserIDFromEmail, userIsNotResettingEmail } = require("../../userAuthentication.js");
const { query, executeStatement } = require("../../database.js");
const { sendPasswordResetEmail, sendVerificationEmail } = require("../../emailFunctions.js");
const { generateRandomNumberString } = require("../../helpers.js");

router.post("/changePassword", (req, res) => {

	const token = req.body.token;
	const oldPassword = req.body.password;
	const newPassword = req.body.newPassword;

	if (
		!token ||
		!newPassword ||
		typeof token !== "string" ||
		typeof newPassword !== "string"
	) {
		return res.status(400).send({

			webStatus: "INVALID_CREDENTIALS",
			error: "Invalid token, current password or new password."
		});
	}

	getUserID(token).then((userID) => {

		const queryString = "SELECT hash FROM user WHERE id = ?"; // WHERE id = ?
		const queryParams = [userID];

		query(queryString, queryParams).then((rows) => {
			if (rows.length > 0) {
				const hashedPassword = rows[0].hash;
				let allowPasswordReset = false;

				if (hashedPassword === null) {
					allowPasswordReset = true;
					changePassword(userID, newPassword).then(() => {
						return res.send({
							success: true,
							note: "Password changed."
						});
					}, (err) => {
						console.error(err);
						return res.status(500).send({
							error: "Something went wrong."
						});
					});

					return;
				}

				// this is here because if the user has a null password hash, we don't want to check the old password

				if (!oldPassword || typeof oldPassword !== "string" || oldPassword.length > CONSTANTS.MAX_PASSWORD_LENGTH) {
					return res.status(400).send({
						webStatus: "INVALID_OLD_PASSWORD",
						error: "Invalid current password."
					});
				}

				bcrypt.compare(oldPassword, hashedPassword, function (err, result) {
					if (err) {
						console.error(err);
						return res.status(500).send({
							error: "Something went wrong."
						});
					} else {
						if (result === true) {
							allowPasswordReset = true;
							changePassword(userID, newPassword).then(() => {
								return res.send({
									success: true,
									note: "Password changed."
								});
							}, (err) => {
								console.error(err);
								return res.status(500).send({
									error: "Something went wrong."
								});
							});
							return;
						}
					}

					if (!allowPasswordReset) {
						return res.status(401).send({
							webStatus: "INCORRECT_PASSWORD",
							error: "Incorrect password."
						});
					}
				});

			}
		});

	}).catch(() => {
		return res.status(401).send({
			error: "Invalid token."
		});
	});

});

router.post("/deleteAccount", (req, res) => {

	// requires token AND password
	// deletes all user data

	// we will need to delete ALL records of them from the database (user, token, verification)
	// along with deleting their saves and extdata

	const token = req.body.token;
	const password = req.body.password;

	if (
		!token ||
		!password ||
		typeof token !== "string" ||
		typeof password !== "string" ||
		password.length > CONSTANTS.MAX_PASSWORD_LENGTH
	) {
		return res.status(400).send({
			error: "Invalid token or password."
		});
	}

	getUserID(token).then((userID) => {

		let queryString = "SELECT hash FROM user WHERE id = ?"; // WHERE id = ?
		let queryParams = [userID];

		query(queryString, queryParams).then((rows) => {
			if (rows.length > 0) {
				const hashedPassword = rows[0].hash;

				bcrypt.compare(password, hashedPassword, function (err, result) {
					if (result === true) {

						queryString = "DELETE FROM token WHERE userID = ?";
						queryParams = [userID];

						executeStatement(queryString, queryParams).then().catch((err) => {
							console.error(err);
							res.status(500).send({
								error: "Something went very wrong."
							});
						});

						queryString = "DELETE FROM verification WHERE userID = ?";

						executeStatement(queryString, queryParams).then().catch((err) => {
							console.error(err);
							res.status(500).send({
								error: "Something went very wrong."
							});
						});

						queryString = "DELETE FROM user WHERE id = ?";

						executeStatement(queryString, queryParams).then().catch((err) => {
							console.error(err);
							res.status(500).send({
								error: "Something went very wrong."
							});
						});

						// check dir exists
						const savesDir = path.resolve(ROOT_DIRECTORY, "saves", userID);
						const extdataDir = path.resolve(ROOT_DIRECTORY, "extdata", userID);

						if (fs.existsSync(savesDir)) fs.rmSync(savesDir, { recursive: true, force: true });
						if (fs.existsSync(extdataDir)) fs.rmSync(extdataDir, { recursive: true, force: true });

						res.send({
							success: true,
							note: "Goodbye."
						});

					} else {
						return res.status(401).send({
							error: "Incorrect password."
						});
					}
				});
			}
		});

	}).catch(() => {
		return res.status(401).send({
			error: "Invalid token."
		});
	});

});

router.post("/forgotPassword", (req, res) => {

	// we'll generate a shorthand token (7 characters long, not 5) and send it to the user's email
	// when it's used, it will delete the user's password hash
	// they will have to set a password again, otherwise they can't log in without their email

	const email = req.body.email;

	if (!email ||
		typeof email !== "string" ||
		email.length > CONSTANTS.MAX_EMAIL_LENGTH ||
		!validator.validate(email)
	) {
		return res.status(400).send({
			error: "Invalid email."
		});
	} else {
		getUserIDFromEmail(email).then((userID) => {

			// get userID from email

			checkIfEmailIsVerified(userID).then(() => {
				const queryString = "SELECT id FROM user WHERE email = ?"; // WHERE id = ?
				const queryParams = [email];

				query(queryString, queryParams).then((rows) => {
					if (rows.length > 0) {
						const userID = rows[0].id;
						// make sure shorthand token doesn't already exist

						let userHasAlreadyRequestedPasswordReset = false;

						Object.keys(shorthandTokens).forEach(shorthandToken => {
							if (shorthandTokens[shorthandToken][0] === userID) {
								// if 7 characters long, send error
								if (shorthandToken.length === 7) {
									res.status(400).send({
										error: "You have already requested a password reset. Please check your email or try again in 2 minutes."
									});
									userHasAlreadyRequestedPasswordReset = true;
									return;
								}
							}
						});

						if (userHasAlreadyRequestedPasswordReset) return;

						const shorthandToken = uuidv4().substring(0, 7);
						shorthandTokens[shorthandToken] = [userID, setTimeout(() => {
							delete shorthandTokens[shorthandToken];
						}, 120000)];

						sendPasswordResetEmail(email, shorthandToken);

						res.send({
							success: true,
							note: "Check your email for a link to reset your password."
						});
					}
				});
			}).catch((err) => {
				console.error(err);
				// could be an edge case where user has lost verification email and wants to reset password
				// might consider sending verification email here in the future
				return res.status(401).send({
					error: "Verify your email first."
				});
			});

		}).catch(() => {
			return res.status(400).send({
				error: "Invalid email."
			});
		});

	}

});

router.post("/verifyEmail", (req, res) => {

	let userID = req.body.userID;
	const code = req.body.code;

	if (
		!userID ||
		!code ||
		typeof userID !== "string" ||
		typeof code !== "string"
	) {
		return res.status(400).send({
			error: "Invalid userID or code."
		});
	} else {
		userID = userID.toLowerCase();

		const queryString = "SELECT userID FROM verification WHERE userID = ? AND id = ?"; // WHERE id = ?
		const queryParams = [userID, code];

		query(queryString, queryParams).then((rows) => {
			if (rows.length > 0) {

				let sql = "UPDATE user SET verified = 1 WHERE id = ?";
				let params = [userID];

				executeStatement(sql, params).then(() => {

					sql = "DELETE FROM verification WHERE userID = ?";
					params = [userID];

					executeStatement(sql, params).then(() => {

						// move any tokens from unverifiedToken to token
						sql = "SELECT token FROM unverifiedToken WHERE userID = ?";
						params = [userID];

						query(sql, params).then((rows) => {
							if (rows.length > 0) {

								sql = "INSERT INTO token (token, timestamp, userID) VALUES (?, ?, ?)";
								params = [rows[0].token, Date.now(), userID];

								executeStatement(sql, params).then(() => {

									sql = "DELETE FROM unverifiedToken WHERE userID = ?";
									params = [userID];

									executeStatement(sql, params).then(() => {

										res.send({
											token: rows[0].token
										});

									}).catch((err) => {
										console.error(err);
										res.status(500).send({
											error: "Something went wrong."
										});
									});

								}).catch((err) => {
									console.error(err);
									res.status(500).send({
										error: "Something went wrong."
									});
								});

							} else {

								handleToken(userID).then((token) => {
									res.send({ token });
								}).catch((err) => {

									console.error(err);
									return res.status(500).send({
										error: "Something went wrong."
									});

								});
							}
						}).catch((err) => {
							console.error(err);
							return res.status(500).send({
								error: "Something went wrong."
							});
						});

					}).catch((err) => {
						console.error(err);
						res.status(500).send({
							error: "Something went wrong."
						});
					});

				}).catch((err) => {
					console.error(err);
					res.status(500).send({
						error: "Something went wrong."
					});
				});

			} else {
				return res.status(400).send({
					error: "Invalid code."
				});
			}
		});
	}
});

router.post("/changeEmail", (req, res) => {

	const token = req.body.token;
	const password = req.body.password;
	let newEmail = req.body.email;

	if (
		!token ||
		!password ||
		!newEmail ||
		typeof newEmail !== "string" ||
		typeof password !== "string" ||
		newEmail.length > CONSTANTS.MAX_EMAIL_LENGTH ||
		password.length > CONSTANTS.MAX_PASSWORD_LENGTH ||
		!validator.validate(newEmail)
	) {
		return res.status(400).send({
			error: "Invalid token, password or email."
		});
	}

	newEmail = newEmail.toLowerCase();

	getUserID(token).then((userID) => {

		checkIfEmailIsVerified(userID).then(() => {

			userIsNotResettingEmail(userID).then(() => {
				console.log("User not in the middle of password reset.");

				let queryString = "UPDATE user SET verified = 0, email = ?"; // WHERE id = ?

				let queryParams = [newEmail];

				executeStatement(queryString, queryParams).then(() => {

					queryString = "INSERT INTO verification (userID, id, timestamp) VALUES (?, ?, ?)";

					queryParams = [userID, generateRandomNumberString(6), Date.now()];

					sendVerificationEmail(newEmail, queryParams[1]);

					executeStatement(queryString, queryParams).then(() => {

						getToken(userID).then((token) => {

							queryString = "INSERT INTO unverifiedToken (token, timestamp, userID) VALUES (?, ?, ?)";
							queryParams = [token, Date.now(), userID];

							executeStatement(queryString, queryParams).then(() => {

								// delete token
								queryString = "DELETE FROM token WHERE userID = ?";
								queryParams = [userID];

								executeStatement(queryString, queryParams).then(() => {

									// delete shorthand tokens
									Object.keys(shorthandTokens).forEach(shorthandToken => {
										if (shorthandTokens[shorthandToken][0] === userID) {
											// delete the existing shorthand token
											clearTimeout(shorthandTokens[shorthandToken][1]);
											delete shorthandTokens[shorthandToken];
										}
									});

									res.send({
										success: true,
										note: "Check your email for a verification code."
									});

								}).catch((err) => {
									console.error(err);
								});

							}).catch((err) => {
								console.error(err);
							});

						});

					}).catch((err) => {
						console.error(err);
						res.status(500).send({
							error: "Something went wrong."
						});
					});
				}).catch((err) => {
					console.error(err);
					res.status(500).send({
						error: "Something went wrong."
					});
				});

			}).catch((err) => {
				if (err === false) {
					return res.status(403).send({
						error: "You can't change your email while you're in the middle of a password reset. You need to set a password first."
					});
				} else {
					console.error(err);
					res.status(500).send({
						error: "Something went wrong."
					});
				}
			});

		}).catch((err) => {

			console.error(err);
			res.status(500).send({
				error: "Something went wrong."
			});

		});
	}).catch((err) => {
		console.error(err);
		res.status(403).send({
			error: "Can't change email while email is unverified."
		});
	});
});

module.exports = router;