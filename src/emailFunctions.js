const nodemailer = require("nodemailer");
const EMAIL_TRANSPORTER_CONFIG = require("../emailTransporterConfig.json");
const SERVER_CONFIG = require("../config.json");

const transporter = nodemailer.createTransport(
	EMAIL_TRANSPORTER_CONFIG
);

async function sendVerificationEmail(email, code) {
	// send mail with defined transport object
	await transporter.sendMail({
		from: `"Citrahold" <${EMAIL_TRANSPORTER_CONFIG.auth.user}>`, // sender address
		to: email, // list of receivers
		subject: "Your verification code is " + code, // Subject line
		text: "Your verification code is " + code, // plain text body
		html: "<b>Your verification code is " + code + "</b>", // html body
	});
}

async function sendPasswordResetEmail(email, code) {
	// send mail with defined transport object
	await transporter.sendMail({
		from: `"Citrahold" <${EMAIL_TRANSPORTER_CONFIG.auth.user}>`, // sender address
		to: email, // list of receivers
		subject: "Reset your Citrahold password", // Subject line
		text: SERVER_CONFIG.frontEnd + SERVER_CONFIG.passwordResetPage + code, // plain text body
		html: `<a href="${SERVER_CONFIG.frontEnd + SERVER_CONFIG.passwordResetPage + code}">${SERVER_CONFIG.frontEnd + SERVER_CONFIG.passwordResetPage + code}</a>`, // html body
	});
}

module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail,
};