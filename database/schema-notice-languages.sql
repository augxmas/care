ALTER TABLE notices
  ADD COLUMN supported_languages VARCHAR(255) NOT NULL DEFAULT 'ko,en' AFTER content,
  ADD COLUMN translations LONGTEXT NULL AFTER supported_languages;
