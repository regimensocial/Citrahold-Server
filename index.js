"use strict";

const express = require("express");
const app = express();
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();
var validator = require("email-validator");
var cors = require("cors");
const { exec } = require("child_process");

var http = require("http");
var https = require("https");
var privateKey = fs.readFileSync("./selfsigned.key", "utf8");
var certificate = fs.readFileSync("./selfsigned.crt", "utf8");
var credentials = { key: privateKey, cert: certificate };

const nodemailer = require("nodemailer");

const SERVER_CONFIG = require("./config.json");
const EMAIL_TRANSPORTER_CONFIG = require("./emailTransporterConfig.json");

const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 72;
const MAX_TOKEN_LENGTH = 36;
const MAX_PATH_LENGTH = 512;

const { readdir } = require("fs/promises");
const cookieParser = require("cookie-parser");

const transporter = nodemailer.createTransport(
	EMAIL_TRANSPORTER_CONFIG
);

const shorthandTokens = {};

// async..await is not allowed in global scope, must use a wrapper
async function sendVerificationEmail(email, code) {
	// send mail with defined transport object
	await transporter.sendMail({
		from: `"Citrahold" <${EMAIL_TRANSPORTER_CONFIG.auth.user}>`, // sender address
		to: email, // list of receivers
		subject: "Your verification code is " + code, // Subject line
		text: "Your verification code is " + code, // plain text body
		html: "<b>Your verification code is " + code + "</b>", // html body
	});
}

async function sendPasswordResetEmail(email, code) {
	// send mail with defined transport object
	await transporter.sendMail({
		from: `"Citrahold" <${EMAIL_TRANSPORTER_CONFIG.auth.user}>`, // sender address
		to: email, // list of receivers
		subject: "Reset your Citrahold password", // Subject line
		text: SERVER_CONFIG.frontEnd + SERVER_CONFIG.passwordResetPage + code, // plain text body
		html: `<a href="${SERVER_CONFIG.frontEnd + SERVER_CONFIG.passwordResetPage + code}">${SERVER_CONFIG.frontEnd + SERVER_CONFIG.passwordResetPage + code}</a>`, // html body
	});

}

const dirSize = (directory) => {
	return new Promise((resolve, reject) => {

		if (!fs.existsSync(directory)) {
			resolve(0);
			return;
		} else {
			const command = `du -sk "${directory}" | cut -f1`;

			exec(command, (error, stdout, stderr) => {
				if (error) {
					console.error(`Error executing command: ${error.message}`);
					reject(error.message);
					return;
				}

				if (stderr) {
					console.error(`Command had errors: ${stderr}`);
					reject(stderr);
					return;
				}

				resolve(parseInt(stdout));
			});
		}

	});
};

function generateRandomNumberString(length) {
	let result = "";
	const characters = "0123456789";

	for (let i = 0; i < length; i++) {
		const randomIndex = Math.floor(Math.random() * characters.length);
		result += characters[randomIndex];
	}

	return result;
}

async function getFiles(dir) {
	const dirents = await readdir(dir, { withFileTypes: true });
	const files = await Promise.all(
		dirents
			.filter((dirent) => !dirent.name.startsWith("."))
			.map(async (dirent) => {
				const res = path.resolve(dir, dirent.name);
				return dirent.isDirectory() ? getFiles(res) : res;
			})
	);
	return Array.prototype.concat(...files);
}

async function executeStatement(sql, params = []) {

	return new Promise((resolve, reject) => {
		const db = new sqlite3.Database("./main.db");

		try {

			db.run(sql, params, function (err) {
				if (err) {
					reject(err);
				} else {
					resolve("Success");
				}
			});

		} catch (err) {
			console.error(err);
			reject(err);

		} finally {
			db.close();
		}

	});

}

function query(sql, params = []) {

	return new Promise((resolve, reject) => {

		const db = new sqlite3.Database("./main.db");

		db.all(sql, params, (err, rows) => {
			db.close();

			if (err) {
				reject(err);
			} else {
				resolve(rows);
			}

		});

	});

}

function checkIfEmailIsVerified(userID) {

	return new Promise((resolve, reject) => {

		if (!SERVER_CONFIG.verifyEmail) {
			resolve(true);
			return;
		}

		const sql = "SELECT verified FROM user WHERE id = ?";
		const params = [userID];

		query(sql, params).then((rows) => {
			if (rows.length > 0) {
				(rows[0].verified === 1) ? resolve(true) : reject("Email not verified.");
			} else {
				reject("Invalid userID.");
			}
		}).catch((err) => {
			console.error(err);
			reject(err);
		});
	});

}

/**
 * Generates a new token for the given user ID  (and deletes any existing tokens).
 * @param {number} userID - The ID of the user for whom to generate a new token.
 * @returns {Promise<string>} - A Promise that resolves with the newly generated token.
 */
function handleToken(userID) {

	return new Promise((resolve, reject) => {

		checkIfEmailIsVerified(userID).then(() => {

			let sql = "DELETE FROM token WHERE userID = ?";
			let params = [userID];

			executeStatement(sql, params).then(() => {

				const token = uuidv4();

				sql = "INSERT INTO token (token, timestamp, userID) VALUES (?, ?, ?)";
				params = [token, Date.now(), userID];

				executeStatement(sql, params).then(() => {
					resolve(token);
				}).catch((err) => {
					console.error(err);
					reject(err);
				});

			}).catch((err) => {
				console.error(err);
				reject(err);
			});
		}).catch((err) => {
			console.error(err);
			reject(err);
		});

	});
}

function getToken(userID) {

	return new Promise((resolve, reject) => {

		// check user exists
		const sql = "SELECT id FROM user WHERE id = ?";
		const params = [userID];
		query(sql, params).then((rows) => {
			if (rows.length > 0) {
				const sql = "SELECT token FROM token WHERE userID = ?";
				const params = [userID];

				query(sql, params).then((rows) => {
					if (rows.length > 0) {
						resolve(rows[0].token);
					} else {
						// generate new token
						handleToken(userID).then((token) => {
							resolve(token);
						}).catch((err) => {
							console.error(err);
							reject(err);
						});
					}
				}).catch((err) => {
					console.error(err);
					reject(err);
				});
			} else {
				reject("Invalid userID.");
			}
		}).catch((err) => {
			console.error(err);
			reject(err);
		});
	});
}

function getUserID(token) {

	return new Promise((resolve, reject) => {
		const sql = "SELECT userID FROM token WHERE token = ?";
		const params = [token];

		query(sql, params).then((rows) => {
			if (rows.length > 0) {
				resolve(rows[0].userID);
			} else {
				reject("Invalid token.");
			}
		}).catch((err) => {
			console.error(err);
			reject(err);
		});
	});

}

async function getUserDataUsage(userID) {

	if (!userID) {
		return (0);
	}

	const savesDir = path.resolve(__dirname, "saves", userID);
	const extdataDir = path.resolve(__dirname, "extdata", userID);

	const savesSize = await dirSize(savesDir);
	const extdataSize = await dirSize(extdataDir);

	return (savesSize + extdataSize);

}

function ensureDirectoryExistence(filePath) {
	var dirname = path.dirname(filePath);
	if (fs.existsSync(dirname)) {
		return true;
	}
	ensureDirectoryExistence(dirname);
	fs.mkdirSync(dirname);
}

function changePassword(userID, newPassword) {

	return new Promise((resolve, reject) => {
		bcrypt.hash(newPassword,
			SERVER_CONFIG.bcryptSaltRounds).then((hashedPassword) => {
			const sql = "UPDATE user SET hash = ? WHERE id = ?";
			const params = [hashedPassword, userID];

			executeStatement(sql, params).then(() => {
				resolve(true);
			}).catch((err) => {
				console.error(err);
				reject(err);
			});
		});
	});
}

app.use(cors(
	{
		origin: SERVER_CONFIG.allowedOrigins,
		methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
		credentials: true,
	}
));

app.use(express.json(
	{
		limit: (((SERVER_CONFIG.maxUserDirSize || 128000) / 1024) + "kb")
	}
));

app.use(express.urlencoded({ extended: true, limit: (((SERVER_CONFIG.maxUserDirSize || 128000) / 1024) + "kb") }));

app.use(cookieParser(
));

// check that if we are receiving data from the user, it is valid JSON
app.use((err, _req, res, next) => {

	if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
		return res.status(400).send({
			error: "Invalid JSON format.",
		});
	}

	next();
});

app.use((req, res, next) => {
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
});

app.all("/areyouawake", async (req, res) => {

	const now = new Date();
	const offsetInMinutes = now.getTimezoneOffset();
	let userDirectorySize = 0;

	if (
		req.body.token &&
		typeof req.body.token === "string"
	) {
		const userID = await getUserID(req.body.token);
		userDirectorySize = await getUserDataUsage(userID);
	}

	var response = {
		"yes": "I am awake",
		"timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
		"UTCOffsetInMinutes": offsetInMinutes,
		maxUserDirSize: SERVER_CONFIG.maxUserDirSize,
	};

	if (req.body.token && req.body.userID && typeof req.body.userID === "string") {
		var userInfo = {};
		userInfo["id"] = req.body.userID;
		userInfo["directorySize"] = userDirectorySize;

		// get email
		const sql = "SELECT email FROM user WHERE id = ?";
		const params = [req.body.userID];

		const rows = await query(sql, params);
		if (rows.length > 0) {
			userInfo["email"] = rows[0].email;
		}

		response["user"] = userInfo;
	}

	if (req.body.echo && typeof req.body.echo === "string" && req.body.echo.length < 100) {
		response["echo"] = req.body.echo;
	}

	res.json(response);
});

app.post("/changePassword", (req, res) => {

	const token = req.body.token;
	const oldPassword = req.body.password;
	const newPassword = req.body.newPassword;

	if (
		!token ||
		!newPassword ||
		typeof token !== "string" ||
		typeof newPassword !== "string" ||
		token.length > MAX_TOKEN_LENGTH
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

				if (!oldPassword || typeof oldPassword !== "string" || oldPassword.length > MAX_PASSWORD_LENGTH) {
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

app.post("/deleteAccount", (req, res) => {

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
		token.length > MAX_TOKEN_LENGTH ||
		password.length > MAX_PASSWORD_LENGTH
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
						const savesDir = path.resolve(__dirname, "saves", userID);
						const extdataDir = path.resolve(__dirname, "extdata", userID);

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

app.post("/forgotPassword", (req, res) => {

	// we'll generate a shorthand token (7 characters long, not 5) and send it to the user's email
	// when it's used, it will delete the user's password hash
	// they will have to set a password again, otherwise they can't log in without their email

	const email = req.body.email;

	if (!email ||
		typeof email !== "string" ||
		email.length > MAX_EMAIL_LENGTH ||
		!validator.validate(email)
	) {
		return res.status(400).send({
			error: "Invalid email."
		});
	} else {

		// get userID from email

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
	}
});

app.post("/verifyEmail", (req, res) => {

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
				let params = [rows[0].userID];

				executeStatement(sql, params).then(() => {

					sql = "DELETE FROM verification WHERE userID = ?";
					params = [rows[0].userID];

					executeStatement(sql, params).then(() => {

						// move any tokens from unverifiedToken to token
						sql = "SELECT token FROM unverifiedToken WHERE userID = ?";
						params = [rows[0].userID];

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
								handleToken(rows[0].userID).then((token) => {
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

app.post(["/uploadSaves", "/uploadExtdata"], (req, res) => {

	const isGetSaves = req.originalUrl.startsWith("/uploadSaves");
	const folder = isGetSaves ? "saves" : "extdata";

	if (!req.body.filename || typeof req.body.filename !== "string" || req.body.filename.startsWith(".") || req.body.filename.length > MAX_PATH_LENGTH) {
		res.status(400).send({
			error: "Invalid request. You didn't send a valid filename."
		});
		return;
	}

	if (!req.body.token || typeof req.body.token !== "string" || req.body.token.length > MAX_TOKEN_LENGTH) {
		res.status(400).send({
			error: "Invalid token."
		});
		return;
	}

	if (!req.body.data || typeof req.body.data !== "string") {
		res.status(400).send({
			error: "Invalid data."
		});
		return;
	}

	if (req.body.data) {
		// check if valid base64

		getUserID(req.body.token).then(async (userID) => {

			if (!path.resolve(
				__dirname,
				folder,
				userID,
				req.body.filename
			).startsWith(path.resolve(__dirname, folder, userID))) {
				res.status(400).send({
					error: "Stop."
				});
				return;
			}

			try {

				var buf = Buffer.from(req.body.data, "base64");

				const userDirectorySize = await getUserDataUsage(userID);

				if (userDirectorySize + (buf.length / 1024) > (SERVER_CONFIG.maxUserDirSize)) {

					return res.status(507).send({
						error: "You have exceeded your storage limit."
					});
				}

				req.body.filename = req.body.filename.trim();

				ensureDirectoryExistence(path.resolve(
					__dirname,
					folder,
					userID,
					req.body.filename
				));
				fs.writeFile(path.resolve(
					__dirname,
					folder,
					userID,
					req.body.filename
				), buf, "binary", function (err) {
					if (err) {
						console.error(err);
						res.status(500).send({
							error: "Something went wrong."
						});

					} else {
						res.status(201).send({
							success: true,
							message: "The file was saved! Thank you"
						});

						// get top level dir of req.body.filename
						var game = req.body.filename.split("/")[0];
						var gameDir = path.resolve(__dirname, folder, userID, game);
						var currentDate = new Date();
						fs.utimes(gameDir, fs.statSync(gameDir).mtime, currentDate, (err) => {
							if (err) {
								console.error(err);
							}
						});
					}
				});

			} catch (e) {
				res.status(500).send({
					error: "Something went wrong."
				});
				return;
			}

		}).catch(() => {
			res.status(401).send({
				error: "Invalid token."
			});
			return;
		});
	}
});

app.all("/getUserID", (req, res) => {

	if (!req.body.token || typeof req.body.token !== "string" || req.body.token.length > MAX_TOKEN_LENGTH) {
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

app.post("/setTokenCookie", (req, res) => {

	if (!req.body.token || typeof req.body.token !== "string" || req.body.token.length > MAX_TOKEN_LENGTH) {
		return res.status(400).send({
			error: "Invalid token."
		});
	}

	getUserID(req.body.token).then(() => {
		res.cookie("token", req.body.token, {
			maxAge: 1000 * 60 * 60 * 24 * 365,
			httpOnly: true,
			sameSite: "none",
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

app.all("/deleteTokenCookie", (req, res) => {
	res.cookie("token", "", { // you can't use clearCookie because it doesn't work with SameSite: None
		name: "token",
		sameSite: "none",
		secure: true,
		maxAge: 0
	});
	res.send({
		success: true
	});
});

app.post("/getToken", (req, res) => {
	// this will be like a login
	if (
		req.body.shorthandToken &&
		typeof req.body.shorthandToken === "string" &&
		shorthandTokens[req.body.shorthandToken]
	) {

		getToken(shorthandTokens[req.body.shorthandToken][0]).then((token) => {
			res.send({ token });

			// if shorthand token is 7 characters long, delete the user's password hash

			if (req.body.shorthandToken.length === 7) {
				const userID = shorthandTokens[req.body.shorthandToken][0];

				const sql = "UPDATE user SET hash = NULL WHERE id = ?";
				const params = [userID];

				executeStatement(sql, params).then().catch((err) => {
					console.error(err);
				});
			}

			delete shorthandTokens[req.body.shorthandToken];
		}).catch(() => {});

	} else {
		let email = req.body.email;
		const password = req.body.password;

		if (
			!email || !password ||
			typeof email !== "string" ||
			typeof password !== "string" ||
			email.length > MAX_EMAIL_LENGTH ||
			password.length > MAX_PASSWORD_LENGTH ||
			!validator.validate(email)
		) {
			return res.status(400).send({
				error: "Invalid email or password."
			});
		} else {
			email = email.toLowerCase();

			let queryString = "SELECT id, hash FROM user WHERE email = ?"; // WHERE id = ?
			let queryParams = [email];

			query(queryString, queryParams).then((rows) => {
				if (rows.length > 0) {
					const hashedPassword = rows[0].hash;
					const userID = rows[0].id;

					if (hashedPassword === null) {

						let userHasAlreadyRequestedPasswordReset = false;
						Object.keys(shorthandTokens).forEach(shorthandToken => {
							if (shorthandTokens[shorthandToken][0] === userID) {
								// if 7 characters long, send error
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
										}).catch(() => {});
									} else {

										// This generates a new token for the user.
										// They should be careful doing this because it will remove any existing tokens.
										// So they'll be logged out on all devices.

										handleToken(userID).then((token) => {
											res.send({ token });
										});
									}
								}).catch(() => {

									// get timestamp from verification table
									queryString = "SELECT timestamp, id FROM verification WHERE userID = ?";
									queryParams = [userID];

									query(queryString, queryParams).then((rows) => {
										if (rows.length > 0) {

											// if it's been more than 2 minutes, resend the verification email

											// could consider sending a new code instead of the same one
											// but it's not that important
											if ((Date.now() - rows[0].timestamp) > 120000) {
												sendVerificationEmail(email, rows[0].id);

												// update timestamp
												const sql = "UPDATE verification SET timestamp = ? WHERE userID = ?";
												const params = [Date.now(), userID];

												executeStatement(sql, params).then().catch((err) => {
													console.error(err);
												});
											}

											res.status(403).send({
												webStatus: "VERIFY_EMAIL",
												userID: userID,
												note: "This account must be verified before it can be used."
											});

										} else { // logically, this should never happen
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

app.post("/checkShorthandTokenExists", (req, res) => {
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

app.post("/changeEmail", (req, res) => {

	const token = req.body.token;
	const password = req.body.password;
	let newEmail = req.body.email;

	if (
		!token ||
		!password ||
		!newEmail ||
		typeof newEmail !== "string" ||
		typeof password !== "string" ||
		newEmail.length > MAX_EMAIL_LENGTH ||
		password.length > MAX_PASSWORD_LENGTH ||
		!validator.validate(newEmail)
	) {
		return res.status(400).send({
			error: "Invalid token, password or email."
		});
	}

	newEmail = newEmail.toLowerCase();

	getUserID(token).then((userID) => {

		checkIfEmailIsVerified(userID).then(() => {

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

		}).catch(() => {
			return res.status(401).send({
				error: "Invalid token."
			});
		});
	}).catch((err) => {
		console.error(err);
		res.status(403).send({
			error: "Can't change email while email is unverified."
		});
	});
});

app.post("/register", (req, res) => {
	// for now, just insert into database

	let email = req.body.email;
	const password = req.body.password;

	if (
		!req.body.email ||
		!password ||
		typeof email !== "string" ||
		typeof password !== "string" ||
		!validator.validate(email) ||
		email.length > MAX_EMAIL_LENGTH ||
		password.length > MAX_PASSWORD_LENGTH
	) {
		return res.status(400).send({
			error: "Invalid email or password."
		});
	} else {

		email = email.toLowerCase();

		const queryString = "SELECT id FROM user WHERE email = ?"; // WHERE id = ?
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
					let params = [email, hashedPassword, Date.now(), userID, (SERVER_CONFIG.verifyEmail ? 0 : 1)];

					executeStatement(sql, params).then(() => {

						if (SERVER_CONFIG.verifyEmail) {

							sql = "INSERT INTO verification (userID, id, timestamp) VALUES (?, ?, ?)";
							params = [userID, generateRandomNumberString(6), Date.now()];

							sendVerificationEmail(email, params[1]);

							executeStatement(sql, params).then(() => {

								res.send({
									userID: userID,
									note: "This account must be verified before it can be used."
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
							});
						}
					}).catch((err) => {
						console.error(err);
						res.status(500).send({
							error: "Something went wrong."
						});
					});
				});
			}
		});
	}
});

app.post("/shorthandToken", (req, res) => {

	const token = req.body.token;

	if (!token || typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) {
		return res.status(400).send({
			error: "Invalid token."
		});
	}

	getUserID(token).then((userID) => {

		// check for existing shorthand token
		Object.keys(shorthandTokens).forEach(shorthandToken => {
			if (shorthandTokens[shorthandToken][0] === userID) {
				// delete the existing shorthand token
				clearTimeout(shorthandTokens[shorthandToken][1]);
				delete shorthandTokens[shorthandToken];
			}
		});

		if (!req.body.empty) {
			// generate a 5 character shorthand token
			const shorthandToken = uuidv4().substring(0, 5);
			res.send({ shorthandToken });

			var timeout = setTimeout(() => { // in 2 minutes, delete the shorthand token
				delete shorthandTokens[shorthandToken];
			}, 120000);

			shorthandTokens[shorthandToken] = [userID, timeout];
		} else {
			res.send("cleared");
		}

	}).catch(() => {
		res.status(401).send({
			error: "Invalid token."
		});
	});

});

app.post(["/getSaves/:game?", "/getExtdata/:game?"], (req, res) => {

	const isGetSaves = req.originalUrl.startsWith("/getSaves");
	const folder = isGetSaves ? "saves" : "extdata";

	const token = req.body.token;

	if (!token || typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) {
		res.status(400).send({
			error: "Invalid token."
		});
		return;
	}

	// 3DS has trouble sending fancy unicode characters as URI
	// so we'll also accept the game name as a body parameter
	var game = req.body.game || req.params.game;

	if (!game || typeof game !== "string") {
		res.status(400).send({
			error: "Invalid game."
		});
		return;
	}

	getUserID(token).then((userID) => {
		const location = path.resolve(__dirname, folder, userID);

		// iterate just through the folders in this directory
		if (!game) {
			fs.readdir(location, async (err, files) => {
				if (err) {
					res.status(404).send({
						games: []
					});
				} else {
					var allFiles = [];

					await Promise.all(files.map(async (file) => {
						if (!file.startsWith(".")) {
							let gameSize;

							if (req.body.forWeb) {
								gameSize = await dirSize(path.resolve(location, file));
								allFiles.push([
									file,
									fs.statSync(path.resolve(location, file)).mtime.toISOString(),
									gameSize,
								]);
							} else {
								allFiles.push(file);
							}

						}
					}));

					res.json({
						games: allFiles,
					});
				}
			});
		} else {
			const gameLocation = path.resolve(__dirname, folder, userID, game);

			if (!gameLocation.startsWith(path.resolve(__dirname, folder, userID))) {
				res.status(400).send({
					error: "Stop."
				});
				return;
			}

			// check if location is a directory or invalid
			fs.lstat(gameLocation, (err, stats) => {
				if (err) {
					res.status(404).send({
						error: "Game not found."
					});
				} else {
					if (stats.isDirectory()) {
						fs.readdir(gameLocation, (err, files) => {
							if (err) {
								res.status(404).send({
									error: "File not found."
								});
							} else {
								var allFiles = [];
								files.forEach(file => {
									if (!file.startsWith(".")) allFiles.push(file);
								});
								res.json({
									saves: allFiles
								});
							}
						});

					} else {
						res.status(404).send({
							error: "Game not found."
						});
					}
				}
			});
		}

	}).catch(() => {
		res.status(401).send({
			error: "Invalid token."
		});
	});

});

app.post(["/deleteSaves/:game?", "/deleteExtdata/:game?"], (req, res) => {
	const isDeleteSaves = req.originalUrl.startsWith("/deleteSaves");
	const folder = isDeleteSaves ? "saves" : "extdata";
	const token = req.body.token;

	if (!token || typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) {
		res.status(400).send({
			error: "Invalid token."
		});
		return;
	}

	getUserID(token).then((userID) => {
		var game = req.body.game || req.params.game;

		if (!game || typeof game !== "string") {
			res.status(400).send({
				error: "I need a game."
			});
			return;
		}

		const gameLocation = path.resolve(__dirname, folder, userID, game);
		if (!gameLocation.startsWith(path.resolve(__dirname, folder, userID))) {
			res.status(400).send({
				error: "Stop."
			});
			return;
		}

		if (!fs.existsSync(gameLocation)) {
			res.status(404).send({
				error: "Game not found."
			});
			return;
		} else {

			fs.rm(gameLocation, {
				recursive: true,
				force: true
			}, (err) => {
				if (err) {
					console.error(err);
					res.status(500).send({
						error: "Something went wrong."
					});
					return;
				} else {
					res.send({
						success: true
					});
					return;
				}
			});

		}
	}).catch((err) => {
		console.error(err);
		res.status(401).send({
			error: "Invalid token."
		});
	});
});

app.post(["/renameSaves", "/renameExtdata"], (req, res) => {
	const isRenameSaves = req.originalUrl.startsWith("/renameSaves");
	const folder = isRenameSaves ? "saves" : "extdata";
	const token = req.body.token;

	if (!token || typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) {
		res.status(400).send({
			error: "Invalid token."
		});
		return;
	}

	var game = req.body.game || req.params.game;
	var newGame = (req.body.newGame || req.params.newGame);

	if (!game || !newGame || typeof game !== "string" || typeof newGame !== "string") {
		res.status(400).send({
			error: "I need a game and a new game name."
		});
		return;
	}

	getUserID(token).then((userID) => {

		game = game.trim();
		newGame = newGame.trim();

		const gameLocation = path.resolve(__dirname, folder, userID, game);
		if (!gameLocation.startsWith(path.resolve(__dirname, folder, userID))) {
			res.status(400).send({
				error: "Stop."
			});
			return;
		}

		if (!fs.existsSync(gameLocation)) {
			res.status(404).send({
				error: "Game not found."
			});
			return;
		} else {

			if (fs.existsSync(path.resolve(__dirname, folder, userID, newGame))) {

				res.status(409).send({
					error: "I can't rename a game to a game that already exists."
				});
				return;
			}

			fs.rename(gameLocation, path.resolve(__dirname, folder, userID, newGame), (err) => {
				if (err) {
					console.error(err);
					res.status(500).send({
						error: "Something went wrong."
					});
					return;
				} else {
					res.send({
						success: true
					});
					return;
				}
			});

		}
	}).catch((err) => {
		console.error(err);
		res.status(401).send({
			error: "Invalid token."
		});
	});

});

app.use(["/downloadSaves*", "/downloadExtdata*"], (req, res) => {
	const token = req.body.token;
	const isGetSaves = req.originalUrl.startsWith("/downloadSaves");
	const folder = isGetSaves ? "saves" : "extdata";

	if (!token || typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) {
		res.status(400).send({
			error: "Invalid token."
		});
		return;
	}

	getUserID(token).then((userID) => {
		let location = req.originalUrl.split(isGetSaves ? "/downloadSaves/" : "/downloadExtdata/")[1];

		if (req.body.game || req.body.save || req.body.file) {

			if (req.body.game && typeof req.body.game !== "string" || req.body.save && typeof req.body.save !== "string" || req.body.file && typeof req.body.file !== "string") {
				res.status(400).send({
					error: "Invalid game, save or file."
				});
				return;
			}

			location = path.join(__dirname, folder, userID, (req.body.game || ""), (req.body.file || ""));
		} else {
			location = decodeURIComponent(location);
			location = location.split("/");
			location = path.resolve(__dirname, folder, userID, ...location);
		}

		if (!location.startsWith(path.resolve(__dirname, folder, userID))) {
			res.status(400).send({
				error: "Stop."
			});
			return;
		}

		// check if location is a directory or a file

		fs.lstat(location, (err, stats) => {
			if (err) {
				res.status(404).send({
					error: "File not found."
				});
			} else {
				if (stats.isDirectory()) {
					var allFiles = [];
					getFiles(location)
						.then(files => {
							files.forEach(file => {
								file = file.split(location + "/")[1];
								allFiles.push(file);
							});

							res.json({
								files: allFiles
							});

						})
						.catch(e => console.error(e));
					// }

				} else {
					res.download(location);
				}
			}
		});

	}).catch(() => {
		res.status(401).send({
			error: "Invalid token."
		});
	});
});

if (SERVER_CONFIG.insecurePort > 0) {
	var httpServer = http.createServer(app);
	httpServer.listen(SERVER_CONFIG.insecurePort);
}

if (SERVER_CONFIG.securePort > 0) {
	const httpsServer = https.createServer(credentials, app);
	httpsServer.listen(SERVER_CONFIG.securePort);
}