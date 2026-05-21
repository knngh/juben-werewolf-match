# Game Buddy Match Plan

## Goal

Turn this app into a tabletop social game buddy matching product. Keep the existing Taste-style profile, discovery, likes, and mutual matches. Add the missing "find a table" workflow so users can create a game session, browse open sessions, request to join, and manage their own sessions.

Primary categories include:

- 剧本杀
- 狼人杀
- 血染钟楼
- 桌游
- 跑团
- 其他线下桌游/聚会游戏

Explicitly out of scope:

- 麻将
- 德州扑克
- 象棋/围棋/扑克等棋牌类游戏

Out of scope for this direction:

- Physical shop onboarding
- Merchant dashboards
- Payments and refunds
- Store inventory or scheduling

## Product Direction

The app should answer four user questions:

1. Who can I play with?
2. Which games are open near me / at my time?
3. Can I quickly start a table and fill missing seats?
4. After matching or joining, how do I contact the right people?

## Architecture Decisions

- Keep the current single-repo structure: `backend/` Express API and `frontend/` Vue app.
- Keep SQLite for now. It is enough for MVP and easy to deploy.
- Add session data in the backend instead of reviving the old merchant/shop model.
- Use neutral naming: API and database use `sessions` and `gameType`, not script-only names.
- Use direct contact reveal only after mutual match or approved join request.
- Keep API responses in the current `{ code, data, message }` shape.
- Keep map provider keys on the backend. Frontend uses app APIs such as `/api/geo/search` instead of calling Tianditu directly.

## Phase 1: Core Game Sessions

### Task 1: Add Session Schema and API

Description: Add backend support for user-created game sessions across script murder, werewolf, blood on the clocktower, board games, tabletop RPGs, and other offline tabletop party games.

Acceptance criteria:

- Users can create a session with game type, title, city, area/address, optional coordinates, date/time, min/max players, current players, tags, notes, and contact preference.
- Session fields are generic enough for roleplay games, social deduction games, and offline tabletop party games.
- Users can list open sessions with basic filters.
- Users can view one session detail.
- Creator can close or cancel their own session.

Verification:

- Manual API smoke test for create/list/detail/update status.
- Backend starts with a fresh SQLite database.

Dependencies: None

Files likely touched:

- `backend/db.js`
- `backend/server.js`

Estimated scope: Medium

### Task 2: Add Join Requests

Description: Let users request to join a session and let creators approve or reject requests.

Acceptance criteria:

- Logged-in user can request to join an open session.
- Creator can see pending requests.
- Creator can approve or reject a request.
- Approved user can see creator contact info and session contact instructions.
- Users cannot request their own session or duplicate a request.

Verification:

- Manual API smoke test with two users.
- Edge cases return clear `400/403/404` messages.

Dependencies: Task 1

Files likely touched:

- `backend/db.js`
- `backend/server.js`

Estimated scope: Medium

## Phase 2: Frontend Session Workflow

### Task 3: Add Session List and Navigation

Description: Add a "找局" page and route that lists open sessions.

Acceptance criteria:

- Bottom nav includes `找局`, `发现`, `匹配`, `我的`.
- Session list shows title, type, city/address, time, seat status, tags, and creator.
- Empty and loading states are present.

Verification:

- `npm run build` in `frontend/`.
- Manual browser check for navigation.

Dependencies: Task 1

Files likely touched:

- `frontend/src/App.vue`
- `frontend/src/router/index.js`
- `frontend/src/api.js`
- `frontend/src/views/Sessions.vue`

Estimated scope: Medium

### Task 4: Add Create Session Page

Description: Add a form to publish a session.

Acceptance criteria:

- User can create a session from the frontend.
- Form validates required fields before submit.
- Success redirects to session detail or my sessions.

Verification:

- `npm run build` in `frontend/`.
- Manual create-session flow.

Dependencies: Task 1

Files likely touched:

- `frontend/src/router/index.js`
- `frontend/src/views/CreateSession.vue`

Estimated scope: Medium

### Task 5: Add Session Detail and Join Flow

Description: Add detail page for a session and request-to-join action.

Acceptance criteria:

- Detail shows full session info.
- Non-creator can request to join.
- Creator sees pending requests and can approve/reject.
- Approved members see contact instructions.

Verification:

- Manual two-user flow.
- `npm run build` in `frontend/`.

Dependencies: Tasks 1 and 2

Files likely touched:

- `frontend/src/router/index.js`
- `frontend/src/views/SessionDetail.vue`
- `frontend/src/views/MySessions.vue`

Estimated scope: Medium

## Phase 3: Matching Quality

### Task 6: Improve Profile Fields

Description: Add fields that matter for table matching across different game categories.

Acceptance criteria:

- Profile supports availability, budget range, preferred player count, offline/online preference, and category preference.
- Discover/session recommendation can use these fields.

Verification:

- Profile save/load works after schema migration.
- Existing users still load with defaults.

Dependencies: Phase 1

Files likely touched:

- `backend/db.js`
- `backend/server.js`
- `frontend/src/views/Profile.vue`
- `frontend/src/views/Discover.vue`

Estimated scope: Medium

### Task 7: Better Recommendation Ranking

Description: Rank people and sessions using shared preferences, city, time, and play style.

Acceptance criteria:

- Discover users are ranked by multiple weighted factors.
- Open sessions are ranked by user profile fit.
- API still returns explainable tags such as "同城", "同风格", "时间匹配".

Verification:

- Manual API checks with seeded users/sessions.

Dependencies: Task 6

Files likely touched:

- `backend/server.js`
- `frontend/src/views/Discover.vue`
- `frontend/src/views/Sessions.vue`

Estimated scope: Medium

## Checkpoints

### Checkpoint A: Backend Foundation

- [x] Task 1 and Task 2 complete.
- [x] Backend starts cleanly.
- [x] API smoke tests pass via `npm run smoke:sessions`.

### Checkpoint B: Usable Product Flow

- [x] Task 3, Task 4, and Task 5 complete.
- [x] A user can publish a session.
- [x] Another user can request to join.
- [x] Creator can approve.
- [x] Contact info is visible after approval.

### Checkpoint C: Matching Quality

- [x] Task 6 complete for availability, budget range, preferred player count, and online/offline preference.
- [x] Task 7 first pass complete for profile and session ranking.
- [x] Recommendations return explainable reasons such as `同城`, `常玩类型`, `时间匹配`, and `预算匹配`.
- [x] Build passes.

## Current Implementation Notes

- `profiles` now stores availability, budget range, preferred player count, and play modes.
- `game_sessions` now stores budget range and play mode, so sessions can be ranked against user preferences.
- Discover now keeps users who liked me visible until I like them back, allowing mutual matches to form.
- Session smoke covers extended profile save/load, ranked sessions, join request approval, cancelled-session approval blocking, and mutual match creation.
- Session list now supports practical filters for date range, remaining seats, play mode, budget, and "only matched".
- Pending join requests can be withdrawn by the applicant; withdrawn/rejected requests can be sent again while the session is open.
- My sessions now exposes request IDs, request messages, and approved contact info for applicant-side management.
- Creators can edit their own sessions after publishing, including time, seats, budget, tags, notes, and contact instructions.
- Editing is permission-checked server-side; non-creators cannot update a session.
- Tianditu place search is available through authenticated backend endpoint `GET /api/geo/search`; session create/edit can store address and coordinates.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Current app has no automated tests | Medium | Add focused smoke scripts after backend session APIs stabilize |
| SQLite schema changes can break existing local data | Medium | Use `CREATE TABLE IF NOT EXISTS` and nullable/default fields |
| Contact privacy | High | Reveal contact only after mutual match or approved join |
| Scope creep toward merchant features | High | Keep all table/session fields user-created and shop-free |

## First Implementation Slice

Start with Task 1 and Task 2 together on the backend, because frontend pages need stable API contracts first.

Proposed first endpoints:

- `POST /api/sessions`
- `GET /api/sessions`
- `GET /api/sessions/:id`
- `PATCH /api/sessions/:id/status`
- `POST /api/sessions/:id/requests`
- `GET /api/sessions/:id/requests`
- `PATCH /api/session-requests/:id`
