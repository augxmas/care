-- Hospital management extension (MariaDB 10.5+)
CREATE TABLE IF NOT EXISTS hospitals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_name VARCHAR(200) NOT NULL,
  hospital_id VARCHAR(64) NOT NULL UNIQUE,
  ceo_name TEXT NULL,
  business_no VARCHAR(20) NOT NULL UNIQUE,
  biz_cert_path VARCHAR(500) NULL,
  biz_cert_name VARCHAR(255) NULL,
  representative_phone VARCHAR(30) NULL,
  address1 VARCHAR(500) NULL,
  address2 VARCHAR(500) NULL,
  postal_code VARCHAR(10) NULL,
  medical_subjects TEXT NULL,
  fax VARCHAR(30) NULL,
  homepage VARCHAR(255) NULL,
  serial_no VARCHAR(20) NOT NULL UNIQUE,
  contact_name TEXT NULL,
  contact_mobile TEXT NULL,
  contact_email TEXT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  status_reason TEXT NULL,
  approved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS representative_phone VARCHAR(30) NULL;
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS medical_subjects TEXT NULL;
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS fax VARCHAR(30) NULL;
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS homepage VARCHAR(255) NULL;
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS serial_no VARCHAR(20) NULL;
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS approved_at DATETIME NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_advertisers_serial_no ON advertisers(serial_no);

UPDATE advertisers
   SET approved_at = updated_at
 WHERE status = 'approved' AND approved_at IS NULL;

CREATE TABLE IF NOT EXISTS hospital_form_fields (
  field_key VARCHAR(50) PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  required TINYINT(1) NOT NULL DEFAULT 0,
  searchable TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO hospital_form_fields (field_key,enabled,required,sort_order) VALUES
('company_name',1,1,1),('hospital_id',1,1,2),('ceo_name',1,1,3),('business_no',1,1,4),
('biz_cert',1,0,5),('representative_phone',1,1,6),('address1',1,1,7),
('address2',1,0,8),('postal_code',1,1,9),('medical_subjects',1,0,10),
('fax',1,0,11),('homepage',1,0,12),('contact_name',1,1,13),
('contact_mobile',1,1,14),('contact_email',1,1,15),('serial_no',1,0,16);

ALTER TABLE hospital_form_fields ADD COLUMN IF NOT EXISTS searchable TINYINT(1) NOT NULL DEFAULT 0;
