"use strict";

const utils = require("../../utils");

const TRANSPORT_METHOD_MAP = {
	sendMessage: "sendMessage",
	listenMqtt: "listen",
	getThreadInfo: "getThreadInfo",
	markAsRead: "markAsRead",
	sendTypingIndicator: "sendTypingIndicator"
};

function applyTransportToAPI(api, transport) {
	Object.keys(TRANSPORT_METHOD_MAP).forEach(apiMethod => {
		const transportMethod = TRANSPORT_METHOD_MAP[apiMethod];
		if (utils.getType(transport[transportMethod]) !== "Function" && utils.getType(transport[transportMethod]) !== "AsyncFunction") {
			throw new Error("Transport is missing required method: " + transportMethod);
		}

		api[apiMethod] = transport[transportMethod].bind(transport);
	});

	api.listen = api.listenMqtt;
	api.getThreadInfoGraphQL = api.getThreadInfo;
	return api;
}

module.exports = {
	TRANSPORT_METHOD_MAP,
	applyTransportToAPI
};
