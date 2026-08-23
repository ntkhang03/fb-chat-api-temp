"use strict";

const request = require("request");
const utils = require("../../utils");
const log = require("npmlog");

const DEFAULT_BASE_URL = "http://127.0.0.1:8080";
const DEFAULT_TIMEOUT_MS = 15000;

function trimTrailingSlashes(url) {
	let out = url;
	while (out.length > 0 && out.charAt(out.length - 1) === "/") {
		out = out.slice(0, -1);
	}
	return out;
}

function buildError(message, details) {
	const err = new Error(message);
	Object.assign(err, details || {});
	return err;
}

function normalizeThreadInfo(data, threadID) {
	if (!data || utils.getType(data) !== "Object") {
		return { threadID: threadID.toString() };
	}

	return {
		threadID: (data.threadID || data.threadId || threadID).toString(),
		name: data.name || data.threadName || null,
		participantIDs: (data.participantIDs || data.participantIds || []).map(String),
		messageCount: data.messageCount || 0,
		emoji: data.emoji || null,
		nicknames: data.nicknames || {},
		color: data.color || null,
		isGroup: data.isGroup
	};
}

function normalizeEventShape(event) {
	if (!event || utils.getType(event) !== "Object") {
		return event;
	}

	const normalized = Object.assign({}, event);
	normalized.type = normalized.type || normalized.eventType || (normalized.body ? "message" : "event");

	if (normalized.threadId && !normalized.threadID) {
		normalized.threadID = normalized.threadId.toString();
	}

	if (normalized.senderId && !normalized.senderID) {
		normalized.senderID = normalized.senderId.toString();
	}

	if (normalized.messageId && !normalized.messageID) {
		normalized.messageID = normalized.messageId.toString();
	}

	if (normalized.timestamp != null) {
		normalized.timestamp = normalized.timestamp.toString();
	}

	if (!normalized.attachments) {
		normalized.attachments = [];
	}

	return normalized;
}

class MessagixTransport {
	constructor(config, ctx) {
		const cfg = config || {};
		this.ctx = ctx;
		this.baseUrl = trimTrailingSlashes(cfg.baseUrl || DEFAULT_BASE_URL);
		this.timeoutMs = cfg.timeoutMs || DEFAULT_TIMEOUT_MS;
		this.apiKey = cfg.apiKey || cfg.token || null;
	}

	_request(method, path, options) {
		options = options || {};
		const headers = Object.assign(
			{
				Accept: "application/json"
			},
			options.headers || {}
		);

		if (this.apiKey) {
			if (!headers.Authorization) {
				headers.Authorization = "Bearer " + this.apiKey;
			}
			headers["x-api-key"] = this.apiKey;
		}

		const reqOptions = {
			method: method,
			url: this.baseUrl + path,
			qs: options.query || undefined,
			headers,
			body: options.body || undefined,
			json: true,
			timeout: this.timeoutMs
		};

		return new Promise((resolve, reject) => {
			request(reqOptions, function (err, res, body) {
				if (err) {
					if (err.code === "ETIMEDOUT" || err.code === "ESOCKETTIMEDOUT") {
						return reject(buildError("Messagix sidecar request timed out", { code: "MESSAGIX_TIMEOUT", cause: err }));
					}

					if (err.code === "ECONNREFUSED") {
						return reject(buildError("Messagix sidecar is unavailable", { code: "MESSAGIX_UNAVAILABLE", cause: err }));
					}

					return reject(buildError("Messagix sidecar request failed", { code: "MESSAGIX_REQUEST_FAILED", cause: err }));
				}

				if (res && res.statusCode >= 400) {
					return reject(
						buildError("Messagix sidecar returned HTTP " + res.statusCode, {
							code: "MESSAGIX_HTTP_ERROR",
							statusCode: res.statusCode,
							details: body
						})
					);
				}

				return resolve(body || {});
			});
		});
	}

	login(loginData) {
		return this._request("POST", "/auth/login", {
			body: {
				appState: loginData.appState || null,
				email: loginData.email || null,
				password: loginData.password || null
			}
		});
	}

	sendMessage(msg, threadID, callback, replyToMessage, isGroup) {
		let resolveFunc = function () { };
		let rejectFunc = function () { };
		const returnPromise = new Promise(function (resolve, reject) {
			resolveFunc = resolve;
			rejectFunc = reject;
		});

		if (!callback || (utils.getType(callback) !== "Function" && utils.getType(callback) !== "AsyncFunction")) {
			callback = function (err, data) {
				if (err) {
					return rejectFunc(err);
				}
				return resolveFunc(data);
			};
		}

		this._request("POST", "/messages/send", {
			body: {
				message: msg,
				threadID,
				replyToMessage,
				isGroup
			}
		})
			.then(res => callback(null, {
				threadID: (res.threadID || res.threadId || threadID).toString(),
				messageID: (res.messageID || res.messageId || "").toString(),
				timestamp: (res.timestamp || Date.now()).toString()
			}))
			.catch(err => callback(err));

		return returnPromise;
	}

	getThreadInfo(threadID, callback) {
		let resolveFunc = function () { };
		let rejectFunc = function () { };
		const returnPromise = new Promise(function (resolve, reject) {
			resolveFunc = resolve;
			rejectFunc = reject;
		});

		if (!callback || (utils.getType(callback) !== "Function" && utils.getType(callback) !== "AsyncFunction")) {
			callback = function (err, data) {
				if (err) {
					return rejectFunc(err);
				}
				return resolveFunc(data);
			};
		}

		this._request("GET", "/threads/" + encodeURIComponent(threadID))
			.then(data => callback(null, normalizeThreadInfo(data, threadID)))
			.catch(err => callback(err));

		return returnPromise;
	}

	markAsRead(threadID, read, callback) {
		if (utils.getType(read) === "Function" || utils.getType(read) === "AsyncFunction") {
			callback = read;
			read = true;
		}
		if (read == null) {
			read = true;
		}

		if (!callback || (utils.getType(callback) !== "Function" && utils.getType(callback) !== "AsyncFunction")) {
			callback = function () { };
		}

		this._request("POST", "/threads/read", {
			body: { threadID, read: !!read }
		})
			.then(() => callback())
			.catch(err => callback(err));
	}

	sendTypingIndicator(threadID, callback, isGroup) {
		if (!callback || (utils.getType(callback) !== "Function" && utils.getType(callback) !== "AsyncFunction")) {
			callback = function () { };
		}

		this._request("POST", "/threads/typing", {
			body: {
				threadID,
				isTyping: true,
				isGroup
			}
		})
			.then(() => callback())
			.catch(err => callback(err));

		return cb => {
			if (!cb || (utils.getType(cb) !== "Function" && utils.getType(cb) !== "AsyncFunction")) {
				cb = function () { };
			}
			this._request("POST", "/threads/typing", {
				body: {
					threadID,
					isTyping: false,
					isGroup
				}
			})
				.then(() => cb())
				.catch(err => cb(err));
		};
	}

	listen(callback) {
		let stopped = false;
		let cursor = null;

		const poll = () => {
			if (stopped) {
				return;
			}

			this._request("GET", "/events/stream", {
				query: cursor ? { cursor } : undefined
			})
				.then(res => {
					const events = utils.getType(res) === "Array" ? res : (res.events || []);
					cursor = (res && res.cursor) || cursor;

					events.forEach(event => {
						try {
							callback(null, normalizeEventShape(event));
						} catch (err) {
							log.error("listenMessagix", err);
						}
					});

					setTimeout(poll, 0);
				})
				.catch(err => {
					callback(err);
					if (!stopped) {
						setTimeout(poll, 1000);
					}
				});
		};

		poll();

		return function stopListening() {
			stopped = true;
		};
	}
}

module.exports = {
	MessagixTransport,
	DEFAULT_BASE_URL,
	DEFAULT_TIMEOUT_MS
};
