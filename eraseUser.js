// dev use only

const { query } = require("./src/database");
const { getUserIDFromEmail } = require("./src/userAuthentication");

// email should be first argument
const email = process.argv[2];

getUserIDFromEmail(email).then((userID) => {
    console.log(userID);

    // delete user from database

    query("DELETE FROM verification WHERE userID = ?", [userID]).then(() => {
        console.log("Deleted from verification");
    }).catch((err) => {
        console.error(err);
    });

    query("DELETE FROM token WHERE userID = ?", [userID]).then(() => {
        console.log("Deleted from token");
    }).catch((err) => {
        console.error(err);
    });

    query("DELETE FROM unverifiedToken WHERE userID = ?", [userID]).then(() => {
        console.log("Deleted from unverifiedToken");
    }).catch((err) => {
        console.error(err);
    });

    query("DELETE FROM user WHERE id = ?", [userID]).then(() => {
        console.log("User deleted entirely.");
    }).catch((err) => {
        console.error(err);
    });

}).catch((err) => {
    console.error(err);
});