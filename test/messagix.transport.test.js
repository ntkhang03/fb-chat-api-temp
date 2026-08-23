/* eslint-disable no-unused-vars */
"use strict";

const http = require("http");
const assert = require("assert");
const login = require("../index");

function createSidecarServer() {
	let streamCount = 0;
	const server = http.createServer((req, res) => {
		let raw = "";
		req.on("data", chunk => {
			raw += chunk;
		});
		req.on("end", () => {
			const body = raw ? JSON.parse(raw) : {};

			if (req.method === "POST" && req.url === "/auth/login") {
				res.writeHead(200, { "Content-Type": "application/json" });
				return res.end(JSON.stringify({ userID: "123456789", appState: body.appState || [] }));
			}

			if (req.method === "POST" && req.url === "/messages/send") {
				res.writeHead(200, { "Content-Type": "application/json" });
				return res.end(JSON.stringify({
					threadID: body.threadID,
					messageID: "mid.test",
					timestamp: 123456
				}));
			}

			if (req.method === "POST" && req.url === "/threads/read") {
				res.writeHead(200, { "Content-Type": "application/json" });
				return res.end(JSON.stringify({ ok: true }));
			}

			if (req.method === "POST" && req.url === "/threads/typing") {
				res.writeHead(200, { "Content-Type": "application/json" });
				return res.end(JSON.stringify({ ok: true }));
			}

			if (req.method === "GET" && req.url === "/threads/thread-1") {
				res.writeHead(200, { "Content-Type": "application/json" });
				return res.end(JSON.stringify({
					threadID: "thread-1",
					name: "Thread One",
					participantIds: ["1", "2"],
					messageCount: 10,
					emoji: "👍",
					nicknames: { "1": "A" },
					color: "0084ff",
					isGroup: true
				}));
			}

			if (req.method === "GET" && req.url.indexOf("/events/stream") === 0) {
				const payload = streamCount === 0
					? {
						cursor: "cursor-1",
						events: [
							{
								eventType: "message",
								threadId: "thread-1",
								senderId: "2",
								messageId: "mid-2",
								body: "hello",
								timestamp: 1000
							}
						]
					}
					: { cursor: "cursor-1", events: [] };
				streamCount++;
				res.writeHead(200, { "Content-Type": "application/json" });
				return res.end(JSON.stringify(payload));
			}

			res.writeHead(404, { "Content-Type": "application/json" });
			return res.end(JSON.stringify({ error: "not found" }));
		});
	});
	return server;
}

describe("Messagix transport", function () {
	let server;
	let baseUrl;
	let api;

	before(function (done) {
		server = createSidecarServer();
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address();
			baseUrl = "http://127.0.0.1:" + addr.port;
			login(
				{ appState: [] },
				{
					transport: "messagix",
					messagix: {
						baseUrl,
						timeoutMs: 5000
					}
				},
				(err, localApi) => {
					if (err) return done(err);
					api = localApi;
					done();
				}
			);
		});
	});

	after(function (done) {
		server.close(done);
	});

	it("logs in with selected transport", function () {
		assert(api);
		assert.strictEqual(api.getCurrentUserID(), "123456789");
		assert.strictEqual(typeof api.sendMessage, "function");
		assert.strictEqual(typeof api.listen, "function");
	});

	it("sends message using sidecar", function (done) {
		api.sendMessage({ body: "hello" }, "thread-1", (err, info) => {
			if (err) return done(err);
			assert.strictEqual(info.threadID, "thread-1");
			assert.strictEqual(info.messageID, "mid.test");
			done();
		});
	});

	it("gets thread info via sidecar", function (done) {
		api.getThreadInfo("thread-1", (err, info) => {
			if (err) return done(err);
			assert.strictEqual(info.threadID, "thread-1");
			assert.strictEqual(info.name, "Thread One");
			assert.deepStrictEqual(info.participantIDs, ["1", "2"]);
			done();
		});
	});

	it("marks thread as read via sidecar", function (done) {
		api.markAsRead("thread-1", done);
	});

	it("normalizes listen events", function (done) {
		const stop = api.listen((err, event) => {
			if (err) return done(err);
			try {
				assert.strictEqual(event.type, "message");
				assert.strictEqual(event.threadID, "thread-1");
				assert.strictEqual(event.senderID, "2");
				assert.strictEqual(event.messageID, "mid-2");
				assert.strictEqual(event.timestamp, "1000");
				stop();
				done();
			} catch (e) {
				done(e);
			}
		});
	});
});
