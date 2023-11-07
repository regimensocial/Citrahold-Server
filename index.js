const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
var validator = require("email-validator");

const { resolve } = require('path');
const { readdir } = require('fs').promises;

async function getFiles(dir) {
	const dirents = await readdir(dir, { withFileTypes: true });
	const files = await Promise.all(
		dirents
			.filter((dirent) => !dirent.name.startsWith('.'))
			.map(async (dirent) => {
				const res = path.resolve(dir, dirent.name);
				return dirent.isDirectory() ? getFiles(res) : res;
			})
	);
	return Array.prototype.concat(...files);
}


async function executeStatement(sql, params = []) {

	return new Promise(async (resolve, reject) => {
		const db = new sqlite3.Database('./main.db');

		try {

			db.run(sql, params, function (err) {
				if (err) {
					reject(err);
				} else {
					resolve("Success");
				}
			});

		} catch (err) {
			console.log(err);
			reject(err);

		} finally {
			db.close();
		}

	});

}


function query(sql, params = []) {

	return new Promise((resolve, reject) => {

		const db = new sqlite3.Database('./main.db');

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


/**
 * Generates a new token for the given user ID  (and deletes any existing tokens).
 * @param {number} userID - The ID of the user for whom to generate a new token.
 * @returns {Promise<string>} - A Promise that resolves with the newly generated token.
 */
function handleToken(userID) {

	return new Promise((resolve, reject) => {
		let sql = `DELETE FROM token WHERE userID = ?`;
		let params = [userID];

		executeStatement(sql, params).then(() => {
			console.log("Tokens cleared.");

			const token = uuidv4();

			sql = `INSERT INTO token (token, timestamp, userID) VALUES (?, ?, ?)`;
			params = [token, Date.now(), userID];

			executeStatement(sql, params).then(() => {
				console.log("Token generated.");
				resolve(token);
			}).catch((err) => {
				console.log(err);
				reject(err);
			});

		}).catch((err) => {
			console.log(err);
			reject(err);
		});
	});
}

function getToken(userID) {

	return new Promise((resolve, reject) => {
		const sql = `SELECT token FROM token WHERE userID = ?`;
		const params = [userID];

		query(sql, params).then((rows) => {
			if (rows.length > 0) {
				resolve(rows[0].token);
			} else {
				reject("Invalid userID.");
			}
		}).catch((err) => {
			console.log(err);
			reject(err);
		});
	});
}

function getUserID(token) {

	return new Promise((resolve, reject) => {
		const sql = `SELECT userID FROM token WHERE token = ?`;
		const params = [token];

		query(sql, params).then((rows) => {
			if (rows.length > 0) {
				resolve(rows[0].userID);
			} else {
				reject("Invalid token.");
			}
		}).catch((err) => {
			console.log(err);
			reject(err);
		});
	});

}


/**
 * The number of salt rounds used for bcrypt hashing.
 * @type {number}
 */
const BCRYPT_SALT_ROUNDS = 10;


app.use(express.json(
	{
		limit: '1024mb'
	}
));       // to support JSON-encoded bodies

app.use(express.urlencoded({ extended: true, limit: '1024mb' }))

// express static at URL /static
app.use('/static', express.static(path.resolve(__dirname, 'static')));

// check that if we are receiving data from the user, it is valid JSON
app.use((err, _req, res, next) => {
	if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {

		return res.status(400).send({
			error: "Invalid JSON format.",
		});
	}

	next();
});

function ensureDirectoryExistence(filePath) {
	var dirname = path.dirname(filePath);
	if (fs.existsSync(dirname)) {
		return true;
	}
	ensureDirectoryExistence(dirname);
	fs.mkdirSync(dirname);
}

// const sql = 'SELECT * FROM user'; // WHERE id = ?
// const params = [id];

// const rows = query(sql).then((rows) => {
// console.log(rows[0].email);
// }); // , params

app.all("/areyouawake", (req, res) => {
	console.log("Request from " + req.ip);
	res.send({
		yes: "i am awake"
	});
});

app.post(['/uploadSaves', '/uploadExtdata'], (req, res) => {

	const isGetSaves = req.originalUrl.startsWith("/uploadSaves");
	const folder = isGetSaves ? "saves" : "extdata";

	console.log("Request from " + req.ip);
	console.log(folder);

	if (req.body.data) {
		// check if valid base64

		console.log({
			filename: req.body.filename,
			token: req.body.token
		})

		getUserID(req.body.token).then((userID) => {

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

				var buf = Buffer.from(req.body.data, 'base64');
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
						console.log(err);
					} else {
						console.log("The file was saved!");
						res.status(201).send({
							success: true,
							message: "The file was saved! Thank you"
						});
					}
				});

			} catch (e) {
				res.status(500).send({
					error: "Something went wrong."
				});
				return;
			}

		}).catch((err) => {
			res.status(401).send({
				error: "Invalid token."
			});
			return;
		});
	} else {
		console.log("No data sent.");
		res.status(400).send({
			error: "Invalid request. You didn't send any data."
		});
	}

});

app.post("/getUserID", (req, res) => {
	getUserID(req.body.token).then((userID) => {
		res.json({
			userID: userID
		});
	}).catch((err) => {
		res.status(401).json({
			userID: "unknown"
		});
	});
});

app.all("/test", (req, res) => {
	// res.set('Transfer-Encoding', 'chunked');

	// res.json({
	// 	"lorum": "ipsum",
	// 	"foo": "bar",
	// 	"baz": 123.456,
	// 	"qux": true,
	// 	"quux": false,
	// 	"corge": null
	// });
	console.log("connected");
	res.status(404).send({
		error: "Not found."
	});
});

app.post("/getToken", (req, res) => {
	// this will be like a login
	if (req.body.shorthandToken && shorthandTokens[req.body.shorthandToken]) {
		getToken(shorthandTokens[req.body.shorthandToken][0]).then((token) => {
			res.send({ token });
			delete shorthandTokens[req.body.shorthandToken];
		});


	} else {
		const email = (req.body.email || "").toLowerCase();
		const password = req.body.password;

		if (!email || !password || !validator.validate(email)) {
			return res.status(400).send({
				error: "Invalid email or password."
			});
		} else {
			const queryString = 'SELECT id, hash FROM user WHERE email = ?'; // WHERE id = ?
			const queryParams = [email];

			const rows = query(queryString, queryParams).then((rows) => {
				if (rows.length > 0) {
					const hashedPassword = rows[0].hash;

					bcrypt.compare(password, hashedPassword, function (err, result) {
						if (result === true) {

							if (!req.body.new) {
								getToken(rows[0].id).then((token) => {
									res.send({ token });
								});
							} else {

								// This generates a new token for the user.
								// They should be careful doing this because it will remove any existing tokens.
								// So they'll be logged out on all devices.

								handleToken(rows[0].id).then((token) => {
									res.send({ token });
								});
							}

						} else {
							return res.status(400).send({
								error: "Invalid email or password."
							});
						}
					});

				} else {
					return res.status(400).send({
						error: "Invalid email or password."
					});
				}
			});
		}
	}
});

app.post("/register", (req, res) => {
	// for now, just insert into database

	const email = (req.body.email || "").toLowerCase();
	const password = req.body.password;

	if (!email || !password || !validator.validate(email)) {
		return res.status(400).send({
			error: "Invalid email or password."
		});
	} else {
		const queryString = 'SELECT id FROM user WHERE email = ?'; // WHERE id = ?
		const queryParams = [email];

		const rows = query(queryString, queryParams).then((rows) => {
			if (rows.length > 0) {
				return res.status(409).send({
					error: "Email already in use."
				});


			} else {
				const hashedPassword = bcrypt.hash(password, BCRYPT_SALT_ROUNDS).then((hashedPassword) => {
					const sql = `INSERT INTO user (email, hash, timestamp, id) VALUES (?, ?, ?, ?)`;

					const userID = uuidv4();
					const params = [email, hashedPassword, Date.now(), userID];

					executeStatement(sql, params).then(() => {

						handleToken(userID).then((token) => {
							res.send({ token });
						});
					}).catch((err) => {
						res.status(500).send({
							error: "Something went wrong."
						});
					});
				});

			}
		});

	}

});

let shorthandTokens = {};

app.post("/shorthandToken", (req, res) => {

	console.log(Object.keys(shorthandTokens).length);
	const token = req.body.token;

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

	}).catch((err) => {
		res.status(401).send({
			error: "Invalid token."
		});
	});

});

app.post(["/getSaves/:game?", "/getExtdata/:game?"], (req, res) => {

	// this is not the best way, but we can overhall it later
	const isGetSaves = req.originalUrl.startsWith("/getSaves");
	const folder = isGetSaves ? "saves" : "extdata";

	const token = req.body.token;
	console.log(req.originalUrl)

	// 3DS has trouble sending fancy unicode characters as URI
	// so we'll also accept the game name as a body parameter
	var game = req.body.game || req.params.game;

	getUserID(token).then((userID) => {
		let location = path.resolve(__dirname, folder, userID);



		// iterate just through the folders in this directory
		if (!game) {
			fs.readdir(location, (err, files) => {
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
						games: allFiles
					});
				}
			});
		} else {
			let gameLocation = path.resolve(__dirname, folder, userID, game);

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

	}).catch((err) => {
		res.status(401).send({
			error: "Invalid token."
		});
	});

});

app.use(["/downloadSaves*", "/downloadExtdata*"], (req, res) => {
	const token = req.body.token;
	const isGetSaves = req.originalUrl.startsWith("/downloadSaves");
	const folder = isGetSaves ? "saves" : "extdata";

	console.log(req.body)

	getUserID(token).then((userID) => {
		let location = req.originalUrl.split(isGetSaves ? "/downloadSaves/" : "/downloadExtdata/")[1];

		if (req.body.game || req.body.save || req.body.file) {
			location = path.join(__dirname, folder, userID, (req.body.game || ""), (req.body.save || ""), (req.body.file || ""));
			console.log(location)
		} else {
			location = decodeURIComponent(location);
			location = location.split("/");
			location = path.resolve(__dirname, folder, userID, ...location)
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
					// iterate through all FILES and send array of filenames
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

				} else {
					res.download(location);
				}
			}
		});



	}).catch((err) => {
		console.log(err);
		res.status(401).send({
			error: "Invalid token."
		});
	});
})

app.listen(3000, () => {
	console.log('Example app listening on port 3000!');
});