const nodemailer = require("nodemailer");
const EMAIL_TRANSPORTER_CONFIG = require("../emailTransporterConfig.json");
const SERVER_CONFIG = require("../config.json");
const { log, error } = require("./shared");

let transporter;

if (!EMAIL_TRANSPORTER_CONFIG.genuine) {
	log("Using test email transporter.");
	nodemailer.createTestAccount((err, account) => {
		if (err) {
			error("Failed to create a testing account. " + err.message);
			return process.exit(1);
		}
		transporter = nodemailer.createTransport({
			host: "smtp.ethereal.email",
			port: 587,
			secure: false,
			auth: {
				user: account.user,
				pass: account.pass,
			},
		});
	});
} else {
	log("Using genuine email transporter.");
	transporter = nodemailer.createTransport(
		EMAIL_TRANSPORTER_CONFIG
	);
}

async function sendVerificationEmail(email, code) {
	
	await transporter.sendMail({
		from: `"Citrahold" <${EMAIL_TRANSPORTER_CONFIG.auth.user}>`, 
		to: email, 
		subject: "Your verification code is " + code, 
		text: "Your verification code is " + code, 
		html: "<b>Your verification code is " + code + "</b>", 
	});
}

async function sendPasswordResetEmail(email, code) {
	
	await transporter.sendMail({
		from: `"Citrahold" <${EMAIL_TRANSPORTER_CONFIG.auth.user}>`, 
		to: email, 
		subject: "Reset your Citrahold password", 
		text: SERVER_CONFIG.frontEnd + SERVER_CONFIG.passwordResetPage + code, 
		html: `<a href="${SERVER_CONFIG.frontEnd + SERVER_CONFIG.passwordResetPage + code}">${SERVER_CONFIG.frontEnd + SERVER_CONFIG.passwordResetPage + code}</a>`, 
	});
}

module.exports = {
	sendVerificationEmail,
	sendPasswordResetEmail,
};