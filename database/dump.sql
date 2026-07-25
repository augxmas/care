/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19-12.2.2-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: advertise
-- ------------------------------------------------------
-- Server version	12.2.2-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Current Database: `advertise`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `advertise` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci */;

USE `advertise`;

--
-- Table structure for table `advertisers`
--

DROP TABLE IF EXISTS `advertisers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `advertisers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_name` varchar(200) NOT NULL COMMENT '회사명',
  `business_no` varchar(20) NOT NULL COMMENT '사업자등록번호',
  `ceo_name` text DEFAULT NULL COMMENT '대표자명(암호화)',
  `address1` varchar(500) NOT NULL COMMENT '주소1',
  `address2` varchar(500) DEFAULT NULL COMMENT '주소2',
  `postal_code` varchar(10) NOT NULL COMMENT '우편번호',
  `contact_name` text DEFAULT NULL COMMENT '담당자명(암호화)',
  `contact_mobile` text DEFAULT NULL COMMENT '담당자 모바일(암호화)',
  `contact_phone` text DEFAULT NULL COMMENT '담당자 일반전화(암호화)',
  `contact_email` text DEFAULT NULL COMMENT '담당자 이메일(암호화)',
  `email_hash` varchar(64) NOT NULL COMMENT '이메일 해시(로그인 조회용)',
  `password_hash` varchar(255) NOT NULL COMMENT '비밀번호(bcrypt)',
  `push_consent` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Push 알림 동의',
  `email_consent` tinyint(1) NOT NULL DEFAULT 0 COMMENT '이메일 수신 동의',
  `terms_consent` tinyint(1) NOT NULL DEFAULT 0 COMMENT '이용약관 동의',
  `privacy_consent` tinyint(1) NOT NULL DEFAULT 0 COMMENT '개인정보 동의',
  `biz_cert_path` varchar(500) DEFAULT NULL COMMENT '사업자등록증명원 파일경로',
  `biz_cert_name` varchar(255) DEFAULT NULL COMMENT '사업자등록증명원 원본파일명',
  `status` enum('pending','approved','rejected','terminated') NOT NULL DEFAULT 'pending' COMMENT '상태',
  `status_reason` text DEFAULT NULL COMMENT '상태변경 사유',
  `bank_account` text DEFAULT NULL COMMENT '계좌번호(암호화)',
  `email_verified` tinyint(1) NOT NULL DEFAULT 0 COMMENT '이메일 인증여부',
  `last_login_ip` varchar(45) DEFAULT NULL COMMENT '마지막 로그인 IP',
  `last_login_at` datetime DEFAULT NULL COMMENT '마지막 로그인 시각',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `password_reset_required` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `business_no` (`business_no`),
  UNIQUE KEY `email_hash` (`email_hash`),
  KEY `idx_advertisers_status` (`status`),
  KEY `idx_advertisers_email` (`email_hash`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='광고주';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `advertisers`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `advertisers` WRITE;
/*!40000 ALTER TABLE `advertisers` DISABLE KEYS */;
INSERT INTO `advertisers` (`id`, `company_name`, `business_no`, `ceo_name`, `address1`, `address2`, `postal_code`, `contact_name`, `contact_mobile`, `contact_phone`, `contact_email`, `email_hash`, `password_hash`, `push_consent`, `email_consent`, `terms_consent`, `privacy_consent`, `biz_cert_path`, `biz_cert_name`, `status`, `status_reason`, `bank_account`, `email_verified`, `last_login_ip`, `last_login_at`, `created_at`, `updated_at`, `password_reset_required`) VALUES (1,'(주)모노라마','277-86-00185','f1ajBhFdYr81FdkQFbszAQ==','서울 강서구 마곡중앙로 143','','07797','f1ajBhFdYr81FdkQFbszAQ==','sBbJ2mARR3Oi0G0scGusXg==','AXunskk1EUutuGTS8NVDlg==','cCjV36AqRl//lIqbx1OA67RtnpOUgkgqc/7opgjP6UY=','7fe9695f838937d16c1d27bbd6a60b6bc6acc83ab182e0e8625ee01b4aa701db','$2b$12$czCx0INJ5ZO7TMVWc9Qda.iquBJ0Q7jdFEk/hTFGQZvmRWWzLbpsK',1,1,1,1,'C:\\proj\\advertiser\\uploads\\biz-certs\\93a598a2-cfe5-4177-9a81-443d93f8e6d7.pdf','ì¬ììë±ë¡ì¦ëª.pdf','approved',NULL,NULL,1,'::1','2026-05-17 18:32:11','2026-05-17 14:19:25','2026-05-17 18:32:11',0);
/*!40000 ALTER TABLE `advertisers` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `campaign_sequences`
--

DROP TABLE IF EXISTS `campaign_sequences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `campaign_sequences` (
  `seq_date` date NOT NULL,
  `last_seq` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='캠페인 ID 일련번호';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `campaign_sequences`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `campaign_sequences` WRITE;
/*!40000 ALTER TABLE `campaign_sequences` DISABLE KEYS */;
INSERT INTO `campaign_sequences` (`seq_date`, `last_seq`) VALUES ('2026-05-17',2);
/*!40000 ALTER TABLE `campaign_sequences` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `campaigns`
--

DROP TABLE IF EXISTS `campaigns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `campaigns` (
  `id` varchar(12) NOT NULL COMMENT '캠페인ID (yymmdd_dddd)',
  `advertiser_id` int(11) NOT NULL,
  `campaign_name` varchar(300) NOT NULL COMMENT '캠페인명',
  `description` text DEFAULT NULL COMMENT '캠페인 설명',
  `discount_rate` decimal(5,2) NOT NULL DEFAULT 0 COMMENT '할인율(%)',
  `has_image` tinyint(1) NOT NULL DEFAULT 0,
  `has_html` tinyint(1) NOT NULL DEFAULT 0,
  `has_youtube` tinyint(1) NOT NULL DEFAULT 0,
  `image_url` varchar(1000) DEFAULT NULL COMMENT '이미지 URL',
  `image_path` varchar(500) DEFAULT NULL COMMENT '이미지 파일 경로',
  `image_filename` varchar(255) DEFAULT NULL COMMENT '이미지 원본파일명',
  `image_width` int(11) DEFAULT NULL COMMENT '이미지 가로(px)',
  `image_height` int(11) DEFAULT NULL COMMENT '이미지 세로(px)',
  `html_url` varchar(1000) DEFAULT NULL COMMENT 'HTML URL',
  `html_path` varchar(500) DEFAULT NULL COMMENT 'HTML 파일 경로',
  `html_filename` varchar(255) DEFAULT NULL COMMENT 'HTML 원본파일명',
  `youtube_url` varchar(1000) DEFAULT NULL COMMENT 'YouTube URL',
  `from_date` date NOT NULL COMMENT '광고 시작일',
  `to_date` date NOT NULL COMMENT '광고 종료일',
  `ad_days` int(11) NOT NULL DEFAULT 0 COMMENT '광고일수',
  `base_fee` decimal(15,0) NOT NULL DEFAULT 0 COMMENT '기본 광고료',
  `vat` decimal(15,0) NOT NULL DEFAULT 0 COMMENT '부가세',
  `total_fee` decimal(15,0) NOT NULL DEFAULT 0 COMMENT '총 광고료',
  `status` enum('입금전','입금확인','광고중','광고종료','취소') NOT NULL DEFAULT '입금전',
  `quotation_sent_at` datetime DEFAULT NULL COMMENT '견적서 발송 시각',
  `quotation_token` varchar(64) DEFAULT NULL COMMENT '견적서 읽음 추적 토큰',
  `quotation_read_at` datetime DEFAULT NULL COMMENT '견적서 읽음 시각',
  `payment_confirmed_at` datetime DEFAULT NULL COMMENT '입금 확인 시각',
  `payment_confirmed_by` varchar(100) DEFAULT NULL COMMENT '입금 확인자',
  `files_backed_up` tinyint(1) NOT NULL DEFAULT 0 COMMENT '파일 백업 완료여부',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `approved_at` datetime DEFAULT NULL COMMENT '승인일 (광고중 전환 시각)',
  `approved_by` varchar(100) DEFAULT NULL COMMENT '승인자 (supervisor 또는 batch)',
  `cancelled_at` datetime DEFAULT NULL COMMENT '취소일',
  `cancelled_by` varchar(100) DEFAULT NULL COMMENT '취소자 (supervisor, advertiser 또는 batch)',
  PRIMARY KEY (`id`),
  KEY `idx_campaigns_advertiser` (`advertiser_id`),
  KEY `idx_campaigns_status` (`status`),
  KEY `idx_campaigns_dates` (`from_date`,`to_date`),
  CONSTRAINT `1` FOREIGN KEY (`advertiser_id`) REFERENCES `advertisers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='캠페인';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `campaigns`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `campaigns` WRITE;
/*!40000 ALTER TABLE `campaigns` DISABLE KEYS */;
INSERT INTO `campaigns` (`id`, `advertiser_id`, `campaign_name`, `description`, `has_image`, `has_html`, `has_youtube`, `image_url`, `image_path`, `image_filename`, `image_width`, `image_height`, `html_url`, `html_path`, `html_filename`, `youtube_url`, `from_date`, `to_date`, `ad_days`, `base_fee`, `vat`, `total_fee`, `status`, `quotation_sent_at`, `quotation_token`, `quotation_read_at`, `payment_confirmed_at`, `payment_confirmed_by`, `files_backed_up`, `created_at`, `updated_at`, `approved_at`, `approved_by`, `cancelled_at`, `cancelled_by`) VALUES ('260517_0001',1,'석가탄신일_기념','향수판매',1,0,1,'/uploads/active/1/260517_0001/1ae34769-8fee-4b83-a916-8aace1123f29.jpg','C:\\proj\\advertiser\\uploads\\active\\1\\260517_0001\\1ae34769-8fee-4b83-a916-8aace1123f29.jpg','31069b9b-8e13-11e9-ac69-48df37269fd0_05.jpg',NULL,NULL,NULL,NULL,NULL,'https://www.youtube.com/watch?v=f_K7M2a8sJo','2026-05-18','2026-05-23',6,12000,1200,13200,'취소','2026-05-17 15:08:33','f4f00c1d-6ad6-4391-ac2d-a97227efc9d1',NULL,'2026-05-17 15:49:40','supervisor',0,'2026-05-17 15:08:33','2026-05-17 18:57:11','2026-05-17 17:24:29','supervisor','2026-05-17 18:57:11','supervisor'),
('260517_0002',1,'5월 가족의 날 ','가족에게 주는 설명',1,0,0,'/uploads/active/1/260517_0002/03f61245-378d-42be-8e42-6c1c8c925bbc.jpg','C:\\proj\\advertiser\\uploads\\active\\1\\260517_0002\\03f61245-378d-42be-8e42-6c1c8c925bbc.jpg','16595-1600x900.jpg',1600,900,NULL,NULL,NULL,NULL,'2026-05-20','2026-05-24',5,5000,500,5500,'취소','2026-05-17 17:13:31','8ca37726-0d84-4358-8dbb-1de23e0d15b9',NULL,'2026-05-17 17:28:38','supervisor',0,'2026-05-17 17:13:31','2026-05-17 17:29:29','2026-05-17 17:29:00','supervisor','2026-05-17 17:29:29','supervisor');
/*!40000 ALTER TABLE `campaigns` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `email_logs`
--

DROP TABLE IF EXISTS `email_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `template_key` varchar(100) NOT NULL COMMENT '템플릿 키',
  `to_email` varchar(255) NOT NULL COMMENT '수신자',
  `subject` varchar(500) DEFAULT NULL COMMENT '제목',
  `campaign_id` varchar(12) DEFAULT NULL COMMENT '관련 캠페인 ID',
  `advertiser_id` int(11) DEFAULT NULL COMMENT '관련 광고주 ID',
  `status` enum('sent','failed') NOT NULL DEFAULT 'sent',
  `error_msg` text DEFAULT NULL COMMENT '발송 실패 메세지',
  `sent_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_email_logs_campaign` (`campaign_id`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='이메일 발송 이력';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `email_logs`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `email_logs` WRITE;
/*!40000 ALTER TABLE `email_logs` DISABLE KEYS */;
INSERT INTO `email_logs` (`id`, `template_key`, `to_email`, `subject`, `campaign_id`, `advertiser_id`, `status`, `error_msg`, `sent_at`) VALUES (1,'email_verification','kimch@mono-rama.com','[모노라마] 이메일 본인확인 코드',NULL,NULL,'failed','Invalid login: 535 5.7.1 Username and Password not accepted MhFMV2YSQAOGOrDI0-dwgg - nsmtp','2026-05-17 14:04:33'),
(2,'email_verification','kimch@mono-rama.com','[모노라마] 이메일 본인확인 코드',NULL,NULL,'failed','Invalid login: 535 5.7.1 Username and Password not accepted eFRcYoexR7an+J7RyfEbqw - nsmtp','2026-05-17 14:11:06'),
(3,'email_verification','kimch@mono-rama.com','[모노라마] 이메일 본인확인 코드',NULL,NULL,'failed','Invalid login: 535 5.7.1 Username and Password not accepted KfJsSFl8Tiymv382+ADyiw - nsmtp','2026-05-17 14:12:07'),
(4,'email_verification','augxmas@gmail.com','[모노라마] 이메일 본인확인 코드',NULL,NULL,'failed','Invalid login: 535 5.7.1 Username and Password not accepted -A-0p8eVRm63hhe-bVyvTw - nsmtp','2026-05-17 14:13:49'),
(5,'email_verification','augxmas@gmail.com','[모노라마] 이메일 본인확인 코드',NULL,NULL,'sent',NULL,'2026-05-17 14:17:03'),
(6,'registration_submitted','augxmas@gmail.com','[모노라마] 광고주 회원가입 신청이 접수되었습니다',NULL,1,'sent',NULL,'2026-05-17 14:19:25'),
(7,'registration_submitted_supervisor','kimch@monorama.kr','[모노라마] 새 광고주 회원가입 신청 - (주)모노라마',NULL,1,'sent',NULL,'2026-05-17 14:19:26'),
(8,'registration_approved','augxmas@gmail.com','[모노라마] 광고주 회원가입이 승인되었습니다',NULL,1,'sent',NULL,'2026-05-17 14:45:06'),
(9,'quotation_advertiser','augxmas@gmail.com','[모노라마] 캠페인 견적서 - 석가탄신일_기념','260517_0001',1,'sent',NULL,'2026-05-17 15:08:33'),
(10,'quotation_supervisor','kimch@monorama.kr','[모노라마 관리자] 새 캠페인 등록 알림 - 석가탄신일_기념 ((주)모노라마)','260517_0001',1,'sent',NULL,'2026-05-17 15:08:34'),
(11,'temp_password','augxmas@gmail.com','[모노라마] 임시비밀번호 안내',NULL,1,'sent',NULL,'2026-05-17 16:32:46'),
(12,'quotation_advertiser','augxmas@gmail.com','[모노라마] 캠페인 견적서 - 5월 가족의 날 ','260517_0002',1,'sent',NULL,'2026-05-17 17:13:32'),
(13,'quotation_supervisor','kimch@monorama.kr','[모노라마 관리자] 새 캠페인 등록 알림 - 5월 가족의 날  ((주)모노라마)','260517_0002',1,'sent',NULL,'2026-05-17 17:13:32'),
(14,'campaign_started_advertiser','augxmas@gmail.com','[모노라마] 광고가 시작되었습니다 - 석가탄신일_기념','260517_0001',NULL,'sent',NULL,'2026-05-17 17:24:30'),
(15,'payment_confirmed_advertiser','augxmas@gmail.com','[모노라마] 입금이 확인되었습니다 - 5월 가족의 날 ','260517_0002',NULL,'sent',NULL,'2026-05-17 17:28:39'),
(16,'campaign_started_advertiser','augxmas@gmail.com','[모노라마] 광고가 시작되었습니다 - 5월 가족의 날 ','260517_0002',NULL,'sent',NULL,'2026-05-17 17:29:01'),
(17,'campaign_cancelled_advertiser','augxmas@gmail.com','[모노라마] 캠페인이 취소되었습니다 - 5월 가족의 날 ','260517_0002',NULL,'sent',NULL,'2026-05-17 17:29:29'),
(18,'campaign_cancelled_advertiser','augxmas@gmail.com','[모노라마] 캠페인이 취소되었습니다 - 석가탄신일_기념','260517_0001',NULL,'sent',NULL,'2026-05-17 18:57:12');
/*!40000 ALTER TABLE `email_logs` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `email_verifications`
--

DROP TABLE IF EXISTS `email_verifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_verifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL COMMENT '인증 대상 이메일',
  `code` varchar(6) NOT NULL COMMENT '6자리 인증코드',
  `verified` tinyint(1) NOT NULL DEFAULT 0,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='이메일 인증코드';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `email_verifications`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `email_verifications` WRITE;
/*!40000 ALTER TABLE `email_verifications` DISABLE KEYS */;
INSERT INTO `email_verifications` (`id`, `email`, `code`, `verified`, `expires_at`, `created_at`) VALUES (1,'kimch@mono-rama.com','258477',0,'2026-05-17 14:14:33','2026-05-17 14:04:33'),
(2,'kimch@mono-rama.com','807533',0,'2026-05-17 14:21:05','2026-05-17 14:11:05'),
(3,'kimch@mono-rama.com','326629',0,'2026-05-17 14:22:06','2026-05-17 14:12:06'),
(4,'augxmas@gmail.com','897337',0,'2026-05-17 14:23:49','2026-05-17 14:13:49'),
(5,'augxmas@gmail.com','436719',1,'2026-05-17 14:27:02','2026-05-17 14:17:02');
/*!40000 ALTER TABLE `email_verifications` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `login_histories`
--

DROP TABLE IF EXISTS `login_histories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `login_histories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_type` enum('advertiser','supervisor') NOT NULL,
  `user_id` varchar(100) NOT NULL COMMENT '광고주 id 또는 supervisor',
  `login_ip` varchar(45) NOT NULL,
  `login_at` datetime NOT NULL DEFAULT current_timestamp(),
  `logout_at` datetime DEFAULT NULL COMMENT '로그아웃 시각',
  `session_id` varchar(128) DEFAULT NULL COMMENT '세션 ID',
  PRIMARY KEY (`id`),
  KEY `idx_login_hist_user` (`user_type`,`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='로그인 이력';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `login_histories`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `login_histories` WRITE;
/*!40000 ALTER TABLE `login_histories` DISABLE KEYS */;
INSERT INTO `login_histories` (`id`, `user_type`, `user_id`, `login_ip`, `login_at`, `logout_at`, `session_id`) VALUES (1,'supervisor','supervisor','::1','2026-05-17 14:00:09','2026-05-17 14:04:26','NSwWIWb9IDeXhj9meB9nDCiQMRZbuHFv'),
(2,'supervisor','supervisor','::1','2026-05-17 14:22:05','2026-05-17 14:34:00','9HZjvqW1msq2IbGy0QWK6VJTllGyiC4D'),
(3,'supervisor','supervisor','::1','2026-05-17 14:29:32','2026-05-17 14:35:33','scBTyvxyI63xTirh3iv2gL3tHDSQPEh5'),
(4,'supervisor','supervisor','::1','2026-05-17 14:42:14','2026-05-17 14:50:00','DcJ9j1oAT7rKjDaPpXs2fwVTsY0csVpp'),
(5,'advertiser','1','::1','2026-05-17 14:45:31','2026-05-17 15:25:00','zgD21qnOn8ydpGRQ3NPg7y_4n281w05G'),
(6,'advertiser','1','::1','2026-05-17 15:06:50','2026-05-17 15:13:00','EgBoif2bG1hXUwEpYRZZDm04vpzRS164'),
(7,'supervisor','supervisor','::1','2026-05-17 15:10:07','2026-05-17 15:25:00','zgD21qnOn8ydpGRQ3NPg7y_4n281w05G'),
(8,'advertiser','1','::1','2026-05-17 15:42:45','2026-05-17 16:00:00','GsttpbIbiFkt1JpfOEZWVeRYTtaOfsvV'),
(9,'supervisor','supervisor','::1','2026-05-17 15:48:55','2026-05-17 16:14:07','OYVrteBkUq5_ZHm5Am5-o2pA7QnZBilo'),
(10,'advertiser','1','::1','2026-05-17 16:20:00','2026-05-17 16:32:02','H_ijw4PtQPD-qdXfPDS5kJZgcDKIrwUR'),
(11,'advertiser','1','::1','2026-05-17 16:32:23','2026-05-17 16:32:29','tjV0o6BmyUhFWV4QBMzAjLX-koLmaMis'),
(12,'advertiser','1','::1','2026-05-17 16:33:20','2026-05-17 16:44:24','3pUdTL19eTVJ2apzPQdgofSYLCj-Yq9A'),
(13,'advertiser','1','::1','2026-05-17 16:44:47','2026-05-17 16:57:00','NYyYwOBPxz0s0FhGPkMbUWoK__dOlJr_'),
(14,'supervisor','supervisor','::1','2026-05-17 16:45:30','2026-05-17 17:07:00','Cs7dZA9KbRemo7WLrH8iU-KzSAII4CJg'),
(15,'advertiser','1','::1','2026-05-17 17:03:11','2026-05-17 17:07:42','v-5xgWkyPGROqudh5VGhS1-DxtBKwHjo'),
(16,'advertiser','1','::1','2026-05-17 17:10:38','2026-05-17 17:21:39','prlzGt3KGTu79m5bkJkpwZXDSJxJqOh6'),
(17,'supervisor','supervisor','::1','2026-05-17 17:15:57','2026-05-17 17:22:00','FTkhX8M-8yqSPCwDUH_1JjmMAJvZd77T'),
(18,'supervisor','supervisor','::1','2026-05-17 17:23:03','2026-05-17 17:36:15','7sVHaw4sH7oxZAqFsL2_Gqt87TjRs4b0'),
(19,'supervisor','supervisor','::1','2026-05-17 18:31:24','2026-05-17 18:55:00','9wjQtuQ1QbvCqaAh68MwtainDJKZj6sr'),
(20,'advertiser','1','::1','2026-05-17 18:32:11','2026-05-17 18:37:00','SIZGj_tdQqNuW2bCnRkNmKV7Ady-nbna'),
(21,'supervisor','supervisor','::1','2026-05-17 18:56:40','2026-05-17 19:03:00','DBPtGEIRCeTHdAxtusw7Q_79_2Ke4WuB');
/*!40000 ALTER TABLE `login_histories` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `session_id` varchar(128) NOT NULL,
  `expires` int(10) unsigned NOT NULL,
  `data` mediumtext DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='세션';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sessions`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sessions` WRITE;
/*!40000 ALTER TABLE `sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `system_config`
--

DROP TABLE IF EXISTS `system_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_config` (
  `config_key` varchar(100) NOT NULL,
  `config_value` text NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='시스템 설정';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `system_config`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `system_config` WRITE;
/*!40000 ALTER TABLE `system_config` DISABLE KEYS */;
INSERT INTO `system_config` (`config_key`, `config_value`, `description`, `updated_at`) VALUES ('ad_price_per_day','1000','광고 유형별 1일 광고료(원)','2026-05-17 13:54:38'),
('company_account','000-000-000000','은행계좌번호','2026-05-17 13:54:38'),
('company_bank','국민은행','은행명','2026-05-17 13:54:38'),
('company_biz_no','277-86-00185','사업자등록번호','2026-05-17 13:54:38'),
('company_ceo','김창호','대표이사','2026-05-17 13:54:38'),
('company_name','(주)모노라마','회사명','2026-05-17 13:54:38'),
('supervisor_email','kimch@monorama.kr','Supervisor 이메일','2026-05-17 13:54:38'),
('tax_email','kimch@monorama.kr','세무담당자 이메일','2026-05-17 13:54:38'),
('vat_rate','0.1','부가세율','2026-05-17 13:54:38');
/*!40000 ALTER TABLE `system_config` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Dumping routines for database 'advertise'
--
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP FUNCTION IF EXISTS `fn_decrypt` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
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
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
/*!50003 DROP FUNCTION IF EXISTS `fn_encrypt` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
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
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2026-05-17 19:11:11
