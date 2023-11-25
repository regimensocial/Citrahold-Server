const fs = require("fs");
const { executeStatement } = require("./src/database.js");
const { error } = require("./src/shared.js");

const defaultConfig = {
    "production": false,
    "maxUserDirSize": 128000,
    "verifyEmail": true,
    "frontEnd": "http://localhost:3001",
    "passwordResetPage": "/passwordReset.html?",
    "allowedOrigins": ["http://localhost:3000", "http://localhost:3001", "https://localhost:3444", "https://citrahold.regimen.social"],
    "bcryptSaltRounds": 10,
    "securePort": 3443,
    "insecurePort": 3000,
    "sameSitePolicy": "none"
};

const defaultEmailTransporterConfig = {
    "genuine": false,
    "host": "smtp.ethereal.email",
    "port": 587,
    "secure": false,
    "auth": {
        "user": "test",
        "pass": "test"
    }
};

/*
CREATE TABLE IF NOT EXISTS "token" (
    "token"	TEXT NOT NULL UNIQUE,
    "userID"	TEXT NOT NULL UNIQUE,
    "timestamp"	TEXT NOT NULL,
    PRIMARY KEY("token"),
    FOREIGN KEY("userID") REFERENCES "user"("id") ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "verification" (
    "userID"	TEXT NOT NULL UNIQUE,
    "id"	TEXT NOT NULL,
    "timestamp"	TEXT NOT NULL,
    PRIMARY KEY("id"),
    FOREIGN KEY("userID") REFERENCES "user"("id") ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "user" (
    "email"	TEXT NOT NULL UNIQUE,
    "hash"	TEXT,
    "verified"	INTEGER NOT NULL DEFAULT 0,
    "timestamp"	TEXT NOT NULL,
    "id"	TEXT NOT NULL UNIQUE,
    PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "unverifiedToken" (
    "token"	TEXT NOT NULL UNIQUE,
    "userID"	TEXT NOT NULL UNIQUE,
    "timestamp"	TEXT NOT NULL,
    PRIMARY KEY("token"),
    FOREIGN KEY("userID") REFERENCES "user"("id") ON UPDATE CASCADE
);
*/

[`CREATE TABLE IF NOT EXISTS "token" (
	"token"	TEXT NOT NULL UNIQUE,
	"userID"	TEXT NOT NULL UNIQUE,
	"timestamp"	TEXT NOT NULL,
	PRIMARY KEY("token"),
	FOREIGN KEY("userID") REFERENCES "user"("id") ON UPDATE CASCADE
);`,
`CREATE TABLE IF NOT EXISTS "verification" (
	"userID"	TEXT NOT NULL UNIQUE,
	"id"	TEXT NOT NULL,
	"timestamp"	TEXT NOT NULL,
	PRIMARY KEY("id"),
	FOREIGN KEY("userID") REFERENCES "user"("id") ON UPDATE CASCADE
);`,
`CREATE TABLE IF NOT EXISTS "user" (
	"email"	TEXT NOT NULL UNIQUE,
	"hash"	TEXT,
	"verified"	INTEGER NOT NULL DEFAULT 0,
	"timestamp"	TEXT NOT NULL,
	"id"	TEXT NOT NULL UNIQUE,
	PRIMARY KEY("id")
);`,
`CREATE TABLE IF NOT EXISTS "unverifiedToken" (
	"token"	TEXT NOT NULL UNIQUE,
	"userID"	TEXT NOT NULL UNIQUE,
	"timestamp"	TEXT NOT NULL,
	PRIMARY KEY("token"),
	FOREIGN KEY("userID") REFERENCES "user"("id") ON UPDATE CASCADE
);`].forEach((statement) => {
    executeStatement(statement, []).then().catch((err) => {
        error(err);
    });
});

if (!fs.existsSync("./config.json")) {
    fs.writeFileSync("./config.json", JSON.stringify(defaultConfig, null, 4));
}

if (!fs.existsSync("./softwareVersions.json")) {
    fs.writeFileSync("./softwareVersions.json", JSON.stringify({
        "3ds": "1.0.0", "pc": "1.0.1"
    }, null, 4));
}

if (!fs.existsSync("./emailTransporterConfig.json")) {
    fs.writeFileSync("./emailTransporterConfig.json", JSON.stringify(defaultEmailTransporterConfig, null, 4));
}
const CitraholdServer = require("./src/index.js");
CitraholdServer();