
"use strict";
(function(){
	function eaglerBundleUnwrap(tagIn) { var e = document.getElementById(tagIn); var ret = e.innerText; document.head.removeChild(e); return ret;  }
	window.eaglercraftXClientSignature = eaglerBundleUnwrap("eaglercraftXClientSignature");
	window.eaglercraftXClientBundle = eaglerBundleUnwrap("eaglercraftXClientBundle");
})();
