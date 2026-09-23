# LovePager — Web Platform State Summary
  *Combine with gadget firmware summary, then give both to a new planning 
  session.*

  ---

  ## What the system is

  LovePager is a couples paging system. A person types a short text note in a
  web UI;
  it is delivered to their partner's physical pager devices (ESP32 + e-ink
  gadgets).
  The web platform handles user accounts, partner linking, device registration,
  note
  storage, and delivery tracking. The gadget polls the API and renders notes.

  The product is **couple-centric**: each user sets one partner. The dashboard
  shows only
  notes to that partner. Sending to arbitrary users is still possible via the
  full Notes
  page, but the primary UX is the partner quick-send.

  ---

  ## 1. Tech Stack

  ### Backend (`web/backend/`)
  | Layer | Technology |
  |---|---|
  | Framework | FastAPI (Python) |
  | ORM / schemas | SQLModel + Pydantic |
  | Database | PostgreSQL |
  | Migrations | Alembic |
  | Auth (users) | JWT HS256, 8-day expiry |
  | Auth (devices) | Opaque bearer token, non-expiring, SHA-256 hash stored |
  | Config | pydantic-settings, `.env` at `web/` |
  | Dev server | `fastapi dev app/main.py` from `web/backend/` |
  | Test runner | pytest in `web/backend/tests/` |
  | Python env | uv venv at `web/.venv/` — always use `uv run` |

  ### Frontend (`web/frontend/`)
  | Layer | Technology |
  |---|---|
  | Framework | React + TypeScript |
  | Build | Vite |
  | Routing | TanStack Router (file-based, `src/routes/`) |
  | Data fetching | TanStack Query — notes queries have `refetchInterval:
  30_000` |
  | UI components | shadcn/ui + Tailwind CSS |
  | API client | Auto-generated (`@hey-api/openapi-ts`) at `src/client/` |
  | Forms | react-hook-form + zod |
  | QR generation | qrcode.react |
  | Package manager | Bun |
  | Regen client | `scripts/generate-client.sh` (needs backend running) |

  ### PWA
  - `public/manifest.json`: name "LovePager", `display: standalone`,
  `theme_color: #ec4899`
  - `public/sw.js`: network-first service worker
  - `index.html`: manifest link, SW registration, Apple meta tags

  ---

  ## 2. Domain Model (`web/backend/app/models.py`)

  All IDs are UUIDs. All timestamps are timezone-aware
  (`DateTime(timezone=True)`).

  ### `User`
  | Column | Type | Notes |
  |---|---|---|
  | `id` | UUID PK | |
  | `email` | str unique | Login + search |
  | `full_name` | str nullable | Display name, not unique |
  | `is_active` / `is_superuser` | bool | |
  | `hashed_password` | str | Argon2 |
  | `partner_id` | UUID FK→user nullable | `ON DELETE SET NULL`. Not mutual.
  Self-partner allowed. |
  | `created_at` | datetime | |

  ### `Device`
  | Column | Type | Notes |
  |---|---|---|
  | `id` | UUID PK | |
  | `owner_id` | UUID FK→user CASCADE | |
  | `name` | str | Human label |
  | `token_hash` | str unique | SHA-256 hex of bearer token |
  | `status` | str | `pending` / `active` |
  | `last_seen_at` | datetime nullable | Stamped on every gadget API call |

  ### `Note`
  | Column | Type | Notes |
  |---|---|---|
  | `id` | UUID PK | |
  | `sender_id` | UUID FK→user CASCADE | |
  | `recipient_id` | UUID FK→user CASCADE | |
  | `text` | str | 1–1000 chars. **Text only — no media type, no audio field.**
  |
  | `min_retention` | Interval | Min display time. Default: 1 hour |
  | `max_retention` | Interval nullable | Auto-expire. NULL = never |

  Retentions stored as Postgres `INTERVAL`. API exposes them as **integer 
  seconds**.
  Frontend sends ISO-8601 durations on create (e.g. `"PT3600S"`).

  ### `NoteDelivery`
  | Column | Type | Notes |
  |---|---|---|
  | `id` | UUID PK | |
  | `note_id` | UUID FK→note CASCADE | |
  | `device_id` | UUID FK→device CASCADE | |
  | `received` | bool | Default false |
  | `received_at` | datetime nullable | |

  **Fan-out:** at note creation, one `NoteDelivery` per active device of the
  recipient.
  Zero deliveries is valid. Self-paging (sender == recipient) allowed.

  ---

  ## 3. Authentication

  ### User auth — JWT
  - `POST /api/v1/login/access-token` (OAuth2 password form) → `{access_token,
  token_type}`
  - `Authorization: Bearer <jwt>` on all user-facing calls.
  - Invalid JWT subject → 401 (frontend clears token, redirects to login).
  - Inactive user → 403. Dependency: `CurrentUser` in `api/deps.py`.

  ### Device auth — opaque bearer token
  - `secrets.token_urlsafe(32)`, non-expiring. **Only SHA-256 hash stored.**
  - Raw token shown once in registration QR / manual credentials; never
  retrievable again.
  - `Authorization: Bearer <device_token>` from gadget. Invalid → 401.
  - Dependency: `CurrentDevice` in `api/deps.py`.

  ---

  ## 4. API Contract

  Base: `{DEVICE_API_URL}/api/v1`  (e.g. `http://192.168.178.199:8000/api/v1`)

  ### Device-facing (device bearer auth) — `api/routes/device_api.py`

  POST /api/v1/device/register
    → { device: DevicePublic, server_time: datetime }
    Sets status=active, stamps last_seen_at.

  GET  /api/v1/device/notes/next
    → DeviceNotePublic | null  (HTTP 200 in both cases)
    {
      delivery_id, note_id, text,
      min_retention_seconds: int,
      max_retention_seconds: int | null,
      created_at, queue_remaining: int,
      server_time: datetime
    }

  POST /api/v1/device/notes/{delivery_id}/received
    → { message: "Marked as received" }

  All device responses include `server_time` for gadget clock sync.

  ### User-facing device management (JWT) — `api/routes/devices.py`
  POST   /api/v1/devices/     { name }  → DeviceRegistrationInfo (one-time for
  QR)
  GET    /api/v1/devices/               → DevicesPublic
  PATCH  /api/v1/devices/{id}           → DevicePublic
  DELETE /api/v1/devices/{id}           → Message

  `DeviceRegistrationInfo` (QR payload):
  ```json
  { "api_url": "http://host:8000/api/v1", "device_id": "...", "token": "<raw>",
  "name": "..." }

  Notes (JWT) — api/routes/notes.py

  POST /api/v1/notes/     { recipient_id, text, min_retention?, max_retention? }
  GET  /api/v1/notes/     → NotesPublic  (sent, skip/limit)
  GET  /api/v1/notes/inbox → NotesPublic (received)
  GET  /api/v1/notes/{id} → NoteDetailPublic  (includes deliveries[])

  User (JWT) — api/routes/users.py

  GET   /api/v1/users/me           → UserPublic (includes partner_id)
  PATCH /api/v1/users/me           { full_name?, email?, partner_id? }
  GET   /api/v1/users/search?q=    → UsersSearchPublic  (ILIKE name+email,
  includes self)

  ---
  5. Registration Flow (gadget has NO camera)

  Three QR codes, smartphone scans all:

  1. QR #1 (Wi-Fi join): gadget SoftAP + captive portal; displays QR on e-ink.
  Phone scans → joins AP → enters home Wi-Fi credentials → gadget connects.
  2. QR #2 (gadget IP): gadget shows its local IP. Phone scans → opens
  gadget-hosted
  JS QR-scanner page in phone browser (uses phone camera).
  3. QR #3 (credentials): user on desktop: Devices → Add Device → names gadget →
  web renders DeviceRegistrationInfo as QR. Phone (running scanner from step 2)
  scans QR #3 off desktop screen → POSTs credentials to gadget → gadget calls
  POST /device/register → device becomes active.

  ---
  6. Frontend Structure

  src/routes/_layout/
    index.tsx        Dashboard — partner quick-send + recent notes
    notes.tsx        Full sent-notes table + ComposeNote dialog
    devices.tsx      Device list + AddDevice (2-step: name → QR)
    settings.tsx     Tabs: My profile / Partner / Password / Danger zone

  src/components/
    Common/Logo.tsx            Text "LovePager" + pink Heart icon (no image
  files)
    Devices/DeviceQr.tsx       QR + collapsible copyable JSON credentials panel
    Notes/ComposeNote.tsx      Props: fixedRecipient?, defaultText?,
  triggerLabel?
    Notes/RecipientPicker.tsx  Debounced user search input+dropdown (reused by
  PartnerSettings)
    Notes/DeliveryStatus.tsx   Per-device received status dialog
    UserSettings/PartnerSettings.tsx  Partner search/set/change/remove (calls
  PATCH /users/me)

  src/client/                  Auto-generated — only types.gen.ts was
  hand-edited
    types.gen.ts               partner_id added to UserPublic + UserUpdateMe
  manually

  Dashboard behavior

  - Partner set: inline textarea → Send (1h min retention, no max, recipient =
  partner).
  Below: last 5 notes to partner — relative time, received badge (n/m), ↺ Resend
  (pre-fills textarea). Notes query refetchInterval: 30_000.
  - No partner: empty-state card → Settings → Partner tab.

  ---
  7. Alembic Migrations

  ┌──────────────┬──────────────────────────────────────────────────────┐
  │   Revision   │                     Description                      │
  ├──────────────┼──────────────────────────────────────────────────────┤
  │ e2412789c190 │ Initialize User + Item                               │
  ├──────────────┼──────────────────────────────────────────────────────┤
  │ fe56fa70289e │ Add created_at                                       │
  ├──────────────┼──────────────────────────────────────────────────────┤
  │ 9c0a54914c78 │ Max-length constraints                               │
  ├──────────────┼──────────────────────────────────────────────────────┤
  │ d98dd8ec85a3 │ Integer IDs → UUIDs                                  │
  ├──────────────┼──────────────────────────────────────────────────────┤
  │ 1a31ce608336 │ Cascade deletes                                      │
  ├──────────────┼──────────────────────────────────────────────────────┤
  │ a1b2c3d4e5f6 │ Add Device, Note, NoteDelivery                       │
  ├──────────────┼──────────────────────────────────────────────────────┤
  │ c3d4e5f6a1b2 │ Add partner_id to User (FK self, ON DELETE SET NULL) │
  └──────────────┴──────────────────────────────────────────────────────┘

  Apply: cd web/backend && uv run alembic upgrade head

  ---
  8. Environment

  web/.env (key vars):
  DEVICE_API_URL=http://192.168.178.199:8000  # embedded in QR #3 as api_url
                                               # QEMU: use http://10.0.2.2:8000
  SECRET_KEY=...
  DATABASE_URL=postgresql://postgres:...@localhost:5432/app

  ---
  9. Current Note Model — Text Only (Critical Constraint)

  Notes are text-only. Note.text is the only content field (max 1000 chars).
  There
  is no media_type, no audio blob, no attachment. The gadget poll response
  (DeviceNotePublic) has only text. This is what needs to change for audio
  notes.

  ---
  10. Outstanding Items

  - Items demo not removed. Template Item model/CRUD/routes/frontend still
  present
  but hidden from sidebar. Safe to delete whenever.
  - No inbox UI. GET /notes/inbox exists on backend, no frontend route.
  - No push / real-time. Gadget polls only; no WebSocket or SSE.
  - TLS not implemented. Production will need HTTPS; gadget needs CA bundle for
  esp_http_client.
  - Partner unilateral. No mutual confirmation flow (by design).
  - After any backend model/route change: run scripts/generate-client.sh to keep
  src/client/ in sync. In a sandboxed environment, hand-edit types.gen.ts only.

  ---
  11. Planned Extension: Audio Notes

  Goal

  Extend notes to support voice recordings: captured on the gadget or in the
  browser,
  uploaded to the backend, delivered and played back on the recipient's gadget.

  Key design questions the planning session must answer

  1. Audio storage: Postgres LargeBinary/bytea (simple, self-contained) vs.
  object storage (S3/MinIO/local filesystem)? For a small self-hosted setup,
  bytea is
  fine; for scale, object storage is better.
  2. Encoding format: raw WAV (simple, 16-bit PCM, large) vs. Opus/OGG
  (compressed,
  requires encoder/decoder on gadget)? Gadget has limited flash; Opus is ~40 KB
  codec.
  3. Max duration / size limit.
  4. Browser recording: Web UI records via MediaRecorder API? Only gadget can
  initiate audio? Both?
  5. Backward compatibility: old gadget firmware sees media_type: "audio" — skip
  and mark received? Show "Voice note — please update firmware"?

  What needs to change — web backend

  - Note needs a media_type: str discriminator ("text" | "audio").
  - Audio storage: add audio_data: bytes | None (bytea) or audio_key: str | None
  (object store reference).
  - NoteCreate / upload endpoint must accept audio (multipart or separate
  endpoint).
  - DeviceNotePublic (poll response) must gain media_type and audio_url fields —
  these must be optional/nullable so existing gadget firmware still works.
  - New endpoint: GET /api/v1/device/notes/{note_id}/audio → streams audio
  bytes.
  - Existing text field should remain (nullable for audio notes, or kept as
  empty string
  for backward compat — decide in planning).

  What needs to change — web frontend

  - Dashboard quick-send card and ComposeNote need a toggle: text vs. voice
  recording.
  - Voice capture: MediaRecorder API, record button + timer, playback preview
  before send.
  - Upload: multipart POST.
  - Note history: audio notes show a play button instead of truncated text.

  What needs to change — gadget firmware (for gadget planning session)

  - Capture: ES8311 codec (I2S) already wired. Record from MEMS mic, encode
  (WAV simplest), upload via esp_http_client chunked POST.
  - Playback: fetch audio from audio_url, decode, feed to ES8311 via I2S DMA.
  - RAM: ESP32-S3 has 512 KB internal + 8 MB PSRAM. Audio must be streamed or
  chunked — do not buffer full clip in heap.
  - Poll loop unchanged in structure — just needs to handle the new media_type
  field and fetch audio separately.

  ---

  That covers everything the new session needs. The key points to emphasise when
  handing it over:

  1. The **only content field on a Note right now is `text`** — that's the whole
  scope of the extension.
  2. The **`DeviceNotePublic` poll response is the contract** between web and
  gadget; any new fields must be additive/nullable for backward compat.
  3. The **gadget has 8 MB PSRAM** so audio is feasible but must be streamed,
  not buffered.
  4. The **design questions in §11** (storage backend, codec, browser vs gadget
  only) are the blockers that must be decided before any implementation is
  planned.
