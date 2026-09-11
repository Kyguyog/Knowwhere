// Debug log to confirm the injected script actually runs in page context
console.log("✅ Canvas Guard injected into page context");

// Your visibility override logic
Object.defineProperty(document, 'visibilityState', {value: 'visible', writable: true});
Object.defineProperty(document, 'hidden', {value: false, writable: true});
Object.defineProperty(document, 'webkitVisibilityState', {value: 'visible', writable: true});
Object.defineProperty(document, 'webkitHidden', {value: false, writable: true});

Window.prototype.realEventListener = Window.prototype.addEventListener;
Window.prototype.addEventListener = function(a, b, c) {
    if (a === "focus" || a === "blur" || a === "visibilitychange") {
        console.log(`[AD] '${a}' event subscription prevented.`);
    } else {
        realEventListener.call(this, a, b, c);
    }
};
