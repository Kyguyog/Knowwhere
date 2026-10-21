# fsbak

A self-hosted Firestore backup dashboard, built for Docker. Everything for this service lives in `Backup/`; it runs independently of the main website.

- Configure a Firestore service-account key in the web UI.
- Schedule a backup every N minutes, hours, or days, or back up immediately.
- Keep 1–1,000 backups (default 100), automatically removing the oldest copies.
- Download backups and restore a selected copy to the same project/database.
- Browse the database tree and exclude whole collections or individual documents, including their descendants. Excluded branches are skipped by default, with optional overrides for individual manual backups and restores.
- Every restore first takes and verifies a fresh safety backup. Failed or interrupted restores protect recovery files and pause scheduled jobs.
- Settings, credentials, schedules, and backup files survive container restarts in a named Docker volume.

## Start with Docker Compose

From the repository root:

```sh
cd Backup
cp .env.example .env
```

Edit `.env` and set `ADMIN_PASSWORD` to a unique password of at least 8 characters. Then:

```sh
docker compose up -d --build
```

Open **http://localhost:8080** and sign in with `admin` (or `ADMIN_USER`) and your password. Change the host port with `PORT` in `.env`.

The default image tag is `kyguy2/fsbak:latest`; `--build` builds it locally. After publishing the image, a different machine can use these files with:

```sh
docker compose pull
docker compose up -d --no-build
```

Compose binds to localhost by default. The login page uses an HttpOnly, SameSite session cookie valid for 12 hours; restarting the container requires signing in again. Incorrect credentials show an inline error without browser password popups. Basic authentication remains supported for API clients, without issuing browser challenges. For remote access, place the service behind an HTTPS reverse proxy that preserves the Host header and sets `X-Forwarded-Proto: https`, or use an SSH tunnel. To deliberately expose the service on your network, change the port mapping in `compose.yaml` and secure the connection appropriately.

## Connect Firestore

1. In the Firebase Console, open **Project settings → Service accounts → Generate new private key**. This is a server service-account JSON key, not the browser `firebaseConfig` object with `apiKey` and `authDomain`. See [Firebase's server setup documentation](https://firebase.google.com/docs/admin/setup).
2. Grant that service account **Cloud Datastore User** (`roles/datastore.user`) on the target project, or an equivalent custom role allowing document reads/writes/deletes and collection listing. See [Firestore IAM roles](https://cloud.google.com/firestore/native/docs/security/iam).
3. Paste or load the JSON file in the UI. The project ID defaults to the key's project. Enter a different target project only if that account has permission there. Database ID defaults to `(default)`; named databases are supported.
4. Set the interval and retention, and click **Test connection & save**. This checks collection-list access; a complete backup/restore still requires the read/write permissions above.
5. Click **Back up now** for the first copy, or wait for the schedule.

Credentials are encrypted with AES-256-GCM in the data volume and never returned by the API. The encryption key is also in that volume; protect access to the whole volume. Backup documents are stored as plain NDJSON with file permissions restricting access. Encrypt the host disk if required.

## Schedule and retention

The default schedule is every 1 day, with 100 backups retained. Set any positive whole-number interval in minutes, hours, or days (up to 365,000 units). Schedules run inside the Node process in the container, without a browser or host cron job. The scheduler checks every 10 seconds.

After any completed or failed job, the next run is the configured interval after the job finishes. Changing the interval, database, or enabled state resets the due time. Other settings preserve it. Restarting preserves the due time; if overdue, one catch-up backup runs, rather than one per missed interval. Scheduling runs only while the container and host are running.

Retention counts all completed manual, scheduled, and safety backups across connections in this volume. Lowering retention applies immediately when settings are saved. Changing projects does not migrate or overwrite old copies, but the global retention policy still applies. Restore buttons are available only for copies matching the current project and database.

During a restore, its source and safety copies are protected from retention. On success, normal retention resumes, keeping the newest safety backup even when retention is 1. After a failed or interrupted restore, protected files can temporarily exceed the configured retention limit, and scheduling pauses. Restore a protected backup to recover, or inspect the database and explicitly acknowledge recovery in the UI to release protection and resume scheduling.

## Database tree and exclusions

After connecting, click **Load tree**. Use the arrow beside a collection to see its documents, and the arrow beside a document to see its subcollections. Branches load on demand in pages of 100; **Load more** fetches the next page. The browser receives names, paths, and node types, not document fields. Missing parent documents are shown so their subcollections remain selectable. Browsing performs Firestore reads.

Check a collection or document to **ignore its entire branch by default**, then click **Save exclusions**. For example, selecting `Playtime` skips all of `Playtime`; selecting `users/alex` skips that document and its subcollections. Matching uses full, case-sensitive path segments: `Playtime` does not exclude `Playtime2`. A checked parent covers all descendants. Uncheck the parent to choose individual descendants instead. You can remove saved paths from the **Ignored paths** list even if they no longer exist in the database. Exclusions are per connected project/database, persist across restarts, and cannot change during a backup or restore. Unsaved selections must be saved or discarded before starting a manual backup or restore.

Clicking **Back up now** opens a popup asking whether to include excluded data. **Keep exclusions** uses your saved exclusions; **Include excluded data** takes a full copy for this one run. Neither choice changes your saved settings. Scheduled backups always honor saved exclusions.

The restore popup asks whether to **restore excluded collections and documents too, when present in this backup**. This is unchecked by default. Leaving it unchecked preserves current exclusions; checking it includes those branches when they are available in the selected copy. Each backup records the paths it actually omitted in its header and metadata. **Recorded omissions always remain untouched**, even when you choose to include excluded data: a partial backup cannot restore data it never captured, and restoring it must not delete that live data. The pre-restore safety backup covers every branch that the chosen restore can change. Saved exclusions stay unchanged after either choice.

By default, restores therefore use the union of current exclusions and that backup's recorded exclusions. With the one-run override, only the backup's recorded omissions remain excluded. Existing backups without exclusions remain compatible. Excluding a branch does not remove its data from previously created backups.

## What a backup contains

All readable, non-excluded documents in the configured **Firestore Native mode** database, including nested subcollections and documents beneath missing/deleted parent documents. Empty documents are included. Pagination and streamed files keep the full database out of application memory. Firestore REST Value objects preserve 64-bit integers, nanosecond timestamps, references, bytes, GeoPoints, arrays, maps, nulls, and special floating-point values. See [the document-list API](https://cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/list).

Subcollection discovery runs with up to 8 concurrent requests, and local writes are buffered in 256 KiB chunks. This reduces network waiting without skipping subcollections or changing backup format. Set `BACKUP_CONCURRENCY` in `.env` to a whole number from 1 to 32 and recreate the container to tune it; default 8 is a conservative starting point. Higher concurrency increases the request rate, not the number of documents or subcollections read. Firestore throttling and network latency still affect speed. Traversal maintains bounded page buffers and the same document order as the original sequential traversal.

This is a document backup, not a managed Firestore export. It does not include indexes, security rules, IAM, TTL policies, database settings, Firebase Authentication users, Cloud Storage, other databases in the same project, or original document create/update times. Backups can be downloaded as fsbak NDJSON; this format is not a `gcloud firestore import` archive. The UI restores copies stored in its volume; it does not accept arbitrary uploaded archives.

## Restore behavior

The UI requires typing the target `project-id/database-id` before a restore. The server then:

1. Validates the chosen backup's identity, complete footer, document count, and SHA-256 checksum.
2. Writes and verifies a complete immediate backup of the current database. If this fails, no database writes occur.
3. Deletes current included documents using that completed safety manifest.
4. Recreates the chosen backup's included documents using full-document writes in bounded batches. Current exclusions remain untouched unless explicitly included for this restore. Branches omitted from the selected backup always remain untouched.

**Pause all other database writers before backup and restore.** Collection traversal is not a transactionally consistent snapshot: writes during a backup can produce a mixed-time view. A restore is not atomic across the entire database, and concurrent writes can survive deletion or be overwritten. For transactional snapshot requirements, use Google's managed export/PITR facilities instead. Restores can trigger Cloud Functions, extensions, and TTL policies; account for those writers as well. Reads, deletes, and writes incur standard Firestore charges.

If a restore fails partway, the UI reports it and retains the source and safety copies. Use the safety backup to recover the pre-restore contents. Container shutdown allows up to 5 minutes for an active job; if forcibly stopped, restart recovery flags interrupted jobs. Never run multiple instances against the same data volume, and do not modify backup files while a job runs.

## Docker Hub publishing

The short image name is **`kyguy2/fsbak`**. With Docker running and this account authorized:

```sh
docker login --username kyguy2
./scripts/push.sh
```

The script installs locked dependencies, runs syntax checks and tests, builds the current platform's image, and pushes `kyguy2/fsbak:latest`. To choose a version tag:

```sh
./scripts/push.sh kyguy2 1.0.0
```

For a multi-platform image, after tests pass and a buildx builder is available:

```sh
docker buildx build --platform linux/amd64,linux/arm64 \
  -t kyguy2/fsbak:latest --push .
```

No credentials, `.env`, local data, or `node_modules` enter the image build context. The container runs as a non-root user, with a read-only application filesystem, a writable data volume, and an HTTP health check.

## Operations and local development

```sh
docker compose logs -f
docker compose down
```

`docker compose down` preserves the data volume. **`docker compose down -v` deletes credentials, encryption key, schedules, and all backups.** Copy the entire volume to separate storage for host/disk failure recovery; backups on the same disk do not protect against losing that disk.

To run without Docker, use Node.js 22 or newer:

```sh
npm ci
npm run check
npm test
npm run benchmark
ADMIN_PASSWORD='replace-with-a-long-password' npm start
```

Environment variables: `ADMIN_USER` (default `admin`), required `ADMIN_PASSWORD`, `PORT` (default `8080`), `BACKUP_CONCURRENCY` (default `8`, range `1–32`), and `DATA_DIR` (default `./data`, `/data` in Docker). Keep `DATA_DIR` outside any public web root. The server listens on all interfaces; Compose restricts the published port to localhost.

Tests use temporary storage and a simulated Firestore service; they cover typed values, missing parents, pagination, batching, scheduling, restart recovery, authentication, checksums, safety failures, and retention. They do not modify a live Firestore database.

`npm run benchmark` compares sequential and parallel discovery with simulated network latency and verifies identical documents and order. It never contacts Firestore. Its speedup is a synthetic measurement; actual times depend on database layout, latency, and throttling.
