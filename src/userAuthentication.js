const SERVER_CONFIG = require("../config.json");
const { query, executeStatement } = require("./database");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");

function checkIfEmailIsVerified(userID) {

    return new Promise((resolve, reject) => {

        if (!SERVER_CONFIG.verifyEmail) {
            resolve(true);
            return;
        }

        const sql = "SELECT verified FROM user WHERE id = ?";
        const params = [userID];

        query(sql, params).then((rows) => {
            console.log(rows);
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

function changePassword(userID, newPassword) {

    return new Promise((resolve, reject) => {
        bcrypt.hash(newPassword, SERVER_CONFIG.bcryptSaltRounds).then((hashedPassword) => {
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

function getUserIDFromEmail(email) {

    return new Promise((resolve, reject) => {
        const sql = "SELECT id FROM user WHERE email = ?";
        const params = [email];

        query(sql, params).then((rows) => {
            if (rows.length > 0) {
                resolve(rows[0].id);
            } else {
                reject("Invalid email.");
            }
        }).catch((err) => {
            console.error(err);
            reject(err);
        });
    });

}

function userIsNotResettingEmail(userID) {

    // check if their password is null

    return new Promise((resolve, reject) => {
        const sql = "SELECT hash FROM user WHERE id = ?";
        const params = [userID];

        query(sql, params).then((rows) => {
            if (rows.length > 0) {
                console.log(rows);
                if (rows[0].hash === null) {
                    reject(false);
                } else {
                    resolve(true);
                }
            } else {
                reject("Invalid userID.");
            }
        }).catch((err) => {
            console.error(err);
            reject(err);
        });

    });
}

module.exports = {
    checkIfEmailIsVerified,
    handleToken,
    getToken,
    getUserID,
    changePassword,
    getUserIDFromEmail,
    userIsNotResettingEmail,
};