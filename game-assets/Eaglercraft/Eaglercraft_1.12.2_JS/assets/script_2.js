
        "use strict";
        (function(){
            window.eaglercraftXOpts.assetsURI = [ { url: "assets/asset_0.bin" }, { url: "assets/asset_1.bin", path: "assets/minecraft/lang/" } ];

            var launchInterval = -1;
            var launchCounter = 1;
            var launchCountdownNumberElement = null;
            var launchCountdownProgressElement = null;
            var launchSkipCountdown = false;

            var launchTick = function() {
                launchCountdownNumberElement.innerText = "" + Math.floor(6.0 - launchCounter * 0.06);
                launchCountdownProgressElement.style.width = "" + launchCounter + "%";
                if(++launchCounter > 100 || launchSkipCountdown) {
                    clearInterval(launchInterval);
                    setTimeout(function() {
                        document.body.removeChild(document.getElementById("launch_countdown_screen"));
                        document.body.style.backgroundColor = "black";
                        main();
                    }, 50);
                }
            };

            window.addEventListener("load", function() {
                launchCountdownNumberElement = document.getElementById("launchCountdownNumber");
                launchCountdownProgressElement = document.getElementById("launchCountdownProgress");
                launchInterval = setInterval(launchTick, 50);
                document.getElementById("skipCountdown").addEventListener("click", function() {
                    launchSkipCountdown = true;
                });
                document.getElementById("skipCountdown").focus();
                /*
                document.getElementById("bootMenu").addEventListener("click", function() {
                    launchSkipCountdown = true;
                    window.eaglercraftXOpts.showBootMenuOnLaunch = true;
                });
                */
            });
        })();
    