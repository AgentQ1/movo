-- Disable foreign keys
PRAGMA foreign_keys = OFF;

-- Create new table without UNIQUE on email
CREATE TABLE contacts_temp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  name TEXT,
  last_contacted TEXT,
  unsubscribed INTEGER DEFAULT 0,
  metadata TEXT,
  user_id INTEGER
);

-- Copy all data
INSERT INTO contacts_temp SELECT id, email, name, last_contacted, unsubscribed, metadata, user_id FROM contacts;

-- Drop old table
DROP TABLE contacts;

-- Rename temp to contacts
ALTER TABLE contacts_temp RENAME TO contacts;

-- Create indexes
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE UNIQUE INDEX idx_contacts_email_user ON contacts(email, user_id);

-- Re-enable foreign keys
PRAGMA foreign_keys = ON;
