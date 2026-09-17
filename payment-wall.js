/* KnowWhere monthly payment wall.
   After sign-in, checks the user's Firestore record. If they haven't paid
   for the current month (and aren't admin/editor), every page EXCEPT the
   messages page (msg.html) is blocked behind a popup asking them to pay $3
   via Venmo (shows the Venmo QR photo) or in cash (links to msg.html so they
   can set up a meetup with staff). Unpaid users may still message staff only
   from msg.html. */
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
const MESSAGES_LINK = "/msg.html";

let wallEl = null;

function isPaidForMonth(userData) {
  if (!userData) return false;
  if (userData.admin === true || userData.editor === true) return true;
  return userData.paid === true;
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
  if (wallEl) {
    wallEl.remove();
    wallEl = null;
  }
  document.body.style.overflow = "";
}

function buildWall() {
  if (wallEl) return;
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
      '<div style="font-size:0.78rem;color:#fca5a5;line-height:1.55;text-align:left;border:1px solid rgba(239,68,68,0.4);' +
        'background:rgba(239,68,68,0.1);border-radius:8px;padding:0.65rem 0.75rem;margin-bottom:1.25rem;">' +
        '<strong style="font-family:var(--font-display,Orbitron,sans-serif);font-size:0.62rem;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;display:block;margin-bottom:0.3rem;">' +
          "⚠ Venmo warning</strong>" +
        "If you pay via Venmo, you <strong>must</strong> put your <strong>email and username</strong> in the payment " +
        "description. Otherwise you will have to prove it to an admin over video call or in person.</div>" +
      '<a href="' + VENMO_IMG + '" target="_blank" rel="noopener" title="Open the Venmo QR code to scan" ' +
        'style="display:block;margin:0 auto 1rem;width:180px;height:180px;border-radius:12px;overflow:hidden;border:1px solid var(--border,#222230);background:#fff;">' +
        '<img src="' + VENMO_IMG + '" alt="Venmo QR code to pay $3" style="width:100%;height:100%;object-fit:contain;display:block;"></a>' +
      '<a href="' + VENMO_IMG + '" target="_blank" rel="noopener" ' +
        'style="display:block;width:100%;padding:0.8rem 1rem;background:var(--primary,#a855f7);color:#fff;' +
        'font-family:var(--font-display,Orbitron,sans-serif);font-size:0.72rem;font-weight:700;letter-spacing:0.15em;' +
        'text-transform:uppercase;text-decoration:none;border-radius:8px;box-sizing:border-box;margin-bottom:0.6rem;">' +
        "Pay $3 via Venmo</a>" +
      '<a href="' + MESSAGES_LINK + '" ' +
        'style="display:block;width:100%;padding:0.8rem 1rem;background:transparent;border:1px solid var(--secondary,#22d3ee);' +
        'color:var(--secondary,#22d3ee);font-family:var(--font-display,Orbitron,sans-serif);font-size:0.72rem;font-weight:700;' +
        'letter-spacing:0.15em;text-transform:uppercase;text-decoration:none;border-radius:8px;box-sizing:border-box;margin-bottom:0.6rem;">' +
        "Pay with Cash &mdash; Message Staff</a>" +
      '<button type="button" id="payment-wall-recheck" ' +
        'style="width:100%;padding:0.5rem;background:transparent;border:none;color:var(--muted,#64748b);font-size:0.7rem;cursor:pointer;text-decoration:underline;">' +
        "I've paid &mdash; check again</button>" +
    "</div>";
  overlay.querySelector("#payment-wall-recheck").addEventListener("click", async function () {
    const btn = this;
    btn.disabled = true;
    btn.textContent = "Checking...";
    const u = auth.currentUser;
    if (u) {
      const data = await fetchUserData(u.email);
      if (isPaidForMonth(data)) {
        hideWall();
        return;
      }
    }
    btn.disabled = false;
    btn.textContent = "I've paid — check again";
  });
  document.body.appendChild(overlay);
  wallEl = overlay;
  document.body.style.overflow = "hidden";
}

onAuthStateChanged(auth, async function (user) {
  if (!user) {
    hideWall();
    return;
  }
  if (isMessagesPage) return;
  const data = await fetchUserData(user.email);
  if (isPaidForMonth(data)) {
    hideWall();
  } else {
    buildWall();
  }
});