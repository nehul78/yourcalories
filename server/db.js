import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
mkdirSync(path.join(DATA_DIR, 'photos'), { recursive: true });
mkdirSync(path.join(DATA_DIR, 'reports'), { recursive: true });

export const db = new DatabaseSync(process.env.DB_FILE || path.join(DATA_DIR, 'app.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('member','trainer')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  nationality TEXT,
  sex TEXT,
  birth_year INTEGER,
  height_cm REAL,
  activity TEXT DEFAULT 'light',
  invite_code TEXT UNIQUE,           -- trainers only
  notify_time TEXT DEFAULT '20:00',  -- trainers only, HH:MM in their local time
  tz_offset INTEGER DEFAULT 0,       -- minutes, as Date.getTimezoneOffset()
  last_digest_date TEXT,
  push_sub TEXT,
  onboarded INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cuisines (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cuisine TEXT NOT NULL,
  freq TEXT NOT NULL CHECK (freq IN ('usually','sometimes')),
  PRIMARY KEY (user_id, cuisine)
);
-- one active link per member
CREATE TABLE IF NOT EXISTS links (
  member_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  trainer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  required_params TEXT NOT NULL DEFAULT '["weight"]',
  cycle_start TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS goals (
  member_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('lose','gain','maintain')),
  start_weight REAL,
  target_weight REAL,
  target_date TEXT,
  calories INTEGER NOT NULL,
  protein_g INTEGER,
  carbs_g INTEGER,
  fat_g INTEGER,
  workouts_per_week INTEGER DEFAULT 3,
  set_by TEXT NOT NULL DEFAULT 'self' CHECK (set_by IN ('self','trainer')),
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS measurements (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  weight REAL, waist REAL, chest REAL, hips REAL, arm REAL, thigh REAL,
  body_fat REAL, resting_hr REAL,
  UNIQUE (member_id, date)
);
CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  meal_type TEXT DEFAULT 'snack',
  name TEXT NOT NULL,
  kcal REAL NOT NULL, protein REAL DEFAULT 0, carbs REAL DEFAULT 0, fat REAL DEFAULT 0,
  source TEXT DEFAULT 'typed',
  late INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS meals_member_date ON meals (member_id, date);
CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  kcal_burned INTEGER DEFAULT 0,
  notes TEXT,
  late INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS workouts_member_date ON workouts (member_id, date);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  file TEXT NOT NULL,
  mood TEXT NOT NULL DEFAULT 'motivate',
  delta_kg REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trainer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  file TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload TEXT,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);
