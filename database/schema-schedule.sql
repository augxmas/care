-- ============================================================
-- 일정관리(의사 일정/예약) 기능 스키마
-- 수동 적용:  mysql -u<user> -p <db> < database/schema-schedule.sql
-- 멱등(IF NOT EXISTS). 기존 관례에 따라 DB FK는 최소화(앱레벨 무결성).
-- ============================================================

-- 로그인 이력 user_type 확장 (doctor/manager/customer 로그인 기록)
ALTER TABLE `login_histories`
  MODIFY COLUMN `user_type` ENUM('advertiser','supervisor','doctor','manager','customer') NOT NULL;

-- ── 고객 로그인 계정 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `customers` (
  `id`                  BIGINT       NOT NULL AUTO_INCREMENT,
  `advertiser_id`       INT          NOT NULL                COMMENT '소속 병원(광고주) ID',
  `visit_id`            BIGINT       DEFAULT NULL            COMMENT '최근 연결된 customer_visits.id',
  `hospital_patient_id` VARCHAR(64)  DEFAULT NULL            COMMENT '병원 환자 일련번호(스냅샷)',
  `name`                VARCHAR(100) DEFAULT NULL,
  `email`               VARCHAR(255) NOT NULL                COMMENT '로그인 ID',
  `password_hash`       VARCHAR(255) DEFAULT NULL            COMMENT 'bcrypt 해시',
  `mobile`              VARCHAR(40)  DEFAULT NULL,
  `status`              ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `password_reset_required` TINYINT(1) NOT NULL DEFAULT 1   COMMENT '자동생성 후 강제 변경',
  `auto_created`        TINYINT(1)   NOT NULL DEFAULT 0,
  `last_login_at`       DATETIME     DEFAULT NULL,
  `last_login_ip`       VARCHAR(45)  DEFAULT NULL,
  `is_deleted`          TINYINT(1)   NOT NULL DEFAULT 0,
  `deleted_at`          DATETIME     DEFAULT NULL,
  `deleted_by`          VARCHAR(120) DEFAULT NULL,
  `created_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customers_adv_email` (`advertiser_id`, `email`),
  KEY `idx_customers_adv`   (`advertiser_id`),
  KEY `idx_customers_hpid`  (`advertiser_id`, `hospital_patient_id`),
  KEY `idx_customers_visit` (`visit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='고객(환자) 로그인 계정';

-- ── 공휴일/휴무일 (시스템 시드 + 병원별 오버라이드) ──────────────
-- advertiser_id IS NULL  : 시스템 전국 공휴일 시드 (기본 휴무)
-- advertiser_id 값 존재   : 해당 병원 관리자 오버라이드(working=공휴일을 근무로 / closed=평일을 휴무로)
CREATE TABLE IF NOT EXISTS `holidays` (
  `id`            INT          NOT NULL AUTO_INCREMENT,
  `advertiser_id` INT          DEFAULT NULL,
  `holiday_date`  DATE         NOT NULL,
  `name`          VARCHAR(120) DEFAULT NULL,
  `day_type`      ENUM('closed','working') NOT NULL DEFAULT 'closed',
  `is_system`     TINYINT(1)   NOT NULL DEFAULT 0,
  `created_by`    VARCHAR(120) DEFAULT NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_holiday_scope_date` (`advertiser_id`, `holiday_date`),
  KEY `idx_holiday_date` (`holiday_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='공휴일/휴무일';

-- ── 일정(예약) 블록 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `appointments` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT,
  `advertiser_id` INT          NOT NULL                     COMMENT '병원(광고주) ID — 데이터 격리',
  `doctor_id`     INT          NOT NULL                     COMMENT '의사 ID (일정은 의사 중심)',
  `manager_id`    INT          DEFAULT NULL                 COMMENT '지정 담당자',
  `customer_id`   BIGINT       DEFAULT NULL                 COMMENT 'customers.id (부재중이면 NULL)',
  `visit_id`      BIGINT       DEFAULT NULL                 COMMENT 'customer_visits.id (기본정보/문진 연결)',
  `status`        ENUM('consulting','operating','absent') NOT NULL COMMENT '진료중/수술중/부재중',
  `title`         VARCHAR(200) DEFAULT NULL,
  `start_at`      DATETIME     NOT NULL                     COMMENT 'KST wall-clock',
  `end_at`        DATETIME     NOT NULL,
  `note`          TEXT         DEFAULT NULL,
  `notified_at`   DATETIME     DEFAULT NULL                 COMMENT '고객 통보 시각',
  `created_by`    VARCHAR(120) DEFAULT NULL,
  `is_deleted`    TINYINT(1)   NOT NULL DEFAULT 0,
  `deleted_at`    DATETIME     DEFAULT NULL,
  `deleted_by`    VARCHAR(120) DEFAULT NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_appt_doctor_time` (`doctor_id`, `start_at`, `end_at`, `is_deleted`),
  KEY `idx_appt_adv_time`    (`advertiser_id`, `start_at`, `is_deleted`),
  KEY `idx_appt_customer`    (`customer_id`),
  KEY `idx_appt_manager`     (`manager_id`),
  CONSTRAINT `chk_appt_time` CHECK (`end_at` > `start_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='의사 일정/예약 블록';
