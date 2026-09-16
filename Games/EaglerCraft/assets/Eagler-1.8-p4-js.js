"use strict";
(function(){
	var launchInterval = -1;
	var launchCounter = 1;
	var launchCountdownNumberElement = null;
	var launchCountdownProgressElement = null;
	var launchSkipCountdown = false;
	var launchTick = function() {
		if(launchCounter > 100 || launchSkipCountdown) {
			if(window.clientScriptSrcURL) {
				clearInterval(launchInterval);
				setTimeout(function() {
					document.body.removeChild(document.getElementById("launch_countdown_screen"));
					document.body.style.backgroundColor = "black";
					var script = document.createElement("script");
					script.type = "text/javascript";
					script.src = window.clientScriptSrcURL;
					window.clientScriptSrcURL = null;
					document.head.appendChild(script);
				}, 50);
			}
			return;
		}
		if(launchCounter === 100) {
			document.getElementById("gameWillLaunchIn").innerText = "Decompressing...";
		}else {
			launchCountdownNumberElement.innerText = "" + Math.floor(6.0 - launchCounter * 0.06);
		}
		launchCountdownProgressElement.style.width = "" + launchCounter + "%";
		++launchCounter;
	};
	window.addEventListener("load", function() {
		launchCountdownNumberElement = document.getElementById("launchCountdownNumber");
		launchCountdownProgressElement = document.getElementById("launchCountdownProgress");
		launchInterval = setInterval(launchTick, 50);
		document.getElementById("skipCountdown").addEventListener("click", function() {
			launchSkipCountdown = true;
			document.getElementById("gameWillLaunchIn").innerText = "Decompressing...";
		});
		document.getElementById("bootMenu").addEventListener("click", function() {
			launchSkipCountdown = true;
			document.getElementById("gameWillLaunchIn").innerText = "Decompressing...";
			window.eaglercraftXOptsHints.showBootMenuOnLaunch = true;
		});
	});
})();