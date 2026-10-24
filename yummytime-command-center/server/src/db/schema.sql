-- YummyTime Location Command Center - SQLite schema (v1)
-- All timestamps are ISO-8601 UTC strings (datetime('now')).

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Locations (pilot: "Yummy Time Capsule")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  timezone      TEXT NOT NULL DEFAULT 'Europe/Oslo',
  armed         INTEGER NOT NULL DEFAULT 0,          -- 0 = disarmed, 1 = armed
  armed_by      TEXT,                                -- 'schedule' | user name
  armed_at      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Night-mode schedule (arm/disarm automatically)
CREATE TABLE IF NOT EXISTS arm_schedules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id   INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  days          TEXT NOT NULL DEFAULT '1,2,3,4,5,6,7', -- ISO weekdays, Mon=1
  arm_time      TEXT NOT NULL DEFAULT '23:00',          -- HH:MM local time
  disarm_time   TEXT NOT NULL DEFAULT '06:00',
  enabled       INTEGER NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------------------------
-- Devices / dashboard cards
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id     INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  category        TEXT NOT NULL CHECK (category IN ('camera','sensor','detector','hub')),
  kind            TEXT NOT NULL,                    -- camera | temperature | smoke | door | vibration | hub
  provider        TEXT NOT NULL CHECK (provider IN ('imou','aqara','mock')),
  external_id     TEXT,                             -- IMOU deviceId / Aqara did
  channel_id      TEXT,                             -- IMOU channel (usually '0')
  name            TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  visible_fields  TEXT NOT NULL DEFAULT '[]',       -- JSON array of field keys shown on card
  settings        TEXT NOT NULL DEFAULT '{}',       -- JSON: per-category settings (see README)
  status          TEXT NOT NULL DEFAULT 'offline'
                    CHECK (status IN ('ok','warning','critical','offline')),
  online          INTEGER NOT NULL DEFAULT 0,
  battery         INTEGER,                          -- percent
  last_value      REAL,                             -- e.g. temperature in C
  last_state      TEXT,                             -- e.g. 'open','closed','smoke','clear'
  last_seen       TEXT,
  archived_at     TEXT,                             -- set instead of deleting when logs exist (compliance)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, external_id, channel_id)
);
CREATE INDEX IF NOT EXISTS idx_devices_location ON devices(location_id, category, sort_order);

-- ---------------------------------------------------------------------------
-- Temperature log (Mattilsynet compliance)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS temperature_readings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id     INTEGER NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  value_c       REAL NOT NULL,
  humidity      REAL,
  min_limit     REAL,                               -- limits at time of reading (audit trail)
  max_limit     REAL,
  in_range      INTEGER NOT NULL,
  recorded_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_temp_device_time ON temperature_readings(device_id, recorded_at);

-- Deviations ("avvik"): a period where a sensor was out of range
CREATE TABLE IF NOT EXISTS deviations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id       INTEGER NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  started_at      TEXT NOT NULL,
  ended_at        TEXT,                             -- NULL = still ongoing
  peak_value_c    REAL,
  min_limit       REAL,
  max_limit       REAL,
  severity        TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('warning','critical')),
  corrective_action TEXT,                           -- free text: what was done ("tiltak")
  signed_by       TEXT,
  signed_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_dev_device_time ON deviations(device_id, started_at);

-- ---------------------------------------------------------------------------
-- Event feed (everything that happens)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id   INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  device_id     INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  type          TEXT NOT NULL,                      -- smoke | door_open | vibration | temp_high | offline | low_battery | armed | disarmed | ...
  severity      TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  message       TEXT NOT NULL,
  payload       TEXT NOT NULL DEFAULT '{}',         -- raw JSON from provider
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_location_time ON events(location_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Rules engine (editable in UI)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id   INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  enabled       INTEGER NOT NULL DEFAULT 1,
  trigger       TEXT NOT NULL,                      -- JSON: { "event": "smoke" } etc.
  conditions    TEXT NOT NULL DEFAULT '[]',         -- JSON: [{ "armed": true }, { "durationMin": 10 }]
  actions       TEXT NOT NULL DEFAULT '[]',         -- JSON: [{ "type": "record_all" }, { "type": "alert", "severity": "critical" }]
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Alerting & escalation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id      INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  phone            TEXT NOT NULL,                   -- E.164, e.g. +4712345678
  whatsapp         TEXT,                            -- E.164; NULL = same as phone
  escalation_order INTEGER NOT NULL DEFAULT 1,      -- 1 = called first
  wait_minutes     INTEGER NOT NULL DEFAULT 5,      -- wait before escalating to next contact
  receive_warnings INTEGER NOT NULL DEFAULT 1,
  enabled          INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS alerts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id     INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  event_id        INTEGER REFERENCES events(id) ON DELETE SET NULL,
  rule_id         INTEGER REFERENCES rules(id) ON DELETE SET NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('warning','critical')),
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','escalating','acknowledged','resolved')),
  escalation_step INTEGER NOT NULL DEFAULT 0,
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  ack_channel     TEXT,                             -- dashboard | phone_keypress | whatsapp
  resolved_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(location_id, status);

-- Every call / message attempt (audit log)
CREATE TABLE IF NOT EXISTS alert_notifications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id      INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  contact_id    INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  channel       TEXT NOT NULL CHECK (channel IN ('voice','whatsapp','sms')),
  to_number     TEXT NOT NULL,
  provider_sid  TEXT,                               -- Twilio Call/Message SID
  status        TEXT NOT NULL DEFAULT 'queued',     -- queued | ringing | answered | no-answer | failed | delivered | read
  error         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Camera recordings & snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recordings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id     INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  alert_id      INTEGER REFERENCES alerts(id) ON DELETE SET NULL,
  reason        TEXT NOT NULL DEFAULT 'manual',     -- manual | event | continuous
  file_path     TEXT,                               -- relative to DATA_DIR
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at      TEXT,
  size_bytes    INTEGER
);

CREATE TABLE IF NOT EXISTS snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id     INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  file_path     TEXT NOT NULL,
  taken_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- App settings (key/value) + schema version
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_version (
  version       INTEGER PRIMARY KEY,
  applied_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO schema_version (version) VALUES (1);
