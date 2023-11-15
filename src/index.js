"use strict";

const express = require("express");
const app = express();

const fs = require("fs");

const http = require("http");
const https = require("https");

const privateKey = fs.readFileSync("../selfsigned.key", "utf8");
const certificate = fs.readFileSync("../selfsigned.crt", "utf8");
const credentials = { key: privateKey, cert: certificate };

const SERVER_CONFIG = require("../config.json");

const cors = require("cors");
const cookieParser = require("cookie-parser");
const { jsonChecker, cookieChecker } = require("./routing/middleware.js");

const accessRoute = require("./routing/routes/access.js");
const accountManagementRoute = require("./routing/routes/accountManagement.js");
const areyouawakeRoute = require("./routing/routes/areyouawake.js");
const saveManagementRoute = require("./routing/routes/saveManagement.js");
const webRoute = require("./routing/routes/web.js");

app.use(cors(
	{
		origin: SERVER_CONFIG.allowedOrigins,
		methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
		credentials: true,
	}
));
app.use(express.json({ limit: (((SERVER_CONFIG.maxUserDirSize || 128000) / 1024) + "kb") }));
app.use(express.urlencoded({ extended: true, limit: (((SERVER_CONFIG.maxUserDirSize || 128000) / 1024) + "kb") }));
app.use(cookieParser());
app.use(jsonChecker);
app.use(cookieChecker);

[accessRoute, accountManagementRoute, areyouawakeRoute, saveManagementRoute, webRoute].forEach((route) => {
	app.use("/", route);
});

if (SERVER_CONFIG.insecurePort > 0) {
	var httpServer = http.createServer(app);
	httpServer.listen(SERVER_CONFIG.insecurePort);
}

if (SERVER_CONFIG.securePort > 0) {
	const httpsServer = https.createServer(credentials, app);
	httpsServer.listen(SERVER_CONFIG.securePort);
}
