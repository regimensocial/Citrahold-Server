const { exec } = require("child_process");
const fs = require("fs");
const { readdir } = require("fs/promises");
const { resolve, dirname } = require("path");
const { ROOT_DIRECTORY } = require("./shared");

function dirSize(directory) {
    return new Promise((resolve, reject) => {

        if (!fs.existsSync(directory)) {
            resolve(0);
            return;
        } else {
            const command = `du -sk "${directory}" | cut -f1`;

            exec(command, (error, stdout, stderr) => {
                if (error) {
                    error(`Error executing command: ${error.message}`);
                    reject(error.message);
                    return;
                }

                if (stderr) {
                    error(`Command had errors: ${stderr}`);
                    reject(stderr);
                    return;
                }

                resolve(parseInt(stdout));
            });
        }

    });
}

function generateRandomNumberString(length) {
    let result = "";
    const characters = "0123456789";

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters[randomIndex];
    }

    return result;
}

async function getFiles(dir) {
    const dirents = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
        dirents
            .filter((dirent) => !dirent.name.startsWith("."))
            .map(async (dirent) => {
                const res = resolve(dir, dirent.name);
                return dirent.isDirectory() ? getFiles(res) : res;
            })
    );
    return Array.prototype.concat(...files);
}

function ensureDirectoryExistence(filePath) {
    var myDirname = dirname(filePath);
    if (fs.existsSync(myDirname)) {
        return true;
    }
    ensureDirectoryExistence(myDirname);
    fs.mkdirSync(myDirname);
}

async function getUserDataUsage(userID) {

    if (!userID) {
        return (0);
    }

    const savesDir = resolve(ROOT_DIRECTORY, "saves", userID);
    const extdataDir = resolve(ROOT_DIRECTORY, "extdata", userID);

    const savesSize = await dirSize(savesDir);
    const extdataSize = await dirSize(extdataDir);

    return (savesSize + extdataSize);

}

module.exports = {
    dirSize,
    generateRandomNumberString,
    getFiles,
    ensureDirectoryExistence,
    getUserDataUsage
};
