-- ============================================================
-- 온라인 1:1 상담 + 채팅 + LLM 스키마
-- 수동 적용:  mysql -u<user> -p <db> < database/schema-consult.sql
-- 멱등(IF NOT EXISTS). advertiser_id 격리, 소프트삭제/감사.
-- ============================================================

-- 1. 상담 게시글 (비공개 1:1)
CREATE TABLE IF NOT EXISTS `consult_posts` (
  `id`                  INT NOT NULL AUTO_INCREMENT,
  `advertiser_id`       INT NOT NULL,
  `author_email`        VARCHAR(255) NOT NULL,
  `hospital_patient_id` VARCHAR(100) DEFAULT NULL,
  `visit_id`            BIGINT DEFAULT NULL,
  `customer_id`         BIGINT DEFAULT NULL,
  `title`               VARCHAR(200) NOT NULL,
  `body`                MEDIUMTEXT NOT NULL,
  `lang`                VARCHAR(8) DEFAULT NULL,
  `password_hash`       VARCHAR(255) NOT NULL,
  `is_private`          TINYINT(1) NOT NULL DEFAULT 1,
  `status`              ENUM('new','assigned','answered','closed') NOT NULL DEFAULT 'new',
  `assigned_doctor_id`  INT DEFAULT NULL,
  `handling_manager_id` INT DEFAULT NULL,
  `answered_at`         DATETIME DEFAULT NULL,
  `conversation_id`     INT DEFAULT NULL,
  `is_deleted`          TINYINT(1) NOT NULL DEFAULT 0,
  `deleted_at`          DATETIME DEFAULT NULL,
  `deleted_by`          VARCHAR(100) DEFAULT NULL,
  `created_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cp_adv_status` (`advertiser_id`, `status`, `is_deleted`),
  KEY `idx_cp_email` (`advertiser_id`, `author_email`),
  KEY `idx_cp_doctor` (`assigned_doctor_id`),
  KEY `idx_cp_hpid` (`advertiser_id`, `hospital_patient_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='온라인 1:1 상담 게시글';

-- 2. 답변 (담당자+의사 모두 가능)
CREATE TABLE IF NOT EXISTS `consult_answers` (
  `id`              INT NOT NULL AUTO_INCREMENT,
  `advertiser_id`   INT NOT NULL,
  `post_id`         INT NOT NULL,
  `author_type`     ENUM('manager','doctor') NOT NULL,
  `author_id`       INT NOT NULL,
  `body`            MEDIUMTEXT NOT NULL,
  `chat_link_token` VARCHAR(64) DEFAULT NULL,
  `is_deleted`      TINYINT(1) NOT NULL DEFAULT 0,
  `deleted_at`      DATETIME DEFAULT NULL,
  `deleted_by`      VARCHAR(100) DEFAULT NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ca_post` (`post_id`, `is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='상담 답변';

-- 3. 채팅 대화방
CREATE TABLE IF NOT EXISTS `chat_conversations` (
  `id`                  INT NOT NULL AUTO_INCREMENT,
  `advertiser_id`       INT NOT NULL,
  `post_id`             INT DEFAULT NULL,
  `customer_email`      VARCHAR(255) NOT NULL,
  `customer_id`         BIGINT DEFAULT NULL,
  `hospital_patient_id` VARCHAR(100) DEFAULT NULL,
  `customer_lang`       VARCHAR(8) DEFAULT NULL,
  `status`              ENUM('open','closed') NOT NULL DEFAULT 'open',
  `last_message_at`     DATETIME DEFAULT NULL,
  `created_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cc_adv` (`advertiser_id`, `status`, `last_message_at`),
  KEY `idx_cc_post` (`post_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='채팅 대화방';

-- 4. 참가자
CREATE TABLE IF NOT EXISTS `chat_participants` (
  `id`               INT NOT NULL AUTO_INCREMENT,
  `conversation_id`  INT NOT NULL,
  `advertiser_id`    INT NOT NULL,
  `participant_type` ENUM('manager','doctor','customer') NOT NULL,
  `participant_id`   INT DEFAULT NULL,
  `display_name`     VARCHAR(120) DEFAULT NULL,
  `lang`             VARCHAR(8) DEFAULT NULL,
  `joined_at`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cpart` (`conversation_id`, `participant_type`, `participant_id`),
  KEY `idx_cpart_conv` (`conversation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='채팅 참가자';

-- 5. 채팅 메시지 (학습로그=is_training_log)
CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id`                  INT NOT NULL AUTO_INCREMENT,
  `advertiser_id`       INT NOT NULL,
  `conversation_id`     INT NOT NULL,
  `sender_type`         ENUM('manager','doctor','customer','system') NOT NULL,
  `sender_id`           INT DEFAULT NULL,
  `original_text`       MEDIUMTEXT DEFAULT NULL,
  `original_lang`       VARCHAR(8) DEFAULT NULL,
  `translated_text`     MEDIUMTEXT DEFAULT NULL,
  `translated_lang`     VARCHAR(8) DEFAULT NULL,
  `attachment_id`       INT DEFAULT NULL,
  `is_training_log`     TINYINT(1) NOT NULL DEFAULT 1,
  `read_by_staff_at`    DATETIME DEFAULT NULL,
  `read_by_customer_at` DATETIME DEFAULT NULL,
  `created_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cm_conv` (`conversation_id`, `created_at`),
  KEY `idx_cm_adv` (`advertiser_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='채팅 메시지(학습로그)';

-- 6. 첨부파일
CREATE TABLE IF NOT EXISTS `chat_attachments` (
  `id`              INT NOT NULL AUTO_INCREMENT,
  `advertiser_id`   INT NOT NULL,
  `conversation_id` INT NOT NULL,
  `uploader_type`   ENUM('manager','doctor','customer') NOT NULL,
  `uploader_id`     INT DEFAULT NULL,
  `file_path`       VARCHAR(500) NOT NULL,
  `original_name`   VARCHAR(255) NOT NULL,
  `mime_type`       VARCHAR(120) DEFAULT NULL,
  `size_bytes`      INT DEFAULT NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_catt_conv` (`conversation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='채팅 첨부파일';

-- 7. LLM 토큰 사용 (기관별 과금)
CREATE TABLE IF NOT EXISTS `llm_usage` (
  `id`                 INT NOT NULL AUTO_INCREMENT,
  `advertiser_id`      INT NOT NULL,
  `actor_type`         ENUM('manager','doctor','advertiser','system') NOT NULL,
  `actor_id`           INT DEFAULT NULL,
  `conversation_id`    INT DEFAULT NULL,
  `customer_email`     VARCHAR(255) DEFAULT NULL,
  `purpose`            ENUM('system_chat','translate') NOT NULL,
  `model`              VARCHAR(60) NOT NULL,
  `input_tokens`       INT NOT NULL DEFAULT 0,
  `output_tokens`      INT NOT NULL DEFAULT 0,
  `cache_read_tokens`  INT NOT NULL DEFAULT 0,
  `cache_write_tokens` INT NOT NULL DEFAULT 0,
  `request_id`         VARCHAR(80) DEFAULT NULL,
  `created_at`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lu_bill` (`advertiser_id`, `created_at`),
  KEY `idx_lu_actor` (`advertiser_id`, `actor_type`, `actor_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='LLM 토큰 사용(기관별 과금)';

-- 8. 채팅 입장 토큰 (고객 소켓 인증, 단기)
CREATE TABLE IF NOT EXISTS `chat_tokens` (
  `id`              INT NOT NULL AUTO_INCREMENT,
  `token`           VARCHAR(64) NOT NULL,
  `advertiser_id`   INT NOT NULL,
  `conversation_id` INT NOT NULL,
  `customer_email`  VARCHAR(255) NOT NULL,
  `expires_at`      DATETIME NOT NULL,
  `revoked`         TINYINT(1) NOT NULL DEFAULT 0,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ct_token` (`token`),
  KEY `idx_ct_lookup` (`token`, `revoked`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='채팅 입장 토큰';

-- email_verifications 교차사용 방지용 purpose (선택) — 없으면 행위별 신규코드로 강제
ALTER TABLE `email_verifications` ADD COLUMN IF NOT EXISTS `purpose` VARCHAR(20) DEFAULT NULL;

-- Legacy chat_tokens compatibility migration
ALTER TABLE `chat_tokens` ADD COLUMN IF NOT EXISTS `advertiser_id` BIGINT NULL AFTER `token`;
ALTER TABLE `chat_tokens` ADD COLUMN IF NOT EXISTS `customer_email` VARCHAR(255) NULL AFTER `conversation_id`;
ALTER TABLE `chat_tokens` ADD COLUMN IF NOT EXISTS `revoked` TINYINT(1) NOT NULL DEFAULT 0 AFTER `expires_at`;

-- 9. 상담 자격증명 (인증코드 = 로그인 비밀번호, 병원+이메일별 지속)
--    인증코드를 1회성 OTP가 아니라 "비밀번호"처럼 보관. 재발급 시 갱신.
CREATE TABLE IF NOT EXISTS `consult_credentials` (
  `id`            INT NOT NULL AUTO_INCREMENT,
  `advertiser_id` INT NOT NULL,
  `email`         VARCHAR(255) NOT NULL,
  `code_hash`     VARCHAR(255) NOT NULL,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cred` (`advertiser_id`, `email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='상담 자격증명(인증코드=비밀번호)';

-- 인증코드를 비밀번호로 통합 → 게시물별 비밀번호 컬럼은 선택값으로 완화
ALTER TABLE `consult_posts` MODIFY COLUMN `password_hash` VARCHAR(255) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS `consult_post_attachments` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `advertiser_id` BIGINT NOT NULL,
  `post_id` BIGINT NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(120) DEFAULT NULL,
  `size_bytes` INT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_consult_post_attachment` (`advertiser_id`,`post_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 스탭 전용(고객 비노출) 메시지 플래그: @시스템 질문/답변. 공유 시 0으로 전환.
ALTER TABLE `chat_messages` ADD COLUMN IF NOT EXISTS `staff_only` TINYINT(1) NOT NULL DEFAULT 0;
