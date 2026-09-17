/* KnowWhere in-app message notifications.
   Shows a custom toast in the top-right on every page that loads user-menu.js
   whenever a new message arrives. Auto-dismisses after 7s (or via the x button),
   always shows the newest message, and opens the conversation on click. */
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB_7DGpmrVotodTuPJDXoZrKrKbkzPhWDw",
  authDomain: "knowwhere-firebase.firebaseapp.com",
  projectId: "knowwhere-firebase",
  storageBucket: "knowwhere-firebase.firebasestorage.app",
  messagingSenderId: "389831660515",
  appId: "1:389831660515:web:0bcd3292610b1be0af86d6",
  measurementId: "G-9LMCC5TS1J"
};

function resolveApp() {
  const apps = getApps();
  return apps.find((a) => a.name === "[DEFAULT]") || apps[0] || initializeApp(firebaseConfig);
}

const app = resolveApp();
const auth = getAuth(app);
const db = getFirestore(app);

const AUTO_DISMISS_MS = 7000;
const MAX_WORDS = 15;

let container = null;
let activeToast = null;
let activeTimer = null;
let unsub = null;
let ready = false;
const seen = new Map();

function ensureContainer() {
  if (container && document.body.contains(container)) return container;
  container = document.createElement("div");
  container.id = "kw-toast-container";
  container.style.cssText =
    "position:fixed;top:76px;right:16px;z-index:99999;display:flex;flex-direction:column;gap:10px;align-items:flex-end;pointer-events:none;max-width:calc(100vw - 32px);";
  document.body.appendChild(container);
  if (!document.getElementById("kw-toast-styles")) {
    const style = document.createElement("style");
    style.id = "kw-toast-styles";
    style.textContent = [
      "#kw-toast-container .kw-toast{pointer-events:auto;position:relative;width:330px;max-width:calc(100vw - 32px);background:var(--card,#12121a);border:1px solid rgba(168,85,247,0.45);border-left:3px solid var(--primary,#a855f7);border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.55),0 0 24px rgba(168,85,247,0.15);padding:0.8rem 0.9rem;cursor:pointer;transform:translateX(120%);opacity:0;transition:transform .28s cubic-bezier(.2,.8,.2,1),opacity .28s ease;font-family:var(--font-body,system-ui),sans-serif;}",
      "#kw-toast-container .kw-toast.kw-in{transform:translateX(0);opacity:1;}",
      "#kw-toast-container .kw-toast.kw-out{transform:translateX(120%);opacity:0;}",
      "#kw-toast-container .kw-toast-head{display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem;}",
      "#kw-toast-container .kw-toast-title{flex:1;min-width:0;font-family:var(--font-display,inherit);font-size:0.72rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--primary,#a855f7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      "#kw-toast-container .kw-toast-close{flex-shrink:0;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border:1px solid var(--border,#2a2a35);border-radius:6px;background:transparent;color:var(--muted,#8b8b9a);cursor:pointer;font-size:0.8rem;line-height:1;transition:background .15s,color .15s;}",
      "#kw-toast-container .kw-toast-close:hover{background:rgba(255,255,255,0.08);color:var(--text,#fff);}",
      "#kw-toast-container .kw-toast-body{font-size:0.82rem;color:var(--text,#fff);line-height:1.4;word-break:break-word;}",
      "#kw-toast-container .kw-toast-attach{margin-top:0.3rem;font-size:0.72rem;color:var(--secondary,#22d3ee);display:flex;align-items:center;gap:0.35rem;}"
    ].join("");
    document.head.appendChild(style);
  }
  return container;
}

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncateWords(text, max) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(" ");
  return words.slice(0, max).join(" ") + "...";
}

function dismiss() {
  if (activeTimer) { clearTimeout(activeTimer); activeTimer = null; }
  const t = activeToast;
  if (!t) return;
  activeToast = null;
  t.classList.remove("kw-in");
  t.classList.add("kw-out");
  setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
}

function isActiveConv(id) {
  return /msg\.html$/i.test(location.pathname) && window.__kwActiveConvId === id;
}

function convTitle(c) {
  if (c.group === true) return c.groupTitle || "Group chat";
  return c.lastSenderName || "New message";
}

function openConv(id) {
  dismiss();
  if (typeof window.__kwOpenConv === "function") {
    window.__kwOpenConv(id);
  } else {
    window.location.href = "/msg.html?conv=" + encodeURIComponent(id);
  }
}

function showToast(id, c) {
  ensureContainer();
  if (activeToast) dismiss();

  let previewText = c.lastText ? truncateWords(c.lastText, MAX_WORDS) : "";
  if (!previewText && !c.lastHasAttachment) previewText = "New message";
  const attachLine = c.lastHasAttachment ? "Contains 1 attachment" : "";

  const toast = document.createElement("div");
  toast.className = "kw-toast";
  toast.innerHTML =
    '<div class="kw-toast-head">' +
      '<div class="kw-toast-title">' + escHtml(convTitle(c)) + '</div>' +
      '<button class="kw-toast-close" type="button" aria-label="Dismiss">\u2715</button>' +
    '</div>' +
    (previewText ? '<div class="kw-toast-body">' + escHtml(previewText) + '</div>' : '') +
    (attachLine ? '<div class="kw-toast-attach">\uD83D\uDCCE ' + escHtml(attachLine) + '</div>' : '');

  container.appendChild(toast);
  activeToast = toast;
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("kw-in")));
  toast.querySelector(".kw-toast-close").addEventListener("click", (e) => { e.stopPropagation(); dismiss(); });
  toast.addEventListener("click", () => openConv(id));
  activeTimer = setTimeout(dismiss, AUTO_DISMISS_MS);
}

function startListener(user) {
  stopListener();
  ready = false;
  seen.clear();
  const q = query(collection(db, "conversations"), where("participants", "array-contains", user.email));
  unsub = onSnapshot(q, (snap) => {
    const events = [];
    snap.docChanges().forEach((ch) => {
      const id = ch.doc.id;
      if (ch.type === "removed") { seen.delete(id); return; }
      const c = ch.doc.data() || {};
      const ts = c.lastMessageAt && c.lastMessageAt.toMillis ? c.lastMessageAt.toMillis() : 0;
      const prev = seen.get(id);
      seen.set(id, ts);
      if (!ready) return;
      if (!ts) return;
      if (prev !== undefined && ts <= prev) return;
      if (!c.lastSender) return;
      if (c.lastSender === user.email) return;
      if (isActiveConv(id)) return;
      events.push({ id, c, ts });
    });
    ready = true;
    if (events.length) {
      events.sort((a, b) => b.ts - a.ts);
      showToast(events[0].id, events[0].c);
    }
  }, (err) => {
    console.warn("[knowwhere] notification listener failed:", err);
  });
}

function stopListener() {
  if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
  ready = false;
  seen.clear();
  dismiss();
}

onAuthStateChanged(auth, (user) => {
  if (user && user.email) startListener(user);
  else stopListener();
});
