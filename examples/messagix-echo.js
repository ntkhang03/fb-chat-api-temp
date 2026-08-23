"use strict";

const fs = require("fs");
const login = require("../index");

const appState = fs.existsSync("appstate.json")
	? JSON.parse(fs.readFileSync("appstate.json", "utf8"))
	: [];

login(
	{ appState },
	{
		transport: "messagix",
		messagix: {
			baseUrl: process.env.MESSAGIX_BASE_URL || "http://127.0.0.1:8080",
			apiKey: process.env.MESSAGIX_API_KEY,
			timeoutMs: 15000
		}
	},
	(err, api) => {
		if (err) {
			return console.error("Login failed:", err);
		}

		console.log("Messagix transport ready. Listening for messages...");
		api.listen((listenErr, event) => {
			if (listenErr) {
				return console.error("Listen error:", listenErr);
			}

			if (event.type === "message" && event.body) {
				api.sendMessage("Echo: " + event.body, event.threadID, sendErr => {
					if (sendErr) {
						console.error("Send error:", sendErr);
					}
				});
			}
		});
	}
);
