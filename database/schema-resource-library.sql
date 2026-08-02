CREATE TABLE IF NOT EXISTS resource_images (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  advertiser_id BIGINT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  description TEXT NULL,
  tags TEXT NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  mime_type VARCHAR(100) NULL,
  size_bytes BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_resource_images_owner_created (advertiser_id, created_at),
  INDEX idx_resource_images_language (advertiser_id, language)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
