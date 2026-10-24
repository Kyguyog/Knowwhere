/* KnowWhere shared sign-in / sign-up flows.
   Provides window.__kwSignIn (username-or-email login) and window.__kwSignup
   (access request) for every page that loads auth.js with allowUsername/signup.
   Uses the existing default Firebase app when one is already present. */
import { initializeApp, getApps, deleteApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore, doc, getDocs, setDoc, collection } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB_7DGpmrVotodTuPJDXoZrKrKbkzPhWDw",
  authDomain: "knowwhere-firebase.firebaseapp.com",
  projectId: "knowwhere-firebase",
  storageBucket: "knowwhere-firebase.firebasestorage.app",
  messagingSenderId: "389831660515",
  appId: "1:389831660515:web:0bcd3292610b1be0af86d6",
  measurementId: "G-9LMCC5TS1J"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

window.__kwSignIn = async function (input, password) {
  let loginEmail = input;
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
  if (!isEmail) {
    let found = false;
    try {
      const usersSnap = await getDocs(collection(db, "users"));
      const usernameLower = input.toLowerCase();
      for (const d of usersSnap.docs) {
        const uData = d.data();
        if (uData.username && uData.username.toLowerCase() === usernameLower) {
          loginEmail = d.id;
          found = true;
          break;
        }
      }
    } catch (e) {
      throw new Error("Error looking up username. Try using your email instead.");
    }
    if (!found) throw new Error("No account found with that username.");
  }
  return signInWithEmailAndPassword(auth, loginEmail, password);
};

window.__kwSignup = async function () {
  const fullName = document.getElementById("signup-fullname").value.trim();
  const username = document.getElementById("signup-username").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const confirm = document.getElementById("signup-confirm").value;
  const errEl = document.getElementById("signup-error");
  const successEl = document.getElementById("signup-success");
  const btn = document.getElementById("signup-submit");
  errEl.classList.remove("show");
  successEl.style.display = "none";
  if (!fullName || !email || !password || !confirm) {
    errEl.textContent = "Please fill in all fields.";
    errEl.classList.add("show");
    return;
  }
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  if (nameParts.length < 2) {
    errEl.textContent = "Please enter your full name (first and last).";
    errEl.classList.add("show");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email)) {
    errEl.textContent = "Please enter a valid email address.";
    errEl.classList.add("show");
    return;
  }
  if (password.length < 6) {
    errEl.textContent = "Password must be at least 6 characters.";
    errEl.classList.add("show");
    return;
  }
  if (password !== confirm) {
    errEl.textContent = "Passwords do not match.";
    errEl.classList.add("show");
    return;
  }
  btn.disabled = true;
  btn.textContent = "Sending request...";
  try {
    const RETRY_MS = 60 * 60 * 1000;
    const finalUsername = username || nameParts[0];
    const usernameLower = finalUsername.toLowerCase();
    const usersSnap = await getDocs(collection(db, "users"));
    for (const d of usersSnap.docs) {
      if (d.id.toLowerCase() === email.toLowerCase()) {
        errEl.textContent = "An account with that email already exists. Try logging in instead.";
        errEl.classList.add("show");
        btn.disabled = false;
        btn.textContent = "Request Access";
        return;
      }
      const uData = d.data();
      if (uData.username && uData.username.toLowerCase() === usernameLower) {
        errEl.textContent = "That username is already taken. Please choose a different one.";
        errEl.classList.add("show");
        btn.disabled = false;
        btn.textContent = "Request Access";
        return;
      }
    }
    const existing = await getDocs(collection(db, "signupRequests"));
    for (const d of existing.docs) {
      const data = d.data();
      if (data.username && data.username.toLowerCase() === usernameLower && (data.status === "pending" || data.status === "approved")) {
        errEl.textContent = "That username is already taken. Please choose a different one.";
        errEl.classList.add("show");
        btn.disabled = false;
        btn.textContent = "Request Access";
        return;
      }
      if (data.email !== email) continue;
      if (data.status === "pending" || data.status === "approved") {
        errEl.textContent = "A request for this email has already been submitted.";
        errEl.classList.add("show");
        btn.disabled = false;
        btn.textContent = "Request Access";
        return;
      }
      if (data.status === "denied") {
        const deniedAt = data.deniedAt ? new Date(data.deniedAt).getTime() : 0;
        const elapsed = Date.now() - deniedAt;
        if (elapsed < RETRY_MS) {
          const remaining = RETRY_MS - elapsed;
          btn.disabled = false;
          btn.textContent = "Request Access";
          const formatCountdown = (ms) => {
            const totalSec = Math.ceil(ms / 1000);
            const m = Math.floor(totalSec / 60);
            const s = totalSec % 60;
            return m + "m " + String(s).padStart(2, "0") + "s";
          };
          let countdownMs = remaining;
          errEl.innerHTML = "Your signup request was denied. You can retry in <strong id=\"retry-countdown\">" + formatCountdown(countdownMs) + "</strong>.";
          errEl.classList.add("show");
          btn.disabled = true;
          btn.textContent = "Try Again Later";
          if (window._retryCountdownInterval) clearInterval(window._retryCountdownInterval);
          window._retryCountdownInterval = setInterval(() => {
            countdownMs -= 1000;
            if (countdownMs <= 0) {
              clearInterval(window._retryCountdownInterval);
              window._retryCountdownInterval = null;
              errEl.classList.remove("show");
              btn.disabled = false;
              btn.textContent = "Request Access";
            } else {
              const el = document.getElementById("retry-countdown");
              if (el) el.textContent = formatCountdown(countdownMs);
            }
          }, 1000);
          return;
        }
      }
    }
    const requestId = email.replace(/[^a-zA-Z0-9]/g, "_") + "_" + Date.now();
    await setDoc(doc(db, "signupRequests", requestId), {
      email,
      fullName,
      username: finalUsername,
      password,
      status: "pending",
      requestedAt: new Date().toISOString()
    });
    const pendingAppName = "pending-signup-" + Date.now();
    const pendingApp = initializeApp(firebaseConfig, pendingAppName);
    const pendingAuth = getAuth(pendingApp);
    try {
      await createUserWithEmailAndPassword(pendingAuth, email, password);
    } catch (ae) {
    } finally {
      await signOut(pendingAuth).catch(() => {});
      await deleteApp(pendingApp).catch(() => {});
    }
    successEl.textContent = "✓ Request submitted! An admin will review your application. You can log in now to message an admin while you wait.";
    successEl.style.display = "block";
    btn.style.display = "none";
    document.getElementById("signup-fullname").value = "";
    document.getElementById("signup-username").value = "";
    document.getElementById("signup-email").value = "";
    document.getElementById("signup-password").value = "";
    document.getElementById("signup-confirm").value = "";
  } catch (e) {
    errEl.textContent = e.message || "Failed to submit request. Try again.";
    errEl.classList.add("show");
    btn.disabled = false;
    btn.textContent = "Request Access";
  }
};

window.handleSignupRequest = window.__kwSignup;
