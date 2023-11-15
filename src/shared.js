const shorthandTokens = {};

const { createWriteStream } = require("fs");
const { resolve, join } = require("path");

const ROOT_DIRECTORY = resolve(__dirname, "..");

const logFilePath = join(ROOT_DIRECTORY, "console.log");
const logStream = createWriteStream(logFilePath, { flags: "a" });

const log = (message) => {
    console.log(message);
    logStream.write(message + "\n");
};

const error = (message) => {
    console.error(message);
    logStream.write("[ERROR]" + message + "\n");
};

log("-------- Starting server at " + new Date().toISOString() + " --------");

module.exports = {
    shorthandTokens,
    logStream,
    CONSTANTS: {
        MAX_EMAIL_LENGTH: 254,
        MAX_PASSWORD_LENGTH: 512,
        MAX_PATH_LENGTH: 512
    },
    ROOT_DIRECTORY,
    log,
    error
};