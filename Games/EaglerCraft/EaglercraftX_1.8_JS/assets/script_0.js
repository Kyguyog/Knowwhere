
"use strict";
var relayId = Math.floor(Math.random() * 3);

// %%%%%%%%% launch options %%%%%%%%%%%%

window.eaglercraftXOptsHints = {
	hintsVersion: 1,
	container: "game_frame",
	worldsDB: "worlds",
	relays: [
		{ addr: "wss://relay.deev.is/", comment: "lax1dude relay #1", primary: relayId === 0 },
		{ addr: "wss://relay.lax1dude.net/", comment: "lax1dude relay #2", primary: relayId === 1 },
		{ addr: "wss://relay.shhnowisnottheti.me/", comment: "ayunami relay #1", primary: relayId === 2 }
	],
	checkRelaysForUpdates: true
};

// %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

