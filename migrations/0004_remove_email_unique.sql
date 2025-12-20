-- Migration number: 0004 	 2025-12-20T17:00:00.000Z

-- SQLite doesn't support DROP CONSTRAINT, so we need to recreate the table
-- Create new contacts table without UNIQUE constraint on email
CREATE TABLE contacts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  name TEXT,
  last_contacted TEXT,
  unsubscribed INTEGER DEFAULT 0,
  metadata TEXT,
  user_id INTEGER
);

-- Copy data from old table
INSERT INTO contacts_new SELECT * FROM contacts;

-- Drop old table
DROP TABLE contacts;

-- Rename new table
ALTER TABLE contacts_new RENAME TO contacts;

-- Create index for better query performance (but not unique)
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_user_id ON contacts(user_id);

-- Add unique constraint only for the combination of email + user_id
-- This allows different users to have the same email contact
CREATE UNIQUE INDEX idx_contacts_email_user ON contacts(email, user_id);
