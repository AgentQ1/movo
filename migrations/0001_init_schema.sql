-- Migration number: 0001 	 2025-12-20T12:15:52.199Z

CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE,
  name TEXT,
  mime TEXT,
  size INTEGER,
  uploaded_at TEXT
);

CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  name TEXT,
  last_contacted TEXT,
  unsubscribed INTEGER DEFAULT 0,
  metadata TEXT
);

CREATE TABLE file_contacts (
  file_id INTEGER,
  contact_id INTEGER,
  is_original INTEGER DEFAULT 0,
  UNIQUE(file_id, contact_id)
);
