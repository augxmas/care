
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `advertisers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `advertisers` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `company_name` longtext NOT NULL,
  `company_name_en` varchar(200) DEFAULT NULL,
  `business_no` varchar(191) NOT NULL,
  `ceo_name` longtext DEFAULT NULL,
  `address1` longtext NOT NULL,
  `address2` longtext DEFAULT NULL,
  `postal_code` varchar(255) NOT NULL,
  `contact_name` longtext DEFAULT NULL,
  `contact_mobile` longtext DEFAULT NULL,
  `contact_phone` longtext DEFAULT NULL,
  `contact_email` longtext DEFAULT NULL,
  `email_hash` varchar(191) NOT NULL,
  `password_hash` longtext NOT NULL,
  `push_consent` bigint(20) DEFAULT 0,
  `email_consent` bigint(20) DEFAULT 0,
  `terms_consent` bigint(20) DEFAULT 0,
  `privacy_consent` bigint(20) DEFAULT 0,
  `biz_cert_path` longtext DEFAULT NULL,
  `biz_cert_name` longtext DEFAULT NULL,
  `status` varchar(255) DEFAULT 'pending',
  `status_reason` longtext DEFAULT NULL,
  `bank_account` longtext DEFAULT NULL,
  `email_verified` bigint(20) DEFAULT 0,
  `last_login_ip` longtext DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  `password_reset_required` bigint(20) DEFAULT 0,
  `representative_phone` longtext DEFAULT NULL,
  `medical_subjects` longtext DEFAULT NULL,
  `fax` varchar(255) DEFAULT NULL,
  `homepage` longtext DEFAULT NULL,
  `serial_no` varchar(191) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `bank_name` longtext DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_advertisers_email_hash` (`email_hash`),
  UNIQUE KEY `idx_advertisers_business_no` (`business_no`),
  UNIQUE KEY `idx_advertisers_serial_no` (`serial_no`),
  KEY `idx_advertisers_status` (`status`),
  KEY `idx_advertisers_email` (`email_hash`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `agency_form_fields`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agency_form_fields` (
  `field_key` varchar(191) NOT NULL,
  `enabled` bigint(20) NOT NULL DEFAULT 1,
  `required` bigint(20) NOT NULL DEFAULT 0,
  `searchable` bigint(20) NOT NULL DEFAULT 0,
  `sort_order` bigint(20) NOT NULL DEFAULT 0,
  `updated_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`field_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `appointments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `appointments` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `advertiser_id` bigint(20) NOT NULL,
  `doctor_id` bigint(20) NOT NULL,
  `manager_id` bigint(20) DEFAULT NULL,
  `customer_id` bigint(20) DEFAULT NULL,
  `visit_id` bigint(20) DEFAULT NULL,
  `status` varchar(255) NOT NULL,
  `title` longtext DEFAULT NULL,
  `start_at` datetime NOT NULL,
  `end_at` datetime NOT NULL,
  `note` longtext DEFAULT NULL,
  `notified_at` datetime DEFAULT NULL,
  `created_by` longtext DEFAULT NULL,
  `is_deleted` bigint(20) DEFAULT 0,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` longtext DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `campaign_sequences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `campaign_sequences` (
  `seq_date` date NOT NULL,
  `last_seq` bigint(20) DEFAULT 0,
  PRIMARY KEY (`seq_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `campaigns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `campaigns` (
  `id` varchar(191) NOT NULL,
  `advertiser_id` bigint(20) NOT NULL,
  `campaign_name` longtext NOT NULL,
  `description` longtext DEFAULT NULL,
  `discount_rate` double DEFAULT 0,
  `has_image` bigint(20) DEFAULT 0,
  `has_html` bigint(20) DEFAULT 0,
  `has_youtube` bigint(20) DEFAULT 0,
  `image_url` longtext DEFAULT NULL,
  `image_path` longtext DEFAULT NULL,
  `image_filename` longtext DEFAULT NULL,
  `image_width` bigint(20) DEFAULT NULL,
  `image_height` bigint(20) DEFAULT NULL,
  `html_url` longtext DEFAULT NULL,
  `html_path` longtext DEFAULT NULL,
  `html_filename` longtext DEFAULT NULL,
  `youtube_url` longtext DEFAULT NULL,
  `image_sns` varchar(255) NOT NULL DEFAULT '' COMMENT '??? ?? ?? SNS',
  `html_sns` varchar(255) NOT NULL DEFAULT '' COMMENT 'HTML ?? ?? SNS',
  `youtube_sns` varchar(255) NOT NULL DEFAULT '' COMMENT 'YouTube ?? ?? SNS',
  `from_date` date NOT NULL,
  `to_date` date NOT NULL,
  `ad_days` bigint(20) DEFAULT 0,
  `base_fee` double DEFAULT 0,
  `vat` double DEFAULT 0,
  `total_fee` double DEFAULT 0,
  `status` varchar(255) DEFAULT '입금전',
  `quotation_sent_at` datetime DEFAULT NULL,
  `quotation_token` longtext DEFAULT NULL,
  `quotation_read_at` datetime DEFAULT NULL,
  `payment_confirmed_at` datetime DEFAULT NULL,
  `payment_confirmed_by` longtext DEFAULT NULL,
  `files_backed_up` bigint(20) DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  `approved_at` datetime DEFAULT NULL,
  `approved_by` longtext DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `cancelled_by` longtext DEFAULT NULL,
  `is_deleted` bigint(20) DEFAULT 0,
  `collect_items` longtext DEFAULT NULL,
  `collect_item_options` longtext DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_campaigns_advertiser` (`advertiser_id`),
  KEY `idx_campaigns_status` (`status`),
  KEY `idx_campaigns_dates` (`from_date`,`to_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `chat_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_attachments` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `advertiser_id` bigint(20) DEFAULT NULL,
  `conversation_id` bigint(20) NOT NULL,
  `uploader_type` varchar(20) DEFAULT NULL,
  `uploader_id` bigint(20) DEFAULT NULL,
  `sender_type` longtext DEFAULT NULL,
  `sender_id` bigint(20) DEFAULT NULL,
  `file_name` longtext DEFAULT NULL,
  `file_path` longtext NOT NULL,
  `original_name` varchar(255) DEFAULT NULL,
  `file_size` bigint(20) DEFAULT NULL,
  `mime_type` longtext DEFAULT NULL,
  `size_bytes` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `chat_conversations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_conversations` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `advertiser_id` bigint(20) NOT NULL,
  `post_id` bigint(20) DEFAULT NULL,
  `customer_email` longtext NOT NULL,
  `customer_id` bigint(20) DEFAULT NULL,
  `hospital_patient_id` longtext DEFAULT NULL,
  `customer_lang` longtext DEFAULT NULL,
  `status` varchar(255) DEFAULT 'open',
  `last_message_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `chat_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_messages` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `advertiser_id` bigint(20) NOT NULL,
  `conversation_id` bigint(20) NOT NULL,
  `sender_type` longtext NOT NULL,
  `sender_id` bigint(20) DEFAULT NULL,
  `original_text` longtext DEFAULT NULL,
  `original_lang` longtext DEFAULT NULL,
  `translated_text` longtext DEFAULT NULL,
  `translated_lang` longtext DEFAULT NULL,
  `attachment_id` bigint(20) DEFAULT NULL,
  `staff_only` tinyint(1) NOT NULL DEFAULT 0,
  `is_training_log` bigint(20) DEFAULT 1,
  `read_by_staff_at` datetime DEFAULT NULL,
  `read_by_customer_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `chat_participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_participants` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `conversation_id` bigint(20) NOT NULL,
  `advertiser_id` bigint(20) NOT NULL,
  `participant_type` longtext NOT NULL,
  `participant_id` bigint(20) DEFAULT NULL,
  `display_name` longtext DEFAULT NULL,
  `lang` longtext DEFAULT NULL,
  `joined_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `chat_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_tokens` (
  `token` varchar(191) NOT NULL,
  `advertiser_id` bigint(20) DEFAULT NULL,
  `conversation_id` bigint(20) NOT NULL,
  `customer_email` varchar(255) DEFAULT NULL,
  `participant_type` longtext DEFAULT NULL,
  `participant_id` bigint(20) DEFAULT NULL,
  `display_name` longtext DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `revoked` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`token`),
  KEY `idx_chat_tokens_lookup` (`token`,`revoked`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `consult_answers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `consult_answers` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `advertiser_id` bigint(20) NOT NULL,
  `post_id` bigint(20) NOT NULL,
  `author_type` longtext NOT NULL,
  `author_id` bigint(20) NOT NULL,
  `body` longtext NOT NULL,
  `chat_link_token` longtext DEFAULT NULL,
  `is_deleted` bigint(20) DEFAULT 0,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` longtext DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `consult_credentials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `consult_credentials` (
  `email` varchar(191) NOT NULL,
  `code_hash` varchar(255) NOT NULL,
  `advertiser_id` bigint(20) NOT NULL,
  `password_hash` longtext DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `consult_post_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `consult_post_attachments` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `advertiser_id` bigint(20) NOT NULL,
  `post_id` bigint(20) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `mime_type` varchar(120) DEFAULT NULL,
  `size_bytes` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_consult_post_attachment` (`advertiser_id`,`post_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `consult_posts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `consult_posts` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `advertiser_id` bigint(20) NOT NULL,
  `author_email` longtext NOT NULL,
  `hospital_patient_id` longtext DEFAULT NULL,
  `visit_id` bigint(20) DEFAULT NULL,
  `customer_id` bigint(20) DEFAULT NULL,
  `title` longtext NOT NULL,
  `body` longtext NOT NULL,
  `lang` longtext DEFAULT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `is_private` bigint(20) DEFAULT 1,
  `status` varchar(255) DEFAULT 'new',
  `assigned_doctor_id` bigint(20) DEFAULT NULL,
  `handling_manager_id` bigint(20) DEFAULT NULL,
  `answered_at` datetime DEFAULT NULL,
  `conversation_id` bigint(20) DEFAULT NULL,
  `is_deleted` bigint(20) DEFAULT 0,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` longtext DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customer_visits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_visits` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `campaign_id` longtext NOT NULL,
  `name` longtext DEFAULT NULL,
  `pronunciation_ko` longtext DEFAULT NULL,
  `mobile` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `birth_ymd` longtext DEFAULT NULL,
  `gender` longtext DEFAULT NULL,
  `nationality` longtext DEFAULT NULL,
  `address` longtext DEFAULT NULL,
  `postal_code` varchar(255) DEFAULT NULL,
  `job` longtext DEFAULT NULL,
  `company` longtext DEFAULT NULL,
  `sns` longtext DEFAULT NULL,
  `email` longtext DEFAULT NULL,
  `user_id` longtext DEFAULT NULL,
  `hospital_patient_id` longtext DEFAULT NULL,
  `visitor_ip` longtext DEFAULT NULL,
  `user_agent` longtext DEFAULT NULL,
  `visit_type` longtext DEFAULT NULL,
  `visited_at` datetime DEFAULT current_timestamp(),
  `treated_at` datetime DEFAULT NULL,
  `treatment_amount` double DEFAULT NULL,
  `treatment_discount_rate` double DEFAULT NULL,
  `payment_amount` double DEFAULT NULL,
  `payment_method` longtext DEFAULT NULL,
  `doctor_id` bigint(20) DEFAULT NULL,
  `manager_id` bigint(20) DEFAULT NULL,
  `recruiter_id` bigint(20) DEFAULT NULL,
  `channel` longtext DEFAULT NULL,
  `customer_note` longtext DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customers` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `advertiser_id` bigint(20) NOT NULL,
  `visit_id` bigint(20) DEFAULT NULL,
  `hospital_patient_id` longtext DEFAULT NULL,
  `name` longtext DEFAULT NULL,
  `email` longtext NOT NULL,
  `password_hash` longtext DEFAULT NULL,
  `mobile` varchar(255) DEFAULT NULL,
  `status` varchar(255) DEFAULT 'active',
  `password_reset_required` bigint(20) DEFAULT 1,
  `auto_created` bigint(20) DEFAULT 0,
  `last_login_at` datetime DEFAULT NULL,
  `last_login_ip` longtext DEFAULT NULL,
  `is_deleted` bigint(20) DEFAULT 0,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` longtext DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `doctors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `doctors` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `advertiser_id` bigint(20) NOT NULL,
  `name` longtext NOT NULL,
  `email` longtext NOT NULL,
  `license_no` longtext DEFAULT NULL,
  `specialty` longtext DEFAULT NULL,
  `mobile` varchar(255) DEFAULT NULL,
  `status` varchar(255) DEFAULT 'active',
  `password_hash` longtext DEFAULT NULL,
  `confirm_code_enc` longtext DEFAULT NULL,
  `is_deleted` bigint(20) DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `email_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `template_key` longtext NOT NULL,
  `to_email` longtext NOT NULL,
  `subject` longtext DEFAULT NULL,
  `campaign_id` longtext DEFAULT NULL,
  `advertiser_id` bigint(20) DEFAULT NULL,
  `status` varchar(255) DEFAULT 'sent',
  `error_msg` longtext DEFAULT NULL,
  `sent_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_email_logs_campaign` (`campaign_id`(768))
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `email_verifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_verifications` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `email` longtext NOT NULL,
  `code` longtext NOT NULL,
  `verified` bigint(20) DEFAULT 0,
  `expires_at` datetime NOT NULL,
  `purpose` longtext DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `holidays`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `holidays` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `advertiser_id` bigint(20) DEFAULT NULL,
  `holiday_date` date NOT NULL,
  `name` longtext DEFAULT NULL,
  `day_type` longtext DEFAULT NULL,
  `is_system` bigint(20) DEFAULT 0,
  `created_by` longtext DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `hospital_agency_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hospital_agency_requests` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `hospital_id` bigint(20) NOT NULL,
  `advertiser_id` bigint(20) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `token_hash` varchar(191) NOT NULL,
  `requested_by` varchar(191) DEFAULT NULL,
  `requested_at` datetime DEFAULT current_timestamp(),
  `responded_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  UNIQUE KEY `uq_hospital_agency` (`hospital_id`,`advertiser_id`),
  KEY `fk_har_advertiser` (`advertiser_id`),
  CONSTRAINT `fk_har_advertiser` FOREIGN KEY (`advertiser_id`) REFERENCES `advertisers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_har_hospital` FOREIGN KEY (`hospital_id`) REFERENCES `hospitals` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `hospital_form_fields`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hospital_form_fields` (
  `field_key` varchar(191) NOT NULL,
  `enabled` bigint(20) NOT NULL DEFAULT 1,
  `required` bigint(20) NOT NULL DEFAULT 0,
  `sort_order` bigint(20) NOT NULL DEFAULT 0,
  `updated_at` datetime DEFAULT current_timestamp(),
  `searchable` bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (`field_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `hospitals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hospitals` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `company_name` longtext NOT NULL,
  `company_name_en` varchar(200) DEFAULT NULL,
  `hospital_id` varchar(64) NOT NULL,
  `ceo_name` longtext DEFAULT NULL,
  `business_no` varchar(191) NOT NULL,
  `biz_cert_path` longtext DEFAULT NULL,
  `biz_cert_name` longtext DEFAULT NULL,
  `representative_phone` longtext DEFAULT NULL,
  `address1` longtext DEFAULT NULL,
  `address2` longtext DEFAULT NULL,
  `postal_code` varchar(255) DEFAULT NULL,
  `medical_subjects` longtext DEFAULT NULL,
  `fax` varchar(255) DEFAULT NULL,
  `homepage` longtext DEFAULT NULL,
  `serial_no` varchar(191) NOT NULL,
  `contact_name` longtext DEFAULT NULL,
  `contact_mobile` longtext DEFAULT NULL,
  `contact_email` longtext DEFAULT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'pending',
  `status_reason` longtext DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_hospitals_serial_no` (`serial_no`),
  UNIQUE KEY `idx_hospitals_business_no` (`business_no`),
  UNIQUE KEY `idx_hospitals_hospital_id` (`hospital_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `llm_usage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `llm_usage` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `advertiser_id` bigint(20) NOT NULL,
  `api_type` longtext NOT NULL,
  `prompt_tokens` bigint(20) DEFAULT 0,
  `completion_tokens` bigint(20) DEFAULT 0,
  `total_tokens` bigint(20) DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `login_histories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `login_histories` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_type` enum('advertiser','supervisor','doctor','manager','customer') NOT NULL,
  `user_id` longtext NOT NULL,
  `login_ip` longtext NOT NULL,
  `login_at` datetime DEFAULT current_timestamp(),
  `logout_at` datetime DEFAULT NULL,
  `session_id` longtext DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_login_hist_user` (`user_type`,`user_id`(191))
) ENGINE=InnoDB AUTO_INCREMENT=62 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `managers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `managers` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `advertiser_id` bigint(20) NOT NULL,
  `name` longtext NOT NULL,
  `email` longtext NOT NULL,
  `department` longtext DEFAULT NULL,
  `position` longtext DEFAULT NULL,
  `mobile` varchar(255) DEFAULT NULL,
  `status` varchar(255) DEFAULT 'active',
  `password_hash` longtext DEFAULT NULL,
  `confirm_code_enc` longtext DEFAULT NULL,
  `is_deleted` bigint(20) DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notices` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `advertiser_id` bigint(20) NOT NULL,
  `title` longtext NOT NULL,
  `content` longtext DEFAULT NULL,
  `supported_languages` varchar(255) NOT NULL DEFAULT 'ko,en',
  `translations` longtext DEFAULT NULL,
  `is_pinned` bigint(20) DEFAULT 0,
  `view_count` bigint(20) DEFAULT 0,
  `is_deleted` bigint(20) DEFAULT 0,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` longtext DEFAULT NULL,
  `created_by` longtext DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `recruiters`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `recruiters` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `advertiser_id` bigint(20) NOT NULL,
  `company_name` longtext NOT NULL,
  `business_no` varchar(255) NOT NULL,
  `ceo_name` longtext DEFAULT NULL,
  `biz_type` longtext DEFAULT NULL,
  `biz_category` longtext DEFAULT NULL,
  `address1` longtext DEFAULT NULL,
  `address2` longtext DEFAULT NULL,
  `postal_code` varchar(255) DEFAULT NULL,
  `contact_name` longtext DEFAULT NULL,
  `contact_email` longtext DEFAULT NULL,
  `contact_mobile` longtext DEFAULT NULL,
  `contact_phone` longtext DEFAULT NULL,
  `recruiter_license_no` longtext DEFAULT NULL,
  `surety_bond_no` longtext DEFAULT NULL,
  `commission_rate` double DEFAULT 0,
  `biz_cert_name` longtext DEFAULT NULL,
  `biz_cert_path` longtext DEFAULT NULL,
  `recruiter_cert_name` longtext DEFAULT NULL,
  `recruiter_cert_path` longtext DEFAULT NULL,
  `surety_cert_name` longtext DEFAULT NULL,
  `surety_cert_path` longtext DEFAULT NULL,
  `status` varchar(255) DEFAULT 'pending',
  `status_reason` longtext DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `approved_by` longtext DEFAULT NULL,
  `is_deleted` bigint(20) DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `resource_images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `resource_images` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `advertiser_id` bigint(20) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `stored_name` varchar(255) NOT NULL,
  `image_url` varchar(500) NOT NULL,
  `description` text DEFAULT NULL,
  `tags` text DEFAULT NULL,
  `language` varchar(10) NOT NULL DEFAULT 'en',
  `mime_type` varchar(100) DEFAULT NULL,
  `size_bytes` bigint(20) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_resource_images_owner_created` (`advertiser_id`,`created_at`),
  KEY `idx_resource_images_language` (`advertiser_id`,`language`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `session_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `expires` int(11) unsigned NOT NULL,
  `data` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `system_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_config` (
  `config_key` varchar(191) NOT NULL,
  `config_value` longtext NOT NULL,
  `description` longtext DEFAULT NULL,
  `updated_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 DROP FUNCTION IF EXISTS `fn_decrypt` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`advertiser`@`%` FUNCTION `fn_decrypt`(p_data TEXT) RETURNS text CHARSET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci
    DETERMINISTIC
RETURN IF(p_data IS NULL OR p_data = '', p_data,
          CONVERT(AES_DECRYPT(FROM_BASE64(p_data), SHA2('monorama_adv_enc_key_2024_secret!', 256)) USING utf8mb4)) ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `fn_encrypt` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`advertiser`@`%` FUNCTION `fn_encrypt`(p_data TEXT) RETURNS text CHARSET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci
    DETERMINISTIC
RETURN IF(p_data IS NULL OR p_data = '', p_data,
          TO_BASE64(AES_ENCRYPT(p_data, SHA2('monorama_adv_enc_key_2024_secret!', 256)))) ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
