-- Execute este script no Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qgiyhobvumwobxqxptol/sql/new

CREATE TABLE IF NOT EXISTS districts (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  district_id  INTEGER NOT NULL REFERENCES districts(id),
  team_number  INTEGER NOT NULL DEFAULT 1,
  instructor   TEXT
);

CREATE TABLE IF NOT EXISTS employees (
  id        SERIAL PRIMARY KEY,
  matricula TEXT,
  name      TEXT NOT NULL,
  function  TEXT,
  company   TEXT DEFAULT 'ENGECOM',
  team_id   INTEGER REFERENCES teams(id),
  active    INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sessions (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  week        TEXT,
  month_year  TEXT,
  date        TEXT,
  time_start  TEXT DEFAULT '07:00',
  time_end    TEXT DEFAULT '07:30',
  description TEXT,
  workload    TEXT DEFAULT '00h 30m',
  obra_vale   TEXT DEFAULT '11 5900130281',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assignments (
  id              SERIAL PRIMARY KEY,
  session_id      INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  team_id         INTEGER NOT NULL REFERENCES teams(id),
  instructor_name TEXT,
  status          TEXT DEFAULT 'pending',
  pdf_path        TEXT,
  submitted_at    TIMESTAMP
);

CREATE TABLE IF NOT EXISTS submissions (
  id            SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  file_path     TEXT NOT NULL,
  original_name TEXT,
  uploaded_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
