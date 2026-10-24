Changes implemented October 24, 2026:

- Chat has a button-toggled emoji picker and supports pasting files. The picker stays open when selecting emojis, clicking elsewhere, or pressing Escape; click the emoji button again to close it. Files still use the existing base64 path; each file is capped at 650 KB to fit Firestore's document size limit, and messages at 12,000 characters. Switching chats waits for pending file reads/sends. History in the user dashboard now displays image, video, audio, and file attachments.
- Playtime for popup sessions syncs to Firebase at most once every 3 minutes per user/browser storage, across reloads and tabs (using Web Locks where available). Multiple checkpoints for the same game are combined into one transaction. Close/hide events only queue locally; retries also obey the 3-minute throttle. No new writes are made for an idle session after the final active delta is sent. Input inside accessible game frames, including nested frames, refreshes a 3-minute inactivity cutoff. Merely focusing a frame or returning to the tab does not refresh it. Cross-origin frames cannot expose their input, so they use a 4-hour inactivity cutoff instead. This also applies when an accessible game wrapper embeds an inaccessible nested frame. Accessible games retain the 3-minute input-based cutoff. Hidden time is excluded and returning after inactivity never counts the idle gap. Direct game links/new-tab launches remain outside popup tracking. The last uncheckpointed seconds can be lost if the browser process ends abruptly.
- The original Messages file viewer markup and preview code now live in `js/file-viewer.js`, shared by Messages and history. Clicking a history image opens that same larger preview with filename, download button, and close controls.
- The SWF loader was checked with the real Ruffle 0.7.1 runtime and the repository's Burrito Bison Revenge SWF (AS3, SWF v10, 720×480). Its title screen rendered and playback was active. Runtime loading is shared, stale loads are canceled when popups close/change, load failures display an error, and `.swf` URLs with query strings/fragments are recognized. This checks the loader; it does not certify every Flash game or feature.
- AI receives a public catalog/notice snapshot and explicit instructions to disclose uncertainty and avoid invented sources or capabilities. Provider failures are excluded from subsequent prompt context. This reduces hallucinations; it cannot guarantee factual answers or provide live web access.
- AI settings in Messages now set messages per user and window length (default: 20 messages per 60 minutes; 0 disables the limit). Each accepted prompt counts once, including failed requests. Usage is stored on the user's Firestore document using a transaction, shared across sessions/models, and resets after the window expires. Model selection uses the configured allowed list plus the default model; leaving the list empty discovers Gemini text models available to the configured key. Provider availability and billing still apply. The user's selection is remembered in this browser.
- Settings → Account → Show AI message usage controls whether Messages shows the user's remaining quota. This preference is stored in this browser.
- This remains a static client application. Quotas require permission to update `users/{email}.aiUsage`. Playtime transactions require read/write permission on `playtime/{id}`. No production rules or account data were changed. Client-accessible Gemini keys and user-writable quotas are not tamper-proof; enforcing quotas against deliberate bypass requires a trusted backend and corresponding Firestore rules.
- Mobile navigation now synchronizes its accessible expanded state, closes on Escape/outside click/desktop resize, and places the drawer above the messenger's mobile panels.
- The banned counter uses the same deduplicated entries as the Hall of Shame: manually entered names plus active permanent/temporary account bans. This keeps the displayed total equal to the list length. Expired temporary account bans do not add automatic entries; Firestore timestamp dates are supported.
- Clicking a user card (or pressing Enter/Space on it) opens the existing profile viewer. Buttons retain their own actions.
- The game/site editor supports search by name, URL, or other text fields, preserves unsaved edits while filtering, and initially collapses each entry on mobile. Relative paths become `/Games/...` or `/Sites/...` on blur and at save time. Absolute URLs, rooted paths, and existing Games/Sites prefixes are preserved.

Game additions, game repairs, additional AI keys, and image-hosting migration remain excluded. SWF-loader verification was authorized in the follow-up.

Free hosting options reviewed (no provider configured):

| Provider | Free allowance | Fit |
| --- | --- | --- |
| [Cloudinary](https://cloudinary.com/pricing) | 25 monthly credits shared across storage, delivery, and transformations; no card required | Convenient image uploads, resizing, and CDN delivery. My first choice for public avatars and site screenshots. |
| [Supabase Storage](https://supabase.com/pricing) | 1 GB file storage, 5 GB egress plus 5 GB cached egress | General files and access-controlled chat attachments. Free projects pause after one week of inactivity. |
| [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) | 10 GB-month Standard storage, 1 million Class A and 10 million Class B operations monthly; free direct egress | Larger media collections; authenticated upload integration needs a Worker or another trusted signing endpoint. Paid usage starts beyond the free allowance. |

Validation:

- `node --test tests/*.test.cjs`
- `tests/browser.cjs` uses Playwright with Chromium and mocked Firebase/Gemini services. External network requests are blocked. It exercises mobile navigation, mobile editor collapse and desktop expansion, search and path normalization, mobile AI/chat controls, shared quota behavior, emoji insertion, file sending, profiles, history images, ban counts, 3-minute playtime throttling/batching, idle-frame cutoff, and replay-safe playtime writes. Shared viewer checks cover image preview and a real browser download. It never reads or writes production Firebase data.
- JavaScript syntax checks cover each changed standalone file and inline script.

To rerun the browser checks, install Playwright outside the repo and run a local server in the repo root:

```bash
npm install --prefix /tmp/kw-browser playwright --no-package-lock --no-audit --no-fund
python3 -m http.server 8765 --bind 127.0.0.1
# In another terminal:
NODE_PATH=/tmp/kw-browser/node_modules node tests/browser.cjs
```

The browser script defaults to `/usr/bin/chromium`; set `CHROMIUM_PATH` for another installed Chromium binary. Live API behavior and production rule compatibility still need verification with an authorized account.

Online SWF integration check (only local assets and unpkg.com are allowed; no Firebase):

```bash
NODE_PATH=/tmp/kw-browser/node_modules node tests/swf-browser.cjs
```

Cloudinary credits are a shared usage allowance. One credit covers 1 GB of stored assets, 1 GB of image delivery, or 1,000 standard image transformations. Those costs add together: 2 GB stored + 10 GB delivered + 3,000 transformations = 15 credits. Storage reflects current stored assets; delivery and transformations use a rolling 30-day window on the Free plan. See [Cloudinary's credit rules](https://cloudinary.com/documentation/billing_and_plans#credits_free_plan_and_self_service_paid_plans).

Cloudinary was recommended for its ready-made uploads, resizing, optimization, and image CDN. For a cost-focused site primarily storing and serving files, R2 is a stronger fit: 10 GB-month of free Standard storage and free direct egress, with operations metered separately. Authenticated uploads need a Worker or signing endpoint; image transformations are a separate feature/service. No hosting provider has been configured.

Shared application JavaScript files now live in `js/`. HTML script URLs and test references use that directory. Game/vendor assets retain their own directories; the separate Backup app lives in `tools/Backup/`. The root `zip-sw.js` is a one-line bootstrap for `js/zip-sw.js`, preserving root service-worker scope and existing ZIP runtime/save URLs on static hosts.

Playtime visibility: player totals, game totals, and drilldowns exclude records whose `lastPlayedAt` is at least 14 days old. Missing/invalid dates are also hidden. Filtering is display-only; records and cumulative totals remain stored. A newly played game makes that user/game record visible again with its stored cumulative total; the current schema does not contain individual dated sessions for a rolling 14-day total. Age is rechecked locally when rendering, once per minute, and when returning to the page, without extra Firebase reads or writes.
