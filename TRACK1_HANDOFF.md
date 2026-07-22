# Fluke Game Audit — Track 1 Handoff

## Purpose

This document is the handoff for the next coding model. Track 1 of the Fluke Game Audit Megaplan has been implemented, deployed to Render, and verified live. Do not begin Track 2 until the user explicitly confirms that they want to proceed.

## Repository

- **Local project:** `C:\Users\yga-adm\CascadeProjects\windsurf-project`
- **Git remote:** `https://github.com/metadetroit/what-if-game.git`
- **Branch:** `main`
- **Verified commit:** `9e567a7` — `security: fail closed admin auth and CORS`
- **Production URL:** `https://what-if-game-v2.onrender.com`

The local branch is aligned with `origin/main` at the verified commit. At the time of handoff, the working tree also contains unrelated user files/changes:

- Modified/deleted generated frontend assets under `frontend/dist/`
- Untracked `SURVEY_LAUNCH.md`
- Untracked `fluke-feedback-survey.html`

Do not revert, delete, or commit those unrelated files without the user's direction.

## User Objective

The user wanted Track 1 implemented and verified before any broader audit:

1. Remove embedded admin credentials and make admin authorization fail closed.
2. Replace wildcard CORS with an explicit production allowlist shared by Express and Socket.IO.
3. Reconcile Render deployment configuration.
4. Verify the live allowed-origin Socket.IO handshake succeeds.
5. Verify unlisted origins are rejected.
6. Verify admin requests fail closed.
7. Preserve unrelated frontend UI/accessibility test failures during Track 1.

## Track 1 Changes Already Implemented

### Backend

`backend/server.js` now:

- Reads admin authorization from the runtime `ADMIN_KEY` environment variable only.
- Returns `503` with `admin_unconfigured` when `ADMIN_KEY` is absent.
- Returns `403` for missing/mismatched keys when `ADMIN_KEY` is configured.
- Uses an exact-match comma-separated `CORS_ORIGIN` allowlist.
- Shares the same CORS origin callback with Express and Socket.IO.
- Emits startup warnings when `CORS_ORIGIN` or `ADMIN_KEY` is missing.
- Keeps non-admin game functionality available when admin is unconfigured.

Important implementation behavior:

- Requests without an `Origin` header are allowed.
- The exact production origin is allowed only when it appears in `CORS_ORIGIN`.
- Express rejects an unlisted HTTP origin through the current CORS middleware and returns `500` without an allow-origin header.
- Socket.IO rejects an unlisted origin with `400 Bad Request`.

### Backend Tests

`backend/security.test.js` covers:

- Missing `ADMIN_KEY` fails closed with `503/admin_unconfigured`.
- Wrong admin key is rejected.
- Correct admin key is accepted.
- Normal game functionality remains available without `ADMIN_KEY`.
- Express allowed/rejected CORS behavior.
- Socket.IO polling and WebSocket allowed/rejected origin behavior.
- Test reconnect timers are cleaned up.

### Frontend

`frontend/src/App.jsx` and `frontend/src/components/UncutBestOfView.jsx` now:

- Distinguish `503 admin_unconfigured` from `403` invalid authorization.
- Clear stale admin keys from `sessionStorage` after authorization failures.
- Preserve optimistic UI rollback behavior.
- Show an appropriate admin configuration/authorization notice.

### Render and Documentation

- `render-new.yaml` is the intended single-service Render Blueprint.
- The existing Render service was manually configured with the build/start commands from that manifest.
- The production build/start configuration is:

  ```text
  Build: cd frontend && npm install && npm run build && cd ../backend && npm install
  Start: cd backend && npm start
  ```

- `CORS_ORIGIN` was set in Render to:

  ```text
  https://what-if-game-v2.onrender.com
  ```

- `ADMIN_KEY` is currently NOT set in Render. This is why admin requests fail closed with `503/admin_unconfigured`.
- `render.yaml`, `render-new.yaml`, `.env.example`, `README.md`, `DEPLOY.md`, `DEPLOY-SIMPLE.md`, and `.windsurf/plans/AUDIT_PLAN.md` were updated as part of Track 1.

Do not ask the user for the admin secret. If admin controls need to be enabled, instruct the user to enter `ADMIN_KEY` directly in Render's Production Environment and redeploy.

## Live Verification Completed

All checks below were run against the live Render service after redeployment.

### Health

```powershell
curl.exe -i "https://what-if-game-v2.onrender.com/api/health"
```

Result: `200 OK`, JSON health response, service reports `what-if-game-backend`.

### Allowed HTTP Origin

```powershell
curl.exe -i -H "Origin: https://what-if-game-v2.onrender.com" "https://what-if-game-v2.onrender.com/api/health"
```

Result: `200 OK` with:

```text
access-control-allow-origin: https://what-if-game-v2.onrender.com
```

### Unlisted HTTP Origin

```powershell
curl.exe -i -H "Origin: https://example.com" "https://what-if-game-v2.onrender.com/api/health"
```

Result: `500 Internal Server Error` from the current Express CORS rejection path, with no `Access-Control-Allow-Origin` header. This is a rejected origin, not an allowed-origin failure.

### Allowed Socket.IO Polling

```powershell
curl.exe -i -H "Origin: https://what-if-game-v2.onrender.com" "https://what-if-game-v2.onrender.com/socket.io/?EIO=4&transport=polling"
```

Result: `200 OK`, Socket.IO session payload, and the production `access-control-allow-origin` header.

### Unlisted Socket.IO Polling

```powershell
curl.exe -i -H "Origin: https://example.com" "https://what-if-game-v2.onrender.com/socket.io/?EIO=4&transport=polling"
```

Result: `400 Bad Request` with `{"code":3,"message":"Bad request"}` and no allow-origin header.

### Allowed Socket.IO WebSocket Upgrade

The actual WebSocket upgrade was tested with an HTTP/1.1 upgrade request.

Result: `101 Switching Protocols` and the production `access-control-allow-origin` header. Curl later timed out because the WebSocket remained open; that timeout is expected after the successful `101` handshake.

### Unlisted Socket.IO WebSocket Upgrade

Result: `400 Bad Request` and no allow-origin header.

### Admin Without a Key

```powershell
curl.exe -i "https://what-if-game-v2.onrender.com/api/admin/pending"
```

Result:

```json
{
  "success": false,
  "error": "admin_unconfigured",
  "code": "admin_unconfigured"
}
```

HTTP status: `503 Service Unavailable`.

This verifies fail-closed admin behavior. Admin controls remain intentionally disabled until the user configures `ADMIN_KEY` in Render.

## Current Project State

### Working

- Production deployment is live.
- Frontend production build succeeds on Render.
- Backend health endpoint works.
- Normal unauthenticated game/API access is not blocked by missing admin configuration.
- Production CORS is explicit and correct.
- Allowed Socket.IO polling and WebSocket handshakes work.
- Unlisted origins are rejected.
- Admin functionality fails closed when unconfigured.

### Not Complete

- `ADMIN_KEY` is not configured, so admin moderation controls cannot currently be used.
- Full live gameplay flows were not re-tested end-to-end in this session: room creation, joining, writing, voting, tournament progression, reconnect, spectator behavior, abandonment, and database persistence.
- Track 2 full audit/remediation has not started.
- Existing unrelated frontend accessibility/UI test failures were intentionally not changed.
- Render reported dependency audit findings during build: 8 vulnerabilities in frontend dependencies and 6 in backend dependencies. Do not blindly run `npm audit fix --force`; handle as a separate audit task.

## Recommended Next Actions

### If the User Needs Admin Controls

1. Tell the user to open the Render Production Environment.
2. Add `ADMIN_KEY` with a secret value directly in Render.
3. Save and redeploy.
4. Do not request or print the secret.
5. Re-test the no-key and wrong-key cases; with a configured key they should return `403`.
6. The user can separately verify a valid key without revealing it.

### If the User Wants Track 2

Wait for an explicit confirmation such as `Proceed with Track 2`.

Then:

1. Read `.windsurf/plans/AUDIT_PLAN.md` before changing code.
2. Use the plan's priorities and preserve its existing architectural decisions.
3. Run `git status --short` first and protect the unrelated survey/dist files listed above.
4. Start with a codebase map and targeted searches; do not make broad speculative edits.
5. Run focused tests before and after each change.
6. Do not claim all bugs are fixed without testing the affected flow.
7. Keep Track 2 separate from the already verified Track 1 deployment.

## Useful Local Commands

Run from the repository root. The IDE's command tool should use the repository path as its working directory rather than embedding a `cd` command.

```powershell
npm test --prefix backend
npm test --prefix frontend
npm run build --prefix frontend
```

Backend package scripts use Node's native test runner. Frontend uses Vitest.

## Guardrails for the Next Model

- Do not embed, print, or request admin secrets.
- Do not revert the Track 1 security changes.
- Do not replace the explicit CORS allowlist with `*`.
- Do not begin Track 2 without explicit user confirmation.
- Do not modify unrelated frontend UI tests merely to make the test suite green.
- Do not delete or commit the user's unrelated survey/dist files without permission.
- Do not treat an unlisted-origin `500` from the current Express CORS middleware as proof that the allowed origin is broken; verify the allowed origin separately.
- Do not run `npm audit fix --force` without a dependency-remediation plan.
- Keep deployment changes targeted to Render; do not use a different deployment provider.
