
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

LOCK TABLES `advertisers` WRITE;
/*!40000 ALTER TABLE `advertisers` DISABLE KEYS */;
INSERT INTO `advertisers` VALUES (1,'(주)모노라마',NULL,'277-86-00185','f1ajBhFdYr81FdkQFbszAQ==','서울 강서구 마곡중앙로 143','','07797','f1ajBhFdYr81FdkQFbszAQ==','sBbJ2mARR3Oi0G0scGusXg==','AXunskk1EUutuGTS8NVDlg==','cCjV36AqRl//lIqbx1OA67RtnpOUgkgqc/7opgjP6UY=','7fe9695f838937d16c1d27bbd6a60b6bc6acc83ab182e0e8625ee01b4aa701db','$2b$12$zcQaLJYxCfmMrLZh/LoIw.V39lDcngV8l3KdEJjbRFkV3epHnONsO',1,1,1,1,'','','approved',NULL,NULL,1,'::1','2026-05-17 18:32:11','2026-05-17 14:19:25','2026-05-17 18:32:11',0,NULL,NULL,NULL,NULL,'20260517_0001','2026-05-17 18:32:11',NULL),(3,'비노','','2874800521','kZoR+RB41nMnw1Lzj7pXrw==','','','','kZoR+RB41nMnw1Lzj7pXrw==','','','vqm3SM/A/u2mq5E4mRSBCwEEi6n0urbXz7twbGikbZM=','8cef0d7ecb0fe3c22a59ed631da09b9e630f616207b9e2c6ace5ccd1386db528','$2b$12$Jnh8acwR8lzAdv1T6Nfr/u7ByBgY0QcS9t0ULD2rcWvFKhuWiU16W',0,0,1,1,NULL,NULL,'approved',NULL,'',1,'58.10.12.80','2026-08-02 13:33:35','2026-07-25 16:54:10','2026-08-01 17:22:43',0,NULL,NULL,NULL,NULL,'20260725_0001','2026-07-25 16:54:53',''),(4,'씨제이',NULL,'123-12-12345','k1q4cocEbCOGX9xgaUHbZw==','경기 성남시 분당구 대왕판교로606번길 45','101동','13524','f1ajBhFdYr81FdkQFbszAQ==','sBbJ2mARR3Oi0G0scGusXg==','EOKwt+UT3OwbxmBfEWuW+g==','ivUYiGR2vyrzvtcf6JmKkqOJ7OWSdtRRCUrXyS4XriI=','02234413b1ed7311d041bc79025a561388a9fa20430b4a3b142f1a48aa675621','$2b$12$ZqgR19JiF9pgaUX8j1RLSuNRxtdyDuoU.vMdH0pR0zbxf7Vhw6Vre',1,1,1,1,'C:\\proj\\care\\uploads\\biz-certs\\40b4baa7-dd2d-405e-bc5b-94f99dbea138.pdf','ì¬ììë±ë¡ì¦(ê³µì ì¤í¼ì¤ë¹ì¦ì´ì¦ìí¸ì¬ë¬´ì¤).pdf','approved',NULL,NULL,1,'::1','2026-07-26 08:57:30','2026-07-26 08:42:05','2026-07-26 08:50:42',0,NULL,NULL,NULL,NULL,NULL,'2026-07-26 08:50:42',NULL);
/*!40000 ALTER TABLE `advertisers` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `agency_form_fields` WRITE;
/*!40000 ALTER TABLE `agency_form_fields` DISABLE KEYS */;
INSERT INTO `agency_form_fields` VALUES ('address1',1,1,0,6,'2026-07-25 19:52:05'),('address2',1,0,0,7,'2026-07-25 19:52:05'),('bank_account',1,0,1,13,'2026-07-25 19:52:05'),('bank_name',1,0,1,12,'2026-07-25 19:52:05'),('biz_cert',1,0,0,4,'2026-07-25 19:52:05'),('business_no',1,1,1,3,'2026-07-25 19:52:05'),('ceo_name',1,1,0,2,'2026-07-25 19:52:05'),('company_name',1,1,1,1,'2026-07-25 19:52:05'),('company_name_en',1,0,1,2,'2026-07-26 09:52:43'),('contact_email',1,1,1,11,'2026-07-25 19:52:05'),('contact_mobile',1,1,0,10,'2026-07-25 19:52:05'),('contact_name',1,1,0,9,'2026-07-25 19:52:05'),('contact_phone',1,1,0,5,'2026-07-25 19:52:05'),('postal_code',1,1,0,8,'2026-07-25 19:52:05');
/*!40000 ALTER TABLE `agency_form_fields` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `appointments` WRITE;
/*!40000 ALTER TABLE `appointments` DISABLE KEYS */;
/*!40000 ALTER TABLE `appointments` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `campaign_sequences` WRITE;
/*!40000 ALTER TABLE `campaign_sequences` DISABLE KEYS */;
INSERT INTO `campaign_sequences` VALUES ('2026-05-17',2),('2026-08-02',2);
/*!40000 ALTER TABLE `campaign_sequences` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `campaigns` WRITE;
/*!40000 ALTER TABLE `campaigns` DISABLE KEYS */;
INSERT INTO `campaigns` VALUES ('260517_0001',1,'?????_??','????',0,1,0,1,'/uploads/active/1/260517_0001/1ae34769-8fee-4b83-a916-8aace1123f29.jpg','C:\\proj\\advertiser\\uploads\\active\\1\\260517_0001\\1ae34769-8fee-4b83-a916-8aace1123f29.jpg','31069b9b-8e13-11e9-ac69-48df37269fd0_05.jpg',NULL,NULL,NULL,NULL,NULL,'https://www.youtube.com/watch?v=f_K7M2a8sJo','','','','2026-05-18','2026-05-23',6,12000,1200,13200,'??','2026-05-17 15:08:33','f4f00c1d-6ad6-4391-ac2d-a97227efc9d1',NULL,'2026-05-17 15:49:40','supervisor',0,'2026-05-17 15:08:33','2026-05-17 18:57:11','2026-05-17 17:24:29','supervisor','2026-05-17 18:57:11','supervisor',0,NULL,NULL),('260517_0002',1,'5? ??? ? ','???? ?? ??',0,1,0,0,'/uploads/active/1/260517_0002/03f61245-378d-42be-8e42-6c1c8c925bbc.jpg','C:\\proj\\advertiser\\uploads\\active\\1\\260517_0002\\03f61245-378d-42be-8e42-6c1c8c925bbc.jpg','16595-1600x900.jpg',1600,900,NULL,NULL,NULL,NULL,'','','','2026-05-20','2026-05-24',5,5000,500,5500,'??','2026-05-17 17:13:31','8ca37726-0d84-4358-8dbb-1de23e0d15b9',NULL,'2026-05-17 17:28:38','supervisor',0,'2026-05-17 17:13:31','2026-05-17 17:29:29','2026-05-17 17:29:00','supervisor','2026-05-17 17:29:29','supervisor',0,NULL,NULL),('260802_0002',3,'모즈 클릭닉 태국 최초 회원 모집 이벤트','모즈 클릭닉 태국 최초 회원 모집 이벤트로서 8월 - 9월 한달간 진행. 모집된 인원은 특별 혜택을 줄 예정임.',10,1,0,0,'/uploads/active/3/library/1b40731a-2a78-4f28-8996-cf5eeaa8269b.png',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'','','','2026-08-04','2026-09-03',31,0,0,0,'입금전',NULL,NULL,NULL,NULL,NULL,0,'2026-08-02 12:24:29','2026-08-02 12:24:29',NULL,NULL,NULL,NULL,0,'nationality,name,gender,birth_ymd,mobile,email,sns','{\"__successMessage\":\"\",\"__languages\":[\"ko\",\"th\",\"en\"],\"nationality\":{\"hidden\":false,\"required\":true,\"defaultValue\":\"\",\"placeholder\":\"\"},\"name\":{\"hidden\":false,\"required\":true,\"defaultValue\":\"\",\"placeholder\":\"\"},\"gender\":{\"hidden\":false,\"required\":true,\"defaultValue\":\"\",\"placeholder\":\"\"},\"birth_ymd\":{\"hidden\":false,\"required\":true,\"defaultValue\":\"\",\"placeholder\":\"\"},\"mobile\":{\"hidden\":false,\"required\":true,\"defaultValue\":\"\",\"placeholder\":\"\"},\"email\":{\"hidden\":false,\"required\":true,\"defaultValue\":\"\",\"placeholder\":\"\"},\"sns\":{\"hidden\":false,\"required\":false,\"defaultValue\":\"\",\"placeholder\":\"\"},\"__localizedAssets\":{\"ko\":{\"image_url\":\"\",\"image_filename\":\"\",\"html_url\":\"\",\"html_filename\":\"\",\"youtube_url\":\"\"},\"th\":{\"image_url\":\"/uploads/active/3/library/1b40731a-2a78-4f28-8996-cf5eeaa8269b.png\",\"image_filename\":\"\",\"html_url\":\"\",\"html_filename\":\"\",\"youtube_url\":\"\"},\"en\":{\"image_url\":\"\",\"image_filename\":\"\",\"html_url\":\"\",\"html_filename\":\"\",\"youtube_url\":\"\"}},\"__localizedText\":{\"th\":{\"campaign_name\":\"อีเวนต์รับสมัครสมาชิกคนแรกของมอส คลินิก ประเทศไทย\",\"description\":\"เป็นกิจกรรมรับสมัครสมาชิกครั้งแรกของ Moz Clinic ประเทศไทย จัดขึ้นเป็นเวลาหนึ่งเดือนระหว่างเดือนสิงหาคม - กันยายน ผู้ที่ได้รับการรับสมัครจะได้รับสิทธิพิเศษ\"},\"en\":{\"campaign_name\":\"Moz Clinic Thailand\'s first membership recruitment event\",\"description\":\"As the first Moz Clinic Thailand membership recruitment event, it will run for one month from August to September. Special benefits will be provided to those recruited.\"},\"ko\":{\"campaign_name\":\"모즈 클릭닉 태국 최초 회원 모집 이벤트\",\"description\":\"모즈 클릭닉 태국 최초 회원 모집 이벤트로서 8월 - 9월 한달간 진행. 모집된 인원은 특별 혜택을 줄 예정임.\"}}}');
/*!40000 ALTER TABLE `campaigns` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `chat_attachments` WRITE;
/*!40000 ALTER TABLE `chat_attachments` DISABLE KEYS */;
/*!40000 ALTER TABLE `chat_attachments` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `chat_conversations` WRITE;
/*!40000 ALTER TABLE `chat_conversations` DISABLE KEYS */;
INSERT INTO `chat_conversations` VALUES (1,3,1,'augxmas@gmail.com',NULL,NULL,'th','open','2026-07-26 11:41:47','2026-07-26 10:49:42');
/*!40000 ALTER TABLE `chat_conversations` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `chat_messages` WRITE;
/*!40000 ALTER TABLE `chat_messages` DISABLE KEYS */;
INSERT INTO `chat_messages` VALUES (1,3,1,'customer',NULL,'안녕하세요','ko',NULL,NULL,NULL,0,1,'2026-07-26 11:37:26',NULL,'2026-07-26 11:11:44'),(2,3,1,'customer',NULL,'잘 부탁드립니다.','ko',NULL,NULL,NULL,0,1,'2026-07-26 11:37:26',NULL,'2026-07-26 11:12:14'),(3,3,1,'customer',NULL,'안녕하세요','ko',NULL,NULL,NULL,0,1,'2026-07-26 11:37:26',NULL,'2026-07-26 11:31:26'),(4,3,1,'customer',NULL,'한국에 언제 갈까요','ko',NULL,NULL,NULL,0,1,'2026-07-26 11:37:26',NULL,'2026-07-26 11:36:16'),(5,3,1,'manager',3,'아직은 오지 마세요','ko','ยังไม่ต้องมานะคะ','th',NULL,0,1,NULL,'2026-07-26 11:37:47','2026-07-26 11:37:47'),(6,3,1,'manager',3,'무엇을 도와드릴까요 ?','ko','มีอะไรให้ช่วยไหมคะ?','th',NULL,0,1,NULL,'2026-07-26 11:39:42','2026-07-26 11:39:42'),(7,3,1,'customer',NULL,'ฉันอยากเป็นเหมือนคาริน่า','th','저는 카리나처럼 되고 싶어요','ko',NULL,0,1,'2026-07-26 11:40:51',NULL,'2026-07-26 11:40:51'),(8,3,1,'manager',3,'돈이 많이 들텐데, 가능하겠어요','ko','คงจะมีค่าใช้จ่ายเยอะ จะเป็นไปได้ไหมคะ','th',NULL,0,1,NULL,'2026-07-26 11:41:47','2026-07-26 11:41:47');
/*!40000 ALTER TABLE `chat_messages` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `chat_participants` WRITE;
/*!40000 ALTER TABLE `chat_participants` DISABLE KEYS */;
INSERT INTO `chat_participants` VALUES (1,1,3,'manager',0,'정연정','ko','2026-07-26 10:49:42'),(2,1,3,'manager',3,'정연정','ko','2026-07-26 10:49:51'),(3,1,3,'customer',NULL,'augxmas@gmail.com','th','2026-07-26 10:53:28'),(4,1,3,'customer',NULL,'augxmas@gmail.com','th','2026-07-26 10:57:36'),(5,1,3,'customer',NULL,'augxmas@gmail.com','th','2026-07-26 11:11:07'),(6,1,3,'customer',NULL,'augxmas@gmail.com','th','2026-07-26 11:30:09'),(7,1,3,'customer',NULL,'augxmas@gmail.com','th','2026-07-26 11:35:53'),(8,1,3,'manager',3,'정연정','ko','2026-07-26 11:37:26');
/*!40000 ALTER TABLE `chat_participants` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `chat_tokens` WRITE;
/*!40000 ALTER TABLE `chat_tokens` DISABLE KEYS */;
INSERT INTO `chat_tokens` VALUES ('14f5db4f9bca30ac10cf81d67945ca14fc1339059de4896f',3,1,'augxmas@gmail.com',NULL,NULL,NULL,'2026-07-26 12:57:36',0,'2026-07-26 10:57:36'),('4678623a79e0702541f123f04f22f6d3e70b7dd7a4bbf36f',3,1,'augxmas@gmail.com',NULL,NULL,NULL,'2026-07-26 13:30:09',0,'2026-07-26 11:30:09'),('732200e26011d7a07119aa6f397fd508b62bd41efc916b26',3,1,'augxmas@gmail.com',NULL,NULL,NULL,'2026-07-26 13:35:53',0,'2026-07-26 11:35:53'),('95d177a6d7b64d4eebebca2987f7ec3941074f5b9b493003',3,1,'augxmas@gmail.com',NULL,NULL,NULL,'2026-07-26 13:11:07',0,'2026-07-26 11:11:07');
/*!40000 ALTER TABLE `chat_tokens` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `consult_answers` WRITE;
/*!40000 ALTER TABLE `consult_answers` DISABLE KEYS */;
INSERT INTO `consult_answers` VALUES (1,3,1,'manager',0,'채팅으로 설명드리겠습니다','f51501c274dd885e40934dd300e1373452bc43f1',0,NULL,NULL,'2026-07-26 10:49:42');
/*!40000 ALTER TABLE `consult_answers` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `consult_credentials` WRITE;
/*!40000 ALTER TABLE `consult_credentials` DISABLE KEYS */;
INSERT INTO `consult_credentials` VALUES ('augxmas@gmail.com','$2b$12$2qwnitWpRAibr7CLupg0IO8ZI6.9Rdh/VUsNDwoUQw1w8tid.Tp.S',3,NULL,'2026-07-26 10:19:30','2026-07-26 10:35:20');
/*!40000 ALTER TABLE `consult_credentials` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `consult_post_attachments` WRITE;
/*!40000 ALTER TABLE `consult_post_attachments` DISABLE KEYS */;
INSERT INTO `consult_post_attachments` VALUES (1,3,1,'uploads/active/3/chat/5f38fe0d-f65b-4196-be1a-c445bef83184.jpg','신민아.jpg','image/jpeg',7394,'2026-07-26 10:36:03');
/*!40000 ALTER TABLE `consult_post_attachments` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `consult_posts` WRITE;
/*!40000 ALTER TABLE `consult_posts` DISABLE KEYS */;
INSERT INTO `consult_posts` VALUES (1,3,'augxmas@gmail.com',NULL,NULL,NULL,'줄기세포','ㅇㅇ',NULL,NULL,1,'answered',NULL,NULL,'2026-07-26 10:49:42',1,0,NULL,NULL,'2026-07-26 10:36:03','2026-07-26 10:36:03');
/*!40000 ALTER TABLE `consult_posts` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `customer_visits` WRITE;
/*!40000 ALTER TABLE `customer_visits` DISABLE KEYS */;
/*!40000 ALTER TABLE `customer_visits` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `customers` WRITE;
/*!40000 ALTER TABLE `customers` DISABLE KEYS */;
/*!40000 ALTER TABLE `customers` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `doctors` WRITE;
/*!40000 ALTER TABLE `doctors` DISABLE KEYS */;
/*!40000 ALTER TABLE `doctors` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `email_logs` WRITE;
/*!40000 ALTER TABLE `email_logs` DISABLE KEYS */;
INSERT INTO `email_logs` VALUES (1,'email_verification','augxmas@gmail.com','[모노라마] 이메일 본인확인 코드',NULL,NULL,'sent',NULL,'2026-07-26 08:38:55'),(2,'registration_submitted','augxmas@gmail.com','[모노라마] 광고주 회원가입 신청이 접수되었습니다',NULL,4,'sent',NULL,'2026-07-26 08:42:06'),(3,'registration_submitted_supervisor','kimch@monorama.kr','[모노라마] 새 광고주 회원가입 신청 - 씨제이',NULL,4,'sent',NULL,'2026-07-26 08:42:07'),(4,'registration_approved','augxmas@gmail.com','[모노라마] 광고주 회원가입이 승인되었습니다',NULL,4,'sent',NULL,'2026-07-26 08:50:43'),(5,'consult_otp','augxmas@gmail.com','[비노] 온라인 상담 인증코드',NULL,3,'sent',NULL,'2026-07-26 10:19:31'),(6,'consult_otp','augxmas@gmail.com','[비노] 온라인 상담 인증코드',NULL,3,'sent',NULL,'2026-07-26 10:30:35'),(7,'consult_otp','augxmas@gmail.com','[비노] 온라인 상담 인증코드',NULL,3,'sent',NULL,'2026-07-26 10:35:21'),(8,'consult_answered','augxmas@gmail.com','[비노] 상담 답변이 등록되었습니다',NULL,3,'sent',NULL,'2026-07-26 10:49:43'),(9,'quotation_advertiser','augxmas@gmail.com','[????] ??? ??? - ?????_??','260517_0001',1,'sent',NULL,'2026-05-17 15:08:33'),(10,'quotation_supervisor','kimch@monorama.kr','[???? ???] ? ??? ?? ?? - ?????_?? ((?)????)','260517_0001',1,'sent',NULL,'2026-05-17 15:08:34'),(11,'temp_password','augxmas@gmail.com','[????] ?????? ??',NULL,1,'sent',NULL,'2026-05-17 16:32:46'),(12,'quotation_advertiser','augxmas@gmail.com','[????] ??? ??? - 5? ??? ? ','260517_0002',1,'sent',NULL,'2026-05-17 17:13:32'),(13,'quotation_supervisor','kimch@monorama.kr','[???? ???] ? ??? ?? ?? - 5? ??? ?  ((?)????)','260517_0002',1,'sent',NULL,'2026-05-17 17:13:32'),(14,'campaign_started_advertiser','augxmas@gmail.com','[????] ??? ??????? - ?????_??','260517_0001',NULL,'sent',NULL,'2026-05-17 17:24:30'),(15,'payment_confirmed_advertiser','augxmas@gmail.com','[????] ??? ??????? - 5? ??? ? ','260517_0002',NULL,'sent',NULL,'2026-05-17 17:28:39'),(16,'campaign_started_advertiser','augxmas@gmail.com','[????] ??? ??????? - 5? ??? ? ','260517_0002',NULL,'sent',NULL,'2026-05-17 17:29:01'),(17,'campaign_cancelled_advertiser','augxmas@gmail.com','[????] ???? ??????? - 5? ??? ? ','260517_0002',NULL,'sent',NULL,'2026-05-17 17:29:29'),(18,'campaign_cancelled_advertiser','augxmas@gmail.com','[????] ???? ??????? - ?????_??','260517_0001',NULL,'sent',NULL,'2026-05-17 18:57:12');
/*!40000 ALTER TABLE `email_logs` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `email_verifications` WRITE;
/*!40000 ALTER TABLE `email_verifications` DISABLE KEYS */;
INSERT INTO `email_verifications` VALUES (1,'augxmas@gmail.com','463056',1,'2026-07-26 08:48:54',NULL,'2026-07-26 08:38:54'),(2,'nitsuser@naver.com','727258',0,'2026-07-26 10:15:54','consult','2026-07-26 10:05:54'),(3,'nitsuser@naver.com','624453',0,'2026-07-26 10:21:16','consult','2026-07-26 10:11:16'),(4,'augxmas@gmail.com','939664',0,'2026-07-26 10:26:50','consult','2026-07-26 10:16:50'),(5,'augxmas@gmail.com','733484',0,'2026-07-26 10:27:20','consult','2026-07-26 10:17:20'),(6,'augxmas@gmail.com','414704',0,'2026-07-26 10:29:30','consult','2026-07-26 10:19:30'),(7,'augxmas@gmail.com','651455',0,'2026-07-26 10:40:34','consult','2026-07-26 10:30:34'),(8,'augxmas@gmail.com','533093',0,'2026-07-26 10:45:20','consult','2026-07-26 10:35:20');
/*!40000 ALTER TABLE `email_verifications` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `holidays` WRITE;
/*!40000 ALTER TABLE `holidays` DISABLE KEYS */;
/*!40000 ALTER TABLE `holidays` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `hospital_agency_requests` WRITE;
/*!40000 ALTER TABLE `hospital_agency_requests` DISABLE KEYS */;
INSERT INTO `hospital_agency_requests` VALUES (2,3,3,'approved','a8bfa4a9b4808d622ab0ae55631a280fdaf22c09f9f27558614d998a9327e198','supervisor','2026-07-25 21:59:29','2026-07-25 22:02:19','2026-07-25 21:50:28','2026-07-25 22:02:19');
/*!40000 ALTER TABLE `hospital_agency_requests` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `hospital_form_fields` WRITE;
/*!40000 ALTER TABLE `hospital_form_fields` DISABLE KEYS */;
INSERT INTO `hospital_form_fields` VALUES ('address1',1,1,8,'2026-07-25 17:24:25',0),('address2',1,0,9,'2026-07-25 17:24:25',0),('biz_cert',1,0,6,'2026-07-25 17:24:25',0),('business_no',1,1,5,'2026-07-25 17:24:25',1),('ceo_name',1,1,4,'2026-07-25 17:24:25',1),('company_name',1,1,1,'2026-07-25 17:24:25',1),('company_name_en',1,0,2,'2026-07-26 09:52:43',1),('contact_email',1,1,16,'2026-07-25 17:24:25',0),('contact_mobile',1,1,15,'2026-07-25 17:24:25',0),('contact_name',1,1,14,'2026-07-25 17:24:25',0),('fax',1,0,12,'2026-07-25 17:24:25',0),('homepage',1,0,13,'2026-07-25 17:24:25',0),('hospital_id',1,1,3,'2026-07-26 09:30:08',1),('medical_subjects',1,0,11,'2026-07-25 17:24:25',0),('postal_code',1,1,10,'2026-07-25 17:24:25',0),('representative_phone',1,1,7,'2026-07-25 17:24:25',0),('serial_no',1,0,17,'2026-07-25 17:24:25',1);
/*!40000 ALTER TABLE `hospital_form_fields` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `hospitals` WRITE;
/*!40000 ALTER TABLE `hospitals` DISABLE KEYS */;
INSERT INTO `hospitals` VALUES (3,'모즈의원',NULL,'mods','8w7JQcKis5rCXlPHzKGNcQ==','287-48-00521',NULL,NULL,'02-545-1618','서울 강남구 압구정로80길 33','아트빌딩 2, 4층(청담동)','06016','','','https://www.modsclinic.co.kr/','20260725_0001','eQUM3WbtaiJALfXfQr3shg==','mo1AE0K8urfO3hhi8FuL3A==','cQMRKrCAUNQ1fj6aIH5CMaOJ7OWSdtRRCUrXyS4XriI=','approved',NULL,'2026-07-25 21:19:15','2026-07-25 19:36:51','2026-07-25 21:19:15');
/*!40000 ALTER TABLE `hospitals` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `llm_usage` WRITE;
/*!40000 ALTER TABLE `llm_usage` DISABLE KEYS */;
/*!40000 ALTER TABLE `llm_usage` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `login_histories` WRITE;
/*!40000 ALTER TABLE `login_histories` DISABLE KEYS */;
INSERT INTO `login_histories` VALUES (1,'supervisor','supervisor','::1','2026-07-25 16:47:02',NULL,'6yFg4XO2jt-yx9JW4X1RYhl8sDJnY3c0'),(2,'advertiser','3','::ffff:127.0.0.1','2026-07-25 16:56:05',NULL,'IC-kv3dVUsVIu6LyLjRfydlgcPrzJ5d4'),(3,'supervisor','supervisor','::1','2026-07-25 17:13:15',NULL,'ao7tiNHyrjgmf7Vkdobn_7tRwVXEq7oS'),(4,'supervisor','supervisor','::1','2026-07-25 17:15:25',NULL,'VXiba2L1O-M8kcWteUrxeC1zMqIVT6Vk'),(5,'advertiser','3','::ffff:127.0.0.1','2026-07-25 17:18:04',NULL,'ueQ9AIl89cAsjoSwFQUze5AR6x95eWJ6'),(6,'supervisor','supervisor','::1','2026-07-25 17:24:25',NULL,'BBjJJ9L5Sq_YT1AW1zs1BXlQBpqFzeBy'),(7,'supervisor','supervisor','::1','2026-07-25 17:26:59',NULL,'lArtEj1KWrBzN0uNFTHZTLylSfZ1sH7Z'),(8,'supervisor','supervisor','::1','2026-07-25 17:33:08',NULL,'uVLy4Sbz9EENrde9_LIl9jOKfrz5-iha'),(9,'supervisor','supervisor','::1','2026-07-25 17:34:48',NULL,'FaeAdOMZwxfnZI6b77-Gf_cNRNoJWm1Q'),(10,'supervisor','supervisor','::1','2026-07-25 17:38:26',NULL,'x8OPdLgaFpOrOAPkdQB0mG-sl7N8K7bO'),(11,'supervisor','supervisor','::1','2026-07-25 17:39:51',NULL,'5uvyAozfPZ1AFmVK-KlgNaBjKX0o6Tka'),(12,'supervisor','supervisor','::1','2026-07-25 18:13:30',NULL,'oVKy1U-QqXr_rt2QSppj3TM4-jR63pBD'),(13,'supervisor','supervisor','::1','2026-07-25 18:38:57',NULL,'yogUTrmMQ5QT1uivyglZFlc6xrP3a_Um'),(14,'supervisor','supervisor','::1','2026-07-25 18:52:13',NULL,'22znxvyiT0P4QAdCt8cEdmZl0j9bh0oi'),(15,'supervisor','supervisor','::1','2026-07-25 18:55:02',NULL,'jPymIwBCEdcqj8_yMlLpp8GWvasKjgpg'),(16,'supervisor','supervisor','::ffff:127.0.0.1','2026-07-25 19:02:04',NULL,'9if5aPp-fLqxS7dFbPHdqRxh8cvcuyMs'),(17,'supervisor','supervisor','::ffff:127.0.0.1','2026-07-25 19:02:45',NULL,'AWXKGhNyo17CI-8YkSgGT4i7-jvDDOQv'),(18,'supervisor','supervisor','::1','2026-07-25 19:07:29',NULL,'ReZriHKOu1MPBo8vXDJwB6FDsVd-JH65'),(19,'supervisor','supervisor','::1','2026-07-25 19:18:21',NULL,'m0L3IRpDs2NcT5fdXk1EPQ9eqR5Ixzjv'),(20,'supervisor','supervisor','::1','2026-07-25 19:22:24',NULL,'a4qwnVlZ3GDCq_lgvtTutIiV1YFdBj-l'),(21,'supervisor','supervisor','::1','2026-07-25 19:57:01',NULL,'ykK5xEfF2xwTcw9_p8OQs50Ggrb7v759'),(22,'supervisor','supervisor','::1','2026-07-25 20:07:29',NULL,'AV6NACiIyoMLjYPFA8vpP_rELt_AxLeM'),(23,'supervisor','supervisor','::1','2026-07-25 20:31:20',NULL,'lDQVVyz7JjRQRf0m9Z1-0YVqHPxL8yEa'),(24,'supervisor','supervisor','::1','2026-07-25 20:36:13',NULL,'_hEwR0-GvbDjBP8thmBldrpbCDBF6uRs'),(25,'supervisor','supervisor','::1','2026-07-25 20:52:23',NULL,'GKTHBrXhTU73bAQs16gU4st87i-6uEe7'),(26,'supervisor','supervisor','::1','2026-07-25 20:54:25',NULL,'E6bxmk9LTjNTTy4Sjepo1uPxSxJpSL5U'),(27,'supervisor','supervisor','::1','2026-07-25 21:19:05',NULL,'kH4bwxF2HLMXxorgH75xMPD2uYuICT2g'),(28,'supervisor','supervisor','::ffff:127.0.0.1','2026-07-25 21:33:12',NULL,'zpMV3IUJO0klcO4NkY4G0DgcVlDOdMAi'),(29,'supervisor','supervisor','::ffff:127.0.0.1','2026-07-25 21:33:43',NULL,'M1dqF98S5Omrpa68_Z305ssflOoD3XCF'),(30,'supervisor','supervisor','::1','2026-07-25 21:36:15','2026-07-25 21:52:45','XwE-mPTxHqZGNbikp1shwG5EMpPl6x6V'),(31,'supervisor','supervisor','::ffff:127.0.0.1','2026-07-25 21:46:09',NULL,'KlMv6AZBpwFnZVVgUZ97HO6vW64P59jP'),(32,'supervisor','supervisor','::1','2026-07-25 21:52:51',NULL,'PwPEXqTYGiaSzJDsINj9BGbxWEbwYa-A'),(33,'supervisor','supervisor','::1','2026-07-26 08:09:14','2026-07-26 08:20:27','kU2AJlPvw1zw_Mmcnj67ALwD-6Vi5Zpd'),(34,'supervisor','supervisor','::1','2026-07-26 08:20:34',NULL,'HZ1VhWa5SSGcA1yqg2S993SLNWsRO9AB'),(35,'advertiser','4','::1','2026-07-26 08:50:48','2026-07-26 08:51:33','D3mGQqmZn3luuLebS9UUGl7Xj4Wqf1Cu'),(36,'advertiser','4','::1','2026-07-26 08:57:30','2026-07-26 09:30:44','HqQ7NsT3VFvFgt0qNEVQZWWX-_g-17aG'),(37,'advertiser','3','::1','2026-07-26 09:01:17','2026-07-26 09:30:44','HqQ7NsT3VFvFgt0qNEVQZWWX-_g-17aG'),(38,'advertiser','3','::1','2026-07-26 09:05:20','2026-07-26 09:30:44','HqQ7NsT3VFvFgt0qNEVQZWWX-_g-17aG'),(39,'supervisor','supervisor','::1','2026-07-26 09:05:50','2026-07-26 09:07:42','GbnK8Lz6dKfxunyLX3-E0Obv1VLqqvVb'),(40,'supervisor','supervisor','::1','2026-07-26 09:08:12','2026-07-26 09:08:21','n3kKXfscw0XPNyYdVPeAfo__Mq_8md-8'),(41,'supervisor','supervisor','::1','2026-07-26 09:08:32',NULL,'cjU4lgdSfQFAHwmKNpMj6-3alaoTSXlK'),(42,'supervisor','supervisor','::1','2026-07-26 09:21:59',NULL,'iFnwoyGZJhfQO6NQ2uWILdT0UC5dXU5o'),(43,'advertiser','3','::1','2026-07-26 09:44:33','2026-07-26 09:58:29','GbYdnO8Es6JX_PDY439cDZsm0N1L6L6Z'),(44,'supervisor','supervisor','::1','2026-07-26 09:53:36',NULL,'T2mpSPMqBOhhQiwLE8t2kON4yCcAQSHs'),(45,'advertiser','3','::1','2026-07-26 10:10:01',NULL,'hNZ-vIe25rDnZ9SZ_uFQUaxrcuAaUEzL'),(46,'supervisor','supervisor','::1','2026-07-26 10:46:28',NULL,'kiVlq9NfkLafhdrW47jx5Hfu3T3hDTSx'),(47,'advertiser','3','::ffff:127.0.0.1','2026-07-26 10:46:56',NULL,'_DZMxGNlmXQRXkH0wpwkGKBjxH-_Xvw5'),(48,'advertiser','3','::1','2026-07-26 11:37:05','2026-07-26 11:52:29','zXbkaNL6VaGtOy4BBZHlnbYvtaDpCwn2'),(49,'advertiser','3','::ffff:127.0.0.1','2026-07-26 19:31:10',NULL,'k7XlOsi21uowcZLXJjZYl0jxcl0tESUV'),(50,'supervisor','supervisor','58.10.12.80','2026-08-01 17:19:23',NULL,'XkPIHQQDfAtNBLivruwuRPepjhmaoGxC'),(51,'advertiser','3','58.10.12.80','2026-08-01 17:23:01','2026-08-01 17:34:25','J7TjqIvNEhMkbWwxC1mFQpNAuWkSvlxA'),(52,'advertiser','3','58.10.12.80','2026-08-01 17:37:16','2026-08-01 17:53:34','UiAMo6bpiPTa2O9e0VKVhQ-Wvfy-Y9LM'),(53,'advertiser','3','58.10.12.80','2026-08-01 18:09:18','2026-08-01 18:35:53','ugoBitogCFj3tU5_iY7BRNtHvv7ciUUQ'),(54,'advertiser','3','58.10.12.80','2026-08-01 18:48:13','2026-08-01 19:11:32','pmfYgzS6EEiwU7oq7yXyZ8LS2uf2nRPK'),(55,'advertiser','3','58.10.12.80','2026-08-01 19:35:20','2026-08-01 19:55:35','rQC_zERGhnSFGFFacTs0IEfJWZS8Wye0'),(56,'advertiser','3','58.10.12.80','2026-08-01 19:56:41','2026-08-01 20:31:22','QjP_ElaOgb6crAJoHgt3VA8sh_hJTzTD'),(57,'supervisor','supervisor','58.10.12.80','2026-08-02 12:09:23',NULL,'hMsCBYfxa8vPlqASVGb9EbS_vz4YBNaQ'),(58,'advertiser','3','58.10.12.80','2026-08-02 12:10:13','2026-08-02 12:26:38','v8leFm1bP_5FZcGdr5_yFy7f15gxdgCT'),(59,'advertiser','3','58.10.12.80','2026-08-02 12:31:48','2026-08-02 12:58:38','sMf8yzJ5bU7vhdADGzbryltnT0VrCQeS'),(60,'advertiser','3','58.10.12.80','2026-08-02 13:11:41','2026-08-02 13:33:24','bRWPH3pIC6raA6Rlxl-MsaZViQZcWmJL'),(61,'advertiser','3','58.10.12.80','2026-08-02 13:33:35','2026-08-02 13:50:38','aQCV0Ox1bmzakS0s1wE9YbLN_u0R2FCg');
/*!40000 ALTER TABLE `login_histories` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `managers` WRITE;
/*!40000 ALTER TABLE `managers` DISABLE KEYS */;
/*!40000 ALTER TABLE `managers` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `notices` WRITE;
/*!40000 ALTER TABLE `notices` DISABLE KEYS */;
INSERT INTO `notices` VALUES (1,3,'태국 첫 회원가입 고객을 위한 특별한 초대 | MODS CLINIC SEOUL','<div style=\"font-family:\'Noto Sans KR\',\'Noto Sans Thai\',Arial,sans-serif;color:#333;line-height:1.85\"><div style=\"position:relative;border-radius:14px;overflow:hidden;margin-bottom:26px;background:#f2ede5\"><img src=\"/assets/notices/thailand-membership-2026.png\" alt=\"태국 첫 회원가입 고객을 위한 특별 이벤트\" style=\"display:block;width:100%;height:auto\"></div><div style=\"text-align:center;padding:2px 12px 24px\"><div style=\"display:inline-block;padding:7px 14px;border-radius:999px;background:#eef2ec;color:#596554;font-size:12px;font-weight:700;letter-spacing:.08em\">2026.08.10 – 2026.09.09</div><h2 style=\"margin:18px 0 12px;font-size:28px;line-height:1.35;color:#28302a\">태국 첫 회원가입 이벤트</h2><p style=\"margin:0;color:#6b6f69;font-size:15px\">한국 여행과 함께 나만을 위한 K-뷰티 경험을 준비해 보세요.</p></div><div style=\"padding:24px;border:1px solid #e1e4de;border-radius:14px;background:#fafbf9;margin-bottom:18px\"><h3 style=\"margin:0 0 12px;color:#596554;font-size:18px\">첫 만남이 오래도록 특별할 수 있도록</h3><p style=\"margin:0\">2026년 8월 10일부터 9월 9일까지 가입한 태국 회원에게 지속적이고 특별한 혜택을 제공할 예정입니다. 한국 방문 전 간단한 상담과 예약을 통해 서울의 문화와 여행을 즐기면서 자신에게 맞는 뷰티 시술도 편안하게 경험해 보세요.</p></div><div style=\"padding:24px;border:1px solid #eadfd9;border-radius:14px;background:#fff9f6;margin-bottom:18px\"><h3 style=\"margin:0 0 12px;color:#9b675d;font-size:18px\">일본과 중국 고객의 높은 재방문으로 검증된 곳</h3><p style=\"margin:0\">모즈클리닉은 일본과 중국의 많은 고객이 다시 찾는 검증된 의료기관입니다. 이제 태국 여성의 피부와 아름다움에 대한 관심, 여행 일정과 편의까지 세심하게 고려한 태국 맞춤형 서비스를 본격적으로 제공합니다.</p></div><div style=\"text-align:center;padding:26px 20px;border-radius:14px;background:#596554;color:#fff\"><h3 style=\"margin:0 0 10px;font-size:21px\">서울에서 만나는 아름다운 변화</h3><p style=\"margin:0 0 18px;color:#e7ebe5;font-size:14px\">한국에 오기 전 미리 상담하고 예약하면 여행은 더 여유롭고 아름다움은 더 특별해집니다. 많은 관심과 가입을 부탁드립니다.</p><a href=\"/consult?h=3\" style=\"display:inline-block;padding:11px 22px;border-radius:999px;background:#fff;color:#596554;text-decoration:none;font-weight:700\">상담 및 예약 신청하기</a></div><p style=\"margin:16px 4px 0;color:#8a8e88;font-size:11px;text-align:center\">※ 세부 혜택은 상담 및 의료진 진단에 따라 달라질 수 있습니다. 모든 시술은 개인별 차이가 있습니다.</p></div>','ko,th,en','{\"ko\":{\"title\":\"태국 첫 회원가입 고객을 위한 특별한 초대 | MODS CLINIC SEOUL\",\"content\":\"<div style=\\\"font-family:\'Noto Sans KR\',\'Noto Sans Thai\',Arial,sans-serif;color:#333;line-height:1.85\\\"><div style=\\\"position:relative;border-radius:14px;overflow:hidden;margin-bottom:26px;background:#f2ede5\\\"><img src=\\\"/assets/notices/thailand-membership-2026.png\\\" alt=\\\"태국 첫 회원가입 고객을 위한 특별 이벤트\\\" style=\\\"display:block;width:100%;height:auto\\\"></div><div style=\\\"text-align:center;padding:2px 12px 24px\\\"><div style=\\\"display:inline-block;padding:7px 14px;border-radius:999px;background:#eef2ec;color:#596554;font-size:12px;font-weight:700;letter-spacing:.08em\\\">2026.08.10 – 2026.09.09</div><h2 style=\\\"margin:18px 0 12px;font-size:28px;line-height:1.35;color:#28302a\\\">태국 첫 회원가입 이벤트</h2><p style=\\\"margin:0;color:#6b6f69;font-size:15px\\\">한국 여행과 함께 나만을 위한 K-뷰티 경험을 준비해 보세요.</p></div><div style=\\\"padding:24px;border:1px solid #e1e4de;border-radius:14px;background:#fafbf9;margin-bottom:18px\\\"><h3 style=\\\"margin:0 0 12px;color:#596554;font-size:18px\\\">첫 만남이 오래도록 특별할 수 있도록</h3><p style=\\\"margin:0\\\">2026년 8월 10일부터 9월 9일까지 가입한 태국 회원에게 지속적이고 특별한 혜택을 제공할 예정입니다. 한국 방문 전 간단한 상담과 예약을 통해 서울의 문화와 여행을 즐기면서 자신에게 맞는 뷰티 시술도 편안하게 경험해 보세요.</p></div><div style=\\\"padding:24px;border:1px solid #eadfd9;border-radius:14px;background:#fff9f6;margin-bottom:18px\\\"><h3 style=\\\"margin:0 0 12px;color:#9b675d;font-size:18px\\\">일본과 중국 고객의 높은 재방문으로 검증된 곳</h3><p style=\\\"margin:0\\\">모즈클리닉은 일본과 중국의 많은 고객이 다시 찾는 검증된 의료기관입니다. 이제 태국 여성의 피부와 아름다움에 대한 관심, 여행 일정과 편의까지 세심하게 고려한 태국 맞춤형 서비스를 본격적으로 제공합니다.</p></div><div style=\\\"text-align:center;padding:26px 20px;border-radius:14px;background:#596554;color:#fff\\\"><h3 style=\\\"margin:0 0 10px;font-size:21px\\\">서울에서 만나는 아름다운 변화</h3><p style=\\\"margin:0 0 18px;color:#e7ebe5;font-size:14px\\\">한국에 오기 전 미리 상담하고 예약하면 여행은 더 여유롭고 아름다움은 더 특별해집니다. 많은 관심과 가입을 부탁드립니다.</p><a href=\\\"/consult?h=3\\\" style=\\\"display:inline-block;padding:11px 22px;border-radius:999px;background:#fff;color:#596554;text-decoration:none;font-weight:700\\\">상담 및 예약 신청하기</a></div><p style=\\\"margin:16px 4px 0;color:#8a8e88;font-size:11px;text-align:center\\\">※ 세부 혜택은 상담 및 의료진 진단에 따라 달라질 수 있습니다. 모든 시술은 개인별 차이가 있습니다.</p></div>\"},\"th\":{\"title\":\"กิจกรรมสมัครสมาชิกครั้งแรกสำหรับประเทศไทยของ MODS CLINIC (10 ส.ค. - 9 ก.ย. 2026)\",\"content\":\"<div style=\\\"font-family:\'Noto Sans KR\',\'Noto Sans Thai\',Arial,sans-serif;color:#333;line-height:1.85\\\"><div style=\\\"position:relative;border-radius:14px;overflow:hidden;margin-bottom:26px;background:#f2ede5\\\"><img src=\\\"/assets/notices/thailand-membership-2026.png\\\" alt=\\\"MODS CLINIC Thailand membership event\\\" style=\\\"display:block;width:100%;height:auto\\\"></div><div style=\\\"text-align:center;padding:2px 12px 24px\\\"><div style=\\\"display:inline-block;padding:7px 14px;border-radius:999px;background:#eef2ec;color:#596554;font-size:12px;font-weight:700;letter-spacing:.08em\\\">2026.08.10 - 2026.09.09</div><h2 style=\\\"margin:18px 0 12px;font-size:28px;line-height:1.35;color:#28302a\\\">มาเป็นสมาชิกกลุ่มแรกจากประเทศไทยของเรา</h2><p style=\\\"margin:0;color:#6b6f69;font-size:15px\\\">ขอเชิญผู้หญิงไทยมาร่วมเริ่มต้นประสบการณ์ K-Beauty สุดพิเศษที่ชองดัม กรุงโซล</p></div><div style=\\\"padding:24px;border:1px solid #e1e4de;border-radius:14px;background:#fafbf9;margin-bottom:18px\\\"><h3 style=\\\"margin:0 0 12px;color:#596554;font-size:18px\\\">สิทธิพิเศษที่ดูแลคุณอย่างต่อเนื่องหลังจากการพบกันครั้งแรก</h3><p style=\\\"margin:0\\\">MODS CLINIC จัดกิจกรรมสมัครสมาชิกครั้งแรกสำหรับประเทศไทย ตั้งแต่วันที่ 10 สิงหาคม ถึง 9 กันยายน 2026 สมาชิกที่สมัครในช่วงกิจกรรมจะได้รับสิทธิประโยชน์พิเศษสำหรับสมาชิกอย่างต่อเนื่อง ไม่ได้จำกัดอยู่เพียงการมาใช้บริการครั้งเดียว รายละเอียดสิทธิประโยชน์และวิธีใช้บริการจะแจ้งให้สมาชิกแต่ละท่านทราบตามลำดับ</p></div><div style=\\\"padding:24px;border:1px solid #eadfd9;border-radius:14px;background:#fff9f6;margin-bottom:18px\\\"><h3 style=\\\"margin:0 0 12px;color:#9b675d;font-size:18px\\\">สถาบันการแพทย์ที่ได้รับความไว้วางใจจากลูกค้าเอเชียให้กลับมาใช้บริการอีกครั้ง</h3><p style=\\\"margin:0\\\">MODS CLINIC เป็นสถาบันการแพทย์ที่ได้รับความไว้วางใจจากลูกค้าต่างชาติจำนวนมาก รวมถึงลูกค้าจากญี่ปุ่นและจีนที่กลับมาใช้บริการอย่างต่อเนื่อง จากประสบการณ์ด้านการให้คำปรึกษาและการดูแลที่ผ่านมา เราพร้อมนำเสนอบริการที่ออกแบบให้เหมาะกับลักษณะใบหน้า ปัญหาผิว ตารางการเดินทาง และความชื่นชอบของผู้หญิงไทยอย่างจริงจัง</p></div><div style=\\\"text-align:center;padding:26px 20px;border-radius:14px;background:#596554;color:#fff\\\"><h3 style=\\\"margin:0 0 10px;font-size:21px\\\">เริ่มต้นทริปความงามในโซลของคุณไปกับ MODS</h3><p style=\\\"margin:0 0 18px;color:#e7ebe5;font-size:14px\\\">เราจะรับฟังเรื่องราวของลูกค้าชาวไทยแต่ละท่านอย่างใส่ใจ และเตรียมบริการเฉพาะบุคคลที่คุณไว้วางใจได้ ขอเชิญทุกท่านให้ความสนใจและร่วมสมัครสมาชิกกับเรา</p><a href=\\\"/consult?h=3\\\" style=\\\"display:inline-block;padding:11px 22px;border-radius:999px;background:#fff;color:#596554;text-decoration:none;font-weight:700\\\">สอบถามการสมัครและสิทธิประโยชน์</a></div><p style=\\\"margin:16px 4px 0;color:#8a8e88;font-size:11px;text-align:center\\\">※ บริการทางการแพทย์จะพิจารณาหลังจากแพทย์ตรวจและให้คำปรึกษาที่คลินิก รายละเอียดสิทธิประโยชน์สำหรับสมาชิกจะแจ้งให้ทราบแยกต่างหาก</p></div>\"},\"en\":{\"title\":\"MODS CLINIC First Thailand Membership Event (Aug 10 - Sep 9, 2026)\",\"content\":\"<div style=\\\"font-family:\'Noto Sans KR\',\'Noto Sans Thai\',Arial,sans-serif;color:#333;line-height:1.85\\\"><div style=\\\"position:relative;border-radius:14px;overflow:hidden;margin-bottom:26px;background:#f2ede5\\\"><img src=\\\"/assets/notices/thailand-membership-2026.png\\\" alt=\\\"MODS CLINIC Thailand membership event\\\" style=\\\"display:block;width:100%;height:auto\\\"></div><div style=\\\"text-align:center;padding:2px 12px 24px\\\"><div style=\\\"display:inline-block;padding:7px 14px;border-radius:999px;background:#eef2ec;color:#596554;font-size:12px;font-weight:700;letter-spacing:.08em\\\">2026.08.10 - 2026.09.09</div><h2 style=\\\"margin:18px 0 12px;font-size:28px;line-height:1.35;color:#28302a\\\">Be among our first members from Thailand</h2><p style=\\\"margin:0;color:#6b6f69;font-size:15px\\\">Thai women are warmly invited to begin a special K-beauty journey in Cheongdam, Seoul.</p></div><div style=\\\"padding:24px;border:1px solid #e1e4de;border-radius:14px;background:#fafbf9;margin-bottom:18px\\\"><h3 style=\\\"margin:0 0 12px;color:#596554;font-size:18px\\\">Special benefits that continue beyond your first visit</h3><p style=\\\"margin:0\\\">MODS CLINIC is holding its first Thailand membership event from August 10 through September 9, 2026. Members who join during the event period will receive ongoing, special membership benefits designed to extend beyond a single visit. Details and instructions will be shared with each member in due course.</p></div><div style=\\\"padding:24px;border:1px solid #eadfd9;border-radius:14px;background:#fff9f6;margin-bottom:18px\\\"><h3 style=\\\"margin:0 0 12px;color:#9b675d;font-size:18px\\\">A trusted medical institution that Asian clients return to</h3><p style=\\\"margin:0\\\">MODS CLINIC has earned continued trust from many international clients, including returning visitors from Japan and China. Building on our experience in consultation and care, we are now introducing services thoughtfully tailored to Thai women’s facial characteristics, skin concerns, travel schedules, and preferences.</p></div><div style=\\\"text-align:center;padding:26px 20px;border-radius:14px;background:#596554;color:#fff\\\"><h3 style=\\\"margin:0 0 10px;font-size:21px\\\">Begin your Seoul beauty journey with MODS</h3><p style=\\\"margin:0 0 18px;color:#e7ebe5;font-size:14px\\\">We will listen carefully to every Thai client and prepare personalized services you can feel confident about. We warmly invite your interest and membership.</p><a href=\\\"/consult?h=3\\\" style=\\\"display:inline-block;padding:11px 22px;border-radius:999px;background:#fff;color:#596554;text-decoration:none;font-weight:700\\\">Ask about membership benefits</a></div><p style=\\\"margin:16px 4px 0;color:#8a8e88;font-size:11px;text-align:center\\\">※ Medical services are determined after an in-person consultation and assessment by a medical professional. Full membership benefit details will be provided separately.</p></div>\"}}',1,21,0,NULL,NULL,'???','2026-08-02 13:33:49','2026-08-02 13:36:12');
/*!40000 ALTER TABLE `notices` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `recruiters` WRITE;
/*!40000 ALTER TABLE `recruiters` DISABLE KEYS */;
/*!40000 ALTER TABLE `recruiters` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `resource_images` WRITE;
/*!40000 ALTER TABLE `resource_images` DISABLE KEYS */;
INSERT INTO `resource_images` VALUES (2,3,'íêµ­ê°ë§ê³ ê°ëª¨ì§ì´ë²¤í¸.png','1b40731a-2a78-4f28-8996-cf5eeaa8269b.png','/uploads/active/3/library/1b40731a-2a78-4f28-8996-cf5eeaa8269b.png','태국 회원 모집 이벤트','회원,뷰티,모즈,최초,정연정','th','image/png',1911373,'2026-08-01 19:00:06');
/*!40000 ALTER TABLE `resource_images` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `sessions` WRITE;
/*!40000 ALTER TABLE `sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `system_config` WRITE;
/*!40000 ALTER TABLE `system_config` DISABLE KEYS */;
INSERT INTO `system_config` VALUES ('ad_price_per_day','1000','광고 유형별 1일 광고료(원)','2026-07-25 16:44:35'),('company_account','1005-802-852258','은행계좌번호','2026-07-25 16:44:35'),('company_bank','????','은행명','2026-07-25 16:44:35'),('company_biz_no','277-86-00185','사업자등록번호','2026-07-25 16:44:35'),('company_ceo','???','대표이사','2026-07-25 16:44:35'),('company_name','(?)????','회사명','2026-07-25 16:44:35'),('supervisor_email','kimch@monorama.kr','Supervisor 이메일','2026-07-25 16:44:35'),('tax_email','kimch@monorama.kr','세무담당자 이메일','2026-07-25 16:44:35'),('vat_rate','0.1','부가세율','2026-07-25 16:44:35');
/*!40000 ALTER TABLE `system_config` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
