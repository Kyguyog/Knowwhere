/* KnowWhere access wall.
   After sign-in, checks the user's Firestore record.
   - Banned (temporary or permanent): every page EXCEPT the messages page
     (msg.html) is blocked behind a suspension popup. Temporary bans show the
     exact date/time the user will be unblocked, plus a live countdown.
   - Unpaid (and not admin/editor): every page EXCEPT msg.html is blocked
     behind a popup asking them to pay $3 via Venmo (shows the Venmo QR photo)
     or in cash (links to msg.html to set up a meetup with staff).
   Banned and unpaid users may still message staff only from msg.html. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB_7DGpmrVotodTuPJDXoZrKrKbkzPhWDw",
  authDomain: "knowwhere-firebase.firebaseapp.com",
  projectId: "knowwhere-firebase",
  storageBucket: "knowwhere-firebase.firebasestorage.app",
  messagingSenderId: "389831660515",
  appId: "1:389831660515:web:0bcd3292610b1be0af86d6",
  measurementId: "G-9LMCC5TS1J"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const isMessagesPage = /\/msg(\.html)?$/.test(window.location.pathname);
const VENMO_IMG = "/MyVenmoQRCode.png";
const VENMO_LINK = "https://venmo.com/code?user_id=4304463569356602729&created=1789615061.810669";
const MESSAGES_LINK = "/msg.html";

let wallEl = null;
let banTimer = null;

function isPaidForMonth(userData) {
  if (!userData) return false;
  if (userData.admin === true || userData.editor === true) return true;
  return userData.paid === true;
}

function parseBanUntil(raw) {
  let t = null;
  if (typeof raw === "string") t = new Date(raw);
  else if (raw && typeof raw.toDate === "function") t = raw.toDate();
  else if (raw instanceof Date) t = raw;
  return t && !isNaN(t.getTime()) ? t : null;
}

function getBanInfo(userData) {
  if (!userData) return { banned: false, permanent: false, until: null };
  if (userData.banType === "permanent") return { banned: true, permanent: true, until: null };
  if (userData.banType === "temporary") {
    const until = parseBanUntil(userData.banUntil);
    if (until && until > new Date()) return { banned: true, permanent: false, until };
  }
  return { banned: false, permanent: false, until: null };
}

async function fetchUserData(email) {
  const raw = String(email || "").trim();
  if (!raw) return null;
  const ids = [raw];
  const lower = raw.toLowerCase();
  if (lower !== raw) ids.push(lower);
  for (const id of ids) {
    try {
      const snap = await getDoc(doc(db, "users", id));
      if (snap.exists()) return snap.data();
    } catch (_) {}
  }
  return null;
}

function hideWall() {
  if (banTimer) {
    clearInterval(banTimer);
    banTimer = null;
  }
  if (wallEl) {
    wallEl.remove();
    wallEl = null;
  }
  document.body.style.overflow = "";
}

function formatBanUntil(d) {
  try {
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", timeZoneName: "short" });
  } catch (_) {
    return d.toString();
  }
}

function formatRemaining(ms) {
  if (ms <= 0) return "any moment now";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [];
  if (d) parts.push(d + "d");
  if (d || h) parts.push(h + "h");
  if (d || h || m) parts.push(m + "m");
  parts.push(s + "s");
  return parts.join(" ");
}

function buildWall() {
  if (wallEl) {
    if (wallEl.id === "payment-wall") return;
    hideWall();
  }
  const overlay = document.createElement("div");
  overlay.id = "payment-wall";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483000;background:rgba(6,6,10,0.96);" +
    "backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:1rem;overflow-y:auto;";
  overlay.innerHTML =
    '<div style="background:var(--card,#111118);border:1px solid var(--border,#222230);border-radius:14px;' +
      "max-width:440px;width:100%;padding:2rem 1.75rem;text-align:center;" +
      "box-shadow:0 20px 70px rgba(0,0,0,0.8),0 0 30px rgba(168,85,247,0.12);" +
      'box-sizing:border-box;">' +
      '<div style="font-family:var(--font-display,Orbitron,sans-serif);font-size:0.7rem;font-weight:900;letter-spacing:0.25em;text-transform:uppercase;' +
        "color:#fca5a5;border:1px solid rgba(239,68,68,0.35);background:rgba(239,68,68,0.08);border-radius:6px;" +
        'padding:0.4rem 0.6rem;display:inline-block;margin-bottom:1.25rem;">Membership due</div>' +
      '<h2 style="font-family:var(--font-display,Orbitron,sans-serif);font-size:1.15rem;font-weight:800;color:var(--text,#f1f5f9);margin:0 0 0.6rem;">' +
        "You haven't paid this month yet</h2>" +
      '<p style="font-size:0.85rem;color:var(--muted,#64748b);line-height:1.6;margin:0 0 1.5rem;">' +
        "KnowWhere is <strong style=\"color:var(--text,#f1f5f9);\">$3/month</strong>. Until this month's dues are covered, " +
        "access is limited to messaging staff to arrange payment.</p>" +
      '<div style="font-size:0.72rem;color:#94a3b8;line-height:1.55;text-align:left;border:1px solid rgba(148,163,184,0.25);' +
        'background:rgba(148,163,184,0.06);border-radius:8px;padding:0.55rem 0.7rem;margin-bottom:1rem;">' +
        '<strong style="font-family:var(--font-display,Orbitron,sans-serif);font-size:0.58rem;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;display:block;margin-bottom:0.25rem;color:#94a3b8;">' +
          'Disclaimer</strong>' +
        'If this site is ever banned, taken down, or made unavailable for any reason, KnowWhere and its staff are <strong>not responsible</strong>. ' +
        'By using this site you agree that you will not hold us liable for any loss of access, data, or services.</div>' +
      '<div style="font-size:0.78rem;color:#fca5a5;line-height:1.55;text-align:left;border:1px solid rgba(239,68,68,0.4);' +
        'background:rgba(239,68,68,0.1);border-radius:8px;padding:0.65rem 0.75rem;margin-bottom:1.25rem;">' +
        '<strong style="font-family:var(--font-display,Orbitron,sans-serif);font-size:0.62rem;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;display:block;margin-bottom:0.3rem;">' +
          "⚠ Venmo warning</strong>" +
        "If you pay via Venmo, you <strong>must</strong> put your <strong>email and username</strong> in the payment " +
        "description. Otherwise you will have to prove it to an admin over video call or in person.</div>" +
      '<a href="' + VENMO_IMG + '" target="_blank" rel="noopener" title="Open the Venmo QR code to scan" ' +
        'style="display:block;margin:0 auto 1rem;width:180px;height:180px;border-radius:12px;overflow:hidden;border:1px solid var(--border,#222230);background:#fff;">' +
        '<img src="' + VENMO_IMG + '" alt="Venmo QR code to pay $3" style="width:100%;height:100%;object-fit:contain;display:block;"></a>' +
      '<a href="' + VENMO_LINK + '" target="_blank" rel="noopener" ' +
        'style="display:block;width:100%;padding:0.8rem 1rem;background:var(--primary,#a855f7);color:#fff;' +
        'font-family:var(--font-display,Orbitron,sans-serif);font-size:0.72rem;font-weight:700;letter-spacing:0.15em;' +
        'text-transform:uppercase;text-decoration:none;border-radius:8px;box-sizing:border-box;margin-bottom:0.6rem;">' +
        "Pay $3 via Venmo</a>" +
      '<a href="' + MESSAGES_LINK + '" ' +
        'style="display:block;width:100%;padding:0.8rem 1rem;background:transparent;border:1px solid var(--secondary,#22d3ee);' +
        'color:var(--secondary,#22d3ee);font-family:var(--font-display,Orbitron,sans-serif);font-size:0.72rem;font-weight:700;' +
        'letter-spacing:0.15em;text-transform:uppercase;text-decoration:none;border-radius:8px;box-sizing:border-box;margin-bottom:0.6rem;">' +
        "Pay with Cash &mdash; Message Staff</a>" +
    "</div>";
  document.body.appendChild(overlay);
  wallEl = overlay;
  document.body.style.overflow = "hidden";
}

function buildBanWall(ban) {
  if (wallEl) {
    if (wallEl.id === "ban-wall") return;
    hideWall();
  }
  const overlay = document.createElement("div");
  overlay.id = "ban-wall";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483000;background:rgba(6,6,10,0.96);" +
    "backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:1rem;overflow-y:auto;";

  const title = ban.permanent ? "You are permanently banned" : "You are temporarily banned";
  const lede = ban.permanent
    ? "Your account has been permanently suspended from KnowWhere. Until it is lifted, access is limited to messaging staff."
    : "Your account has been temporarily suspended from KnowWhere. Until it is lifted, access is limited to messaging staff.";

  let detail;
  if (!ban.permanent && ban.until) {
    detail =
      '<div style="font-size:0.78rem;color:#fca5a5;line-height:1.55;text-align:left;border:1px solid rgba(239,68,68,0.4);' +
        'background:rgba(239,68,68,0.1);border-radius:8px;padding:0.65rem 0.75rem;margin-bottom:1.25rem;">' +
        '<strong style="font-family:var(--font-display,Orbitron,sans-serif);font-size:0.62rem;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;display:block;margin-bottom:0.3rem;">' +
          "Ban expires</strong>" +
        "You will be unblocked on <strong>" + formatBanUntil(ban.until) + "</strong>." +
        '<span id="ban-countdown" style="display:block;margin-top:0.35rem;color:var(--muted,#64748b);font-size:0.72rem;"></span>' +
      "</div>";
  } else {
    detail =
      '<div style="font-size:0.78rem;color:#fca5a5;line-height:1.55;text-align:left;border:1px solid rgba(239,68,68,0.4);' +
        'background:rgba(239,68,68,0.1);border-radius:8px;padding:0.65rem 0.75rem;margin-bottom:1.25rem;">' +
        "This ban does not expire. If you think this was a mistake, message staff to appeal.</div>";
  }

  overlay.innerHTML =
    '<div style="background:var(--card,#111118);border:1px solid var(--border,#222230);border-radius:14px;' +
      "max-width:440px;width:100%;padding:2rem 1.75rem;text-align:center;" +
      "box-shadow:0 20px 70px rgba(0,0,0,0.8),0 0 30px rgba(239,68,68,0.12);" +
      'box-sizing:border-box;">' +
      '<div style="font-family:var(--font-display,Orbitron,sans-serif);font-size:0.7rem;font-weight:900;letter-spacing:0.25em;text-transform:uppercase;' +
        "color:#fca5a5;border:1px solid rgba(239,68,68,0.35);background:rgba(239,68,68,0.08);border-radius:6px;" +
        'padding:0.4rem 0.6rem;display:inline-block;margin-bottom:1.25rem;">Account suspended</div>' +
      '<h2 style="font-family:var(--font-display,Orbitron,sans-serif);font-size:1.15rem;font-weight:800;color:var(--text,#f1f5f9);margin:0 0 0.6rem;">' +
        title + "</h2>" +
      '<p style="font-size:0.85rem;color:var(--muted,#64748b);line-height:1.6;margin:0 0 1.5rem;">' +
        lede + "</p>" +
      detail +
      '<a href="' + MESSAGES_LINK + '" ' +
        'style="display:block;width:100%;padding:0.8rem 1rem;background:transparent;border:1px solid var(--secondary,#22d3ee);' +
        'color:var(--secondary,#22d3ee);font-family:var(--font-display,Orbitron,sans-serif);font-size:0.72rem;font-weight:700;' +
        'letter-spacing:0.15em;text-transform:uppercase;text-decoration:none;border-radius:8px;box-sizing:border-box;margin-bottom:0.6rem;">' +
        "Message Staff to Appeal</a>" +
    "</div>";

  document.body.appendChild(overlay);
  wallEl = overlay;
  document.body.style.overflow = "hidden";

  if (!ban.permanent && ban.until) {
    const cd = overlay.querySelector("#ban-countdown");
    const tick = function () {
      const ms = ban.until.getTime() - Date.now();
      if (ms <= 0) {
        hideWall();
        evaluateGate();
        return;
      }
      if (cd) cd.textContent = "Time remaining: " + formatRemaining(ms);
    };
    tick();
    banTimer = setInterval(tick, 1000);
  }
}

async function evaluateGate() {
  const user = auth.currentUser;
  if (!user) {
    hideWall();
    return;
  }
  if (isMessagesPage) {
    hideWall();
    return;
  }
  const data = await fetchUserData(user.email);
  const ban = getBanInfo(data);
  if (ban.banned) {
    buildBanWall(ban);
    return;
  }
  if (isPaidForMonth(data)) {
    hideWall();
  } else {
    buildWall();
  }
}

onAuthStateChanged(auth, function () {
  evaluateGate();
});