const express = require("express");
const router = express.Router();

const { getUserDataUsage } = require("../../helpers");
const { getUserID } = require("../../userAuthentication");
const SERVER_CONFIG = require("../../../config.json");
const { query } = require("../../database");

router.all("/areyouawake", async (req, res) => {

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

module.exports = router;