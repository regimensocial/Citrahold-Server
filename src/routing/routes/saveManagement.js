const express = require("express");
const router = express.Router();

const path = require("path");
const fs = require("fs");

const SERVER_CONFIG = require("../../../config.json");

const { CONSTANTS, ROOT_DIRECTORY } = require("../../shared.js");

const { getUserID } = require("../../userAuthentication");
const { getUserDataUsage, ensureDirectoryExistence, dirSize, getFiles } = require("../../helpers.js");

router.post(["/uploadSaves", "/uploadExtdata"], (req, res) => {

	const isGetSaves = req.originalUrl.startsWith("/uploadSaves");
	const folder = isGetSaves ? "saves" : "extdata";

	if (!req.body.filename || typeof req.body.filename !== "string" || req.body.filename.startsWith(".") || req.body.filename.length > CONSTANTS.MAX_PATH_LENGTH) {
		res.status(400).send({
			error: "Invalid request. You didn't send a valid filename."
		});
		return;
	}

	if (!req.body.token || typeof req.body.token !== "string") {
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
				ROOT_DIRECTORY,
				folder,
				userID,
				req.body.filename
			).startsWith(path.resolve(ROOT_DIRECTORY, folder, userID))) {
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
					ROOT_DIRECTORY,
					folder,
					userID,
					req.body.filename
				));
				fs.writeFile(path.resolve(
					ROOT_DIRECTORY,
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
						var gameDir = path.resolve(ROOT_DIRECTORY, folder, userID, game);
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

router.post(["/getSaves/:game?", "/getExtdata/:game?"], (req, res) => {

	const isGetSaves = req.originalUrl.startsWith("/getSaves");
	const folder = isGetSaves ? "saves" : "extdata";

	const token = req.body.token;

	if (!token || typeof token !== "string") {
		res.status(400).send({
			error: "Invalid token."
		});
		return;
	}

	// 3DS has trouble sending fancy unicode characters as URI
	// so we'll also accept the game name as a body parameter
	var game = req.body.game || req.params.game;

	if (game && typeof game !== "string") {
		res.status(400).send({
			error: "Invalid game."
		});
		return;
	}

	getUserID(token).then((userID) => {
		const location = path.resolve(ROOT_DIRECTORY, folder, userID);

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
			const gameLocation = path.resolve(ROOT_DIRECTORY, folder, userID, game);

			if (!gameLocation.startsWith(path.resolve(ROOT_DIRECTORY, folder, userID))) {
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

router.post(["/deleteSaves/:game?", "/deleteExtdata/:game?"], (req, res) => {
	const isDeleteSaves = req.originalUrl.startsWith("/deleteSaves");
	const folder = isDeleteSaves ? "saves" : "extdata";
	const token = req.body.token;

	if (!token || typeof token !== "string") {
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

		const gameLocation = path.resolve(ROOT_DIRECTORY, folder, userID, game);
		if (!gameLocation.startsWith(path.resolve(ROOT_DIRECTORY, folder, userID))) {
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

router.post(["/renameSaves", "/renameExtdata"], (req, res) => {
	const isRenameSaves = req.originalUrl.startsWith("/renameSaves");
	const folder = isRenameSaves ? "saves" : "extdata";
	const token = req.body.token;

	if (!token || typeof token !== "string") {
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

		const gameLocation = path.resolve(ROOT_DIRECTORY, folder, userID, game);
		if (!gameLocation.startsWith(path.resolve(ROOT_DIRECTORY, folder, userID))) {
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

			if (fs.existsSync(path.resolve(ROOT_DIRECTORY, folder, userID, newGame))) {

				res.status(409).send({
					error: "I can't rename a game to a game that already exists."
				});
				return;
			}

			fs.rename(gameLocation, path.resolve(ROOT_DIRECTORY, folder, userID, newGame), (err) => {
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

router.use(["/downloadSaves*", "/downloadExtdata*"], (req, res) => {
	const token = req.body.token;
	const isGetSaves = req.originalUrl.startsWith("/downloadSaves");
	const folder = isGetSaves ? "saves" : "extdata";

	if (!token || typeof token !== "string") {
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

			location = path.join(ROOT_DIRECTORY, folder, userID, (req.body.game || ""), (req.body.file || ""));
		} else {
			location = decodeURIComponent(location);
			location = location.split("/");
			location = path.resolve(ROOT_DIRECTORY, folder, userID, ...location);
		}

		if (!location.startsWith(path.resolve(ROOT_DIRECTORY, folder, userID))) {
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

module.exports = router;