const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const { ROOT_DIRECTORY } = require("./shared");

async function executeStatement(sql, params = []) {

    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(path.resolve(ROOT_DIRECTORY, "main.db"));

        try {

            db.run(sql, params, function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve("Success");
                }
            });

        } catch (err) {
            console.error(err);
            reject(err);

        } finally {
            db.close();
        }
    });
}

function query(sql, params = []) {

    return new Promise((resolve, reject) => {

        const db = new sqlite3.Database(path.resolve(ROOT_DIRECTORY, "main.db"));

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

module.exports = {
    executeStatement,
    query,
};