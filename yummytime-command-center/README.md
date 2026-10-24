# YummyTime Location Command Center (local pilot)

Local web app for **Yummy Time Capsule**: every connected device on one dashboard, live status,
and an alert/automation engine (smoke, night intrusion, temperature) with phone calls + WhatsApp.

Separate from the Lovable "Franchise Hub" app.

## Stack

| Part      | Tech                                               |
|-----------|----------------------------------------------------|
| Frontend  | React + Vite + TypeScript + Tailwind (dark/light)  |
| Backend   | Node.js + TypeScript (Express), runs continuously  |
| Database  | SQLite (`data/yummytime.db`, better-sqlite3)       |
| Realtime  | WebSocket `/ws` (backend → dashboard)              |
| Secrets   | `.env` only (git-ignored)                          |

## Requirements

- Node.js 20 or newer (https://nodejs.org) — Windows or Mac

## Run

```bash
cd yummytime-command-center
npm install
cp .env.example .env        # Windows PowerShell: copy .env.example .env
npm run dev
```

- Dashboard: http://localhost:5173 (from your phone on the same Wi-Fi: `http://<PC-IP>:5173`)
- Backend API: http://localhost:4000/api/health

The database is created and seeded automatically on first start (or run `npm run db:init`).

### Other commands

| Command             | What it does                                   |
|---------------------|------------------------------------------------|
| `npm run dev`       | Backend + dashboard with live reload           |
| `npm run build`     | Production build (server → `server/dist`, web → `web/dist`) |
| `npm start`         | Run the built app: dashboard + API on port 4000 |
| `npm run db:init`   | Create/migrate the SQLite database             |
| `npm run typecheck` | TypeScript check for both parts                |

## Configuration (`.env`)

See `.env.example`. Key values:

- `MOCK_MODE=true` — mock devices only, no real API calls (default until step 4)
- `IMOU_APP_ID`, `IMOU_APP_SECRET`, `IMOU_DATA_CENTER=fk`
- `AQARA_APP_ID`, `AQARA_KEY_ID`, `AQARA_APP_KEY` — **approved "DEMO APPLICATION" project only** (pending → error 2046)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `WHATSAPP_FROM`

Credential values are never sent to the browser; `/api/health` only reports whether each is set.

## Project layout

```
yummytime-command-center/
├── .env.example
├── server/                 Node backend
│   └── src/
│       ├── index.ts        HTTP server + /api routes
│       ├── config.ts       loads .env
│       ├── ws.ts           WebSocket broadcast
│       └── db/
│           ├── schema.sql  SQLite schema
│           ├── index.ts    open + migrate DB
│           └── seed.ts     pilot location, night schedule, default rules
├── web/                    React dashboard
└── data/                   DB, recordings, snapshots (git-ignored)
```

## Database (SQLite)

| Table                  | Purpose                                                        |
|------------------------|----------------------------------------------------------------|
| `locations`            | Location + armed/disarmed state                                |
| `arm_schedules`        | Night-mode arm/disarm times                                    |
| `devices`              | Cameras, sensors, detectors, hub; card order, visible fields, settings JSON, live status |
| `temperature_readings` | Every reading with the limits at that time (Mattilsynet)       |
| `deviations`           | "Avvik" periods: start/end, peak, corrective action, signed by |
| `events`               | Live event feed                                                |
| `rules`                | Automation rules (trigger / conditions / actions as JSON)      |
| `contacts`             | Per-location contacts with escalation order + wait minutes     |
| `alerts`               | Alerts, escalation step, who acknowledged and when            |
| `alert_notifications`  | Every call/WhatsApp attempt with Twilio SID + status           |
| `recordings`, `snapshots` | Saved camera MP4s / images                                  |
| `app_settings`         | Key/value settings                                             |

Device `settings` JSON per category:

- camera: `{ "recordingMode": "off|on_event|continuous", "clipSeconds": 60 }`
- sensor: `{ "logIntervalMin": 15, "min": 0, "max": 4, "warnAfterMin": 15, "criticalAfterMin": 45 }`
- detector: `{ "armedSchedule": true, "sensitivity": "low|medium|high" }`

Seeded default rules: Smoke detected, Night intrusion, Temperature out of range, Device offline / low battery.

## Mock mode (step 2)

With `MOCK_MODE=true` the backend loads 15 mock devices (5 cameras, 4 temperature sensors,
5 detectors, 1 hub), drifts temperatures every 5 s over WebSocket, and logs readings at each
sensor's interval. The dashboard shows a **Simulate** panel:

| Button          | What happens                                                         |
|-----------------|----------------------------------------------------------------------|
| Smoke           | Smoke detector → critical, all cameras REC, live view opens, red banner |
| Night intrusion | Arms location, door opens → critical, cameras REC, live view         |
| Fridge too warm | Sensor above limit → amber warning banner                            |
| Reset all       | Clears alarms and returns devices to normal                          |

To start over with fresh mock data, stop the app and delete the `data/` folder.

API (used by the dashboard): `GET /api/dashboard`, `POST /api/location/arm`,
`POST /api/alerts/:id/ack`, `POST /api/mock/scenario/:name`, WebSocket `/ws`.

## Devices & settings (step 3)

Open the **Devices** tab (`#/devices`):

- **Night mode:** auto arm/disarm times and weekdays.
- **Per device:** rename, reorder (▲▼), delete, and choose which fields the card shows.
- **Camera:** recording mode (off / on event / continuous) and clip length.
- **Sensor:** min/max limits, logging interval, warning after N min, critical after N min, critical margin (°C).
- **Detector:** sensitivity, follow night schedule, and a **Test** button (shows the alarm state for 4 s and logs it; no call or message is sent).
- **Hub:** connection status and linked device count.
- **Add device:** name, type, optional IMOU/Aqara device ID (linked to the real device in steps 4–5).

Deleting a sensor that has temperature logs **archives** it instead, so the Mattilsynet log is kept.

API: `GET/POST /api/devices`, `PATCH/DELETE /api/devices/:id`, `PUT /api/devices/order`,
`POST /api/devices/:id/test`, `GET/PUT /api/location/schedule`.
Cameras: `GET /api/cameras/:id/live.m3u8?q=hd|sd`, `GET|POST /api/cameras/:id/snapshot(.jpg)`,
`POST /api/cameras/:id/record` / `record/stop`, `GET /api/cameras/recordings`, `POST /api/cameras/imou/sync`.

## IMOU cameras (step 4)

1. In `.env` set `IMOU_APP_ID`, `IMOU_APP_SECRET`, `IMOU_DATA_CENTER=fk`, then restart `npm run dev`.
2. On start the server imports every camera on the IMOU account and **replaces the 5 mock cameras**.
   Re-import any time: **Devices → Cameras → Sync IMOU**. Renamed cameras keep your name.
3. Install ffmpeg for MP4 recording (recommended):
   - Windows: `winget install Gyan.FFmpeg` (then reopen the terminal)
   - Mac: `brew install ffmpeg`

   If none is installed, the bundled `ffmpeg-static` is tried. `GET /api/health` shows `"recorder": "ready"`.

What it does:

| Feature | How |
|---|---|
| Camera list + online/offline | `deviceBaseList` / `deviceOnline`, checked every 60 s; offline/online goes to the event feed |
| Tiles | Snapshot (`setDeviceSnapEnhanced`) every 5 min while a dashboard is open |
| Live view | IMOU **http** HLS stream proxied through the backend (`/api/cameras/:id/live.m3u8`), played with hls.js. Grid = SD, single camera = HD (switchable) |
| Recording | ffmpeg saves MP4 to `data/recordings/<camera>/<date>/`. Manual (Record button), on alarm (smoke / intrusion → all cameras whose mode isn't *off*), or continuous (back-to-back clips) |
| Clean-up | Recordings and snapshots older than `RECORDING_RETENTION_DAYS` (14) are deleted |

The proxy only forwards to hosts IMOU gave a stream URL for (it is not an open proxy).

### Test without real cameras

```bash
npm run fake:imou -w server      # fake IMOU API + 4 live test streams on :4555
```
and in `.env`: `IMOU_APP_ID=fake`, `IMOU_APP_SECRET=fake`, `IMOU_API_URL=http://localhost:4555/openapi`.
Remove `IMOU_API_URL` again before using your real account.

## Aqara (step 5)

1. In `.env` set `AQARA_APP_ID`, `AQARA_KEY_ID`, `AQARA_APP_KEY` from the **approved "DEMO APPLICATION"**
   project (a pending project returns error 2046), `AQARA_REGION=eu`. Restart.
2. **Devices → Aqara account:** enter the Aqara account email/phone → **Send code** → enter the code → **Connect**.
   Devices are imported (temperature, smoke, door/contact, vibration, hub) and replace the mock ones.
   The login renews itself; it is stored in the local database, not in `.env`.
3. Check each device: open it under Devices → *Aqara resources* → **Show live values**. The app guesses which
   resource holds the temperature / open-closed / smoke / battery value; correct it there if needed.

| | |
|---|---|
| Reading | All Aqara devices every `AQARA_POLL_SEC` (20 s) in one call; online state + hub links every 2 min |
| Temperature log | Stored every *logging interval* per sensor (default 15 min) in `temperature_readings` with the limits at that time |
| Deviations (avvik) | Out of range ≥ *warning after* → deviation opened (warning); ≥ *critical after* or past the *critical margin* → critical; closed when back in range |
| Events | Smoke, door open/closed, vibration, offline/online, low battery → event feed (and the rules engine, step 6) |
| New freezer | A new sensor reading below −10 °C starts with freezer limits (−25 to −18 °C) |

Aqara pushes events only to a public callback URL, so this local app polls; alarms appear within ~20 s.

Test without devices: `npm run fake:aqara -w server` and in `.env`: `AQARA_APP_ID=fake`, `AQARA_KEY_ID=fake`,
`AQARA_APP_KEY=fake`, `AQARA_API_URL=http://localhost:4556` (login code `123456`).

## Alerts & automations (step 6)

**Alerts tab:**

- **Who gets called:** contacts in call order, each with a *wait before next contact* time. **Test** sends a test call + WhatsApp.
- **Automations:** the rules engine. Each rule: *when* (smoke, door opened, vibration, temperature out of range,
  device offline, low battery), *only while armed*, *then* (record all cameras, open live view, alert none / warning / critical).
  Defaults: Smoke detected, Night intrusion, Temperature out of range, Device offline / low battery.
- **Alert log:** every alert, every call/WhatsApp attempt with its status, and who acknowledged it, when and how.

| Alert | What happens |
|---|---|
| Critical (smoke, intrusion, temperature past critical) | Call + WhatsApp (with live-view link) to contact #1. Not acknowledged within their wait time → #2, … two rounds. Red banner on the dashboard. |
| Warning (temperature, offline, low battery) | WhatsApp only, to contacts with *receive warnings*. Resolved automatically when the cause goes away. |
| Acknowledge | Dashboard button, **press 1** during the call, or reply **OK** on WhatsApp (the last two need a public https `PUBLIC_BASE_URL`). |
| Night mode | Arms at the scheduled time on the chosen days; disarms in the morning if the schedule armed it. Door/vibration alarms only count while armed. |

Same alarm from several sensors (door + vibration during one break-in) = one alert. Without Twilio settings
nothing is sent: attempts are logged as *simulated* so you can test the whole flow.

### Twilio setup

1. Twilio account → buy a voice-capable number → `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
2. WhatsApp: the Twilio WhatsApp sandbox for testing (`WHATSAPP_FROM=whatsapp:+14155238886`, each phone joins the sandbox),
   or a WhatsApp Business sender for real use. For alarms you need an approved template → `WHATSAPP_CONTENT_SID`.
3. For "press 1" / "OK" acknowledgements, Twilio must reach the app: run `npm run build && npm start`
   (dashboard + API on port 4000), expose it with HTTPS (e.g. Cloudflare Tunnel), set `PUBLIC_BASE_URL` to that
   address and **set `APP_PASSWORD`**. In the Twilio console set the WhatsApp sender's incoming-message URL to
   `<PUBLIC_BASE_URL>/api/twilio/whatsapp`. Webhooks are checked with Twilio's signature.

## Shareable demo

`npm run build:demo -w web` (Mac/Linux) builds `web/dist-demo/`: the dashboard with an in-browser simulated
backend (no server, no real devices), used for the shareable demo link.

## Build order

1. ✅ Scaffold, `.env` template, SQLite schema, README
2. ✅ Dashboard UI with mock data
3. ✅ Device settings & editing (mock data)
4. ✅ IMOU integration (list, status, HLS live view proxy, recording)
5. ✅ Aqara integration (sensors, detectors, 15-min logging)
6. ✅ Rules engine + alerts/escalation (Twilio voice + WhatsApp)
7. Compliance export (PDF/CSV temperature report)
