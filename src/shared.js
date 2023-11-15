const shorthandTokens = {};

const { resolve } = require("path");

module.exports = {
    shorthandTokens,
    CONSTANTS: {
        MAX_EMAIL_LENGTH: 254,
        MAX_PASSWORD_LENGTH: 72,
        MAX_PATH_LENGTH: 512
    },
    ROOT_DIRECTORY: resolve(__dirname, "..")
};