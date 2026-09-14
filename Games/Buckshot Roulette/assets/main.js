const originalFetch = window.fetch;
const GITHUB_BASE = "https://raw.githubusercontent.com/Kyguyog/Knowwhere/main/Games/Buckshot%20Roulette/";

function mergeFiles(fileParts, onProgress) {
    return new Promise((resolve, reject) => {
        let buffers = [];

        function fetchPart(index) {
            if (index >= fileParts.length) {
                let mergedBlob = new Blob(buffers);
                let mergedFileUrl = URL.createObjectURL(mergedBlob);
                resolve(mergedFileUrl);
                return;
            }
            fetch(fileParts[index]).then((response) => {
                if (!response.ok) throw new Error("Missing part: " + fileParts[index]);
                return response.arrayBuffer();
            }).then((data) => {
                buffers.push(data);
                if (onProgress) onProgress();
                fetchPart(index + 1);
            }).catch(reject);
        }
        fetchPart(0);
    });
}

function getParts(file, start, end) {
    let parts = [];
    for (let i = start; i <= end; i++) {
        parts.push(GITHUB_BASE + file + ".part" + i);
    }
    return parts;
}

const pckParts = getParts("buckshot-roulette.pck", 1, 4);
const wasmParts = [GITHUB_BASE + "buckshot-roulette.wasm"];
const totalParts = pckParts.length + wasmParts.length;
let loadedParts = 0;

function onPartLoaded() {
    loadedParts++;
    const loadingText = document.getElementById('loading-text');
    if (loadingText) {
        loadingText.textContent = 'LOADING... (' + loadedParts + '/' + totalParts + ')';
    }
    const progressBar = document.getElementById('load-progress');
    if (progressBar) {
        progressBar.max = totalParts;
        progressBar.value = loadedParts;
    }
}

Promise.all([
    mergeFiles(pckParts, onPartLoaded),
    mergeFiles(wasmParts, onPartLoaded)
]).then(([pckUrl, wasmUrl]) => {
    window.fetch = async function (url, ...args) {
        if (url.endsWith("buckshot-roulette.pck")) {
            return originalFetch(pckUrl, ...args);
        } else if (url.endsWith("buckshot-roulette.wasm")) {
            return originalFetch(wasmUrl, ...args);
        } else {
            return originalFetch(url, ...args);
        }
    };
    window.godotRunStart();
});