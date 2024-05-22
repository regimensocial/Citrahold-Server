"use strict";

const express = require("express");
const app = express();

const fs = require("fs");

const http = require("http");
const https = require("https");

const { ROOT_DIRECTORY, log, error } = require("./shared.js");
const { resolve } = require("path");

const privateKey = fs.readFileSync(resolve(ROOT_DIRECTORY, "selfsigned.key"), "utf8");
const certificate = fs.readFileSync(resolve(ROOT_DIRECTORY, "selfsigned.crt"), "utf8");
const credentials = { key: privateKey, cert: certificate };

const SERVER_CONFIG = require("../config.json");

const cors = require("cors");
const cookieParser = require("cookie-parser");
const { jsonChecker, cookieChecker, usageLogger } = require("./routing/middleware.js");

const accessRoute = require("./routing/routes/access.js");
const accountManagementRoute = require("./routing/routes/accountManagement.js");
const areyouawakeRoute = require("./routing/routes/areyouawake.js");
const saveManagementRoute = require("./routing/routes/saveManagement.js");
const webRoute = require("./routing/routes/web.js");

module.exports = () => {

	app.use(cors(
		{
			origin: SERVER_CONFIG.allowedOrigins,
			methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
			credentials: true,
		}
	));

	app.use(express.json({ limit: (((SERVER_CONFIG.maxUserDirSize || 128000) / 1024) + "mb") }));
	app.use(express.urlencoded({ extended: true, limit: (((SERVER_CONFIG.maxUserDirSize || 128000) / 1024) + "mb") }));

	// Custom error handling middleware
	app.use((err, _req, res, next) => {
		if (err instanceof SyntaxError && err.status === 413) {
			error(err);
			res.status(413).json({ error: "The request payload exceeds the allowed limit." });
		} else {
			next();
		}
	});

	app.use(cookieParser());
	app.use(jsonChecker);
	app.use(cookieChecker);
	app.use(usageLogger);

	app.all("/softwareVersion", (_req, res) => {
		fs.readFile(resolve(ROOT_DIRECTORY, "softwareVersions.json"), (err, data) => {
			if (err) {
				error(err);
				res.status(500).json({ error: "Something went wrong." });
			} else {
				res.status(200).json(JSON.parse(data));
			}
		});
	});

	[accessRoute, accountManagementRoute, areyouawakeRoute, saveManagementRoute, webRoute].forEach((route) => {
		app.use("/", route);
	});

	if (SERVER_CONFIG.insecurePort > 0) {
		var httpServer = http.createServer(app);
		httpServer.listen(SERVER_CONFIG.insecurePort);
		log("Citrahold Server (insecure) open on port " + SERVER_CONFIG.insecurePort + ".");
	}

	if (SERVER_CONFIG.securePort > 0) {
		const httpsServer = https.createServer(credentials, app);
		httpsServer.listen(SERVER_CONFIG.securePort);
		log("Citrahold Server (secure) open on port " + SERVER_CONFIG.securePort + ".");
	}

	app.use ((req, res) => {
		res.status(404).json({ error: "Not Found", message: "The requested resource was not found." });
	});

};