-- ============================================================
-- Hospital CRM - MariaDB logical backup helper
-- DB: advertise
-- ============================================================
-- Purpose
--   1. Create a timestamped backup schema in the same MariaDB instance.
--   2. Copy table objects and table data from the source schema.
--   3. Snapshot object and instance metadata for audit/recovery reference.
--
-- Usage
--   mariadb -h localhost -u root -p < database/backup.sql
--
-- Result
--   advertise_backup_YYYYMMDD_HHMMSS
--
-- Important
--   This SQL-only backup is useful before deployments and data fixes.
--   For a portable file backup that includes routines, triggers, events,
--   grants, and data, also run:
--
--   mariadb-dump -h localhost -u root -p \
--     --default-character-set=utf8mb4 \
--     --single-transaction --quick \
--     --routines --triggers --events \
--     --databases advertise > database/dump.sql
--
--   Instance-level users/grants should be backed up separately:
--
--   mariadb-dump -h localhost -u root -p \
--     --default-character-set=utf8mb4 \
--     --system=user > database/instance-users.sql
-- ============================================================

SET @source_schema = 'advertise';
SET @backup_schema = CONCAT(@source_schema, '_backup_', DATE_FORMAT(NOW(), '%Y%m%d_%H%i%s'));

USE advertise;

SET @sql = CONCAT(
  'CREATE DATABASE IF NOT EXISTS `',
  REPLACE(@backup_schema, '`', '``'),
  '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

DELIMITER $$

DROP PROCEDURE IF EXISTS backup_advertise_schema $$

CREATE PROCEDURE backup_advertise_schema(
  IN p_source_schema VARCHAR(64),
  IN p_backup_schema VARCHAR(64)
)
BEGIN
  DECLARE v_done TINYINT DEFAULT 0;
  DECLARE v_table_name VARCHAR(64);
  DECLARE v_table_type VARCHAR(64);
  DECLARE v_view_definition LONGTEXT;
  DECLARE v_sql LONGTEXT;

  DECLARE cur_objects CURSOR FOR
    SELECT TABLE_NAME, TABLE_TYPE
      FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = p_source_schema
       AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
     ORDER BY FIELD(TABLE_TYPE, 'BASE TABLE', 'VIEW'), TABLE_NAME;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

  SET v_sql = CONCAT(
    'CREATE TABLE `', REPLACE(p_backup_schema, '`', '``'), '`.`backup__manifest` (',
    'id INT AUTO_INCREMENT PRIMARY KEY, ',
    'source_schema VARCHAR(64) NOT NULL, ',
    'backup_schema VARCHAR(64) NOT NULL, ',
    'server_version VARCHAR(128) NOT NULL, ',
    'created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, ',
    'note TEXT NULL',
    ') ENGINE=InnoDB'
  );
  PREPARE stmt FROM v_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;

  SET v_sql = CONCAT(
    'INSERT INTO `', REPLACE(p_backup_schema, '`', '``'), '`.`backup__manifest` ',
    '(source_schema, backup_schema, server_version, note) VALUES (',
    QUOTE(p_source_schema), ', ',
    QUOTE(p_backup_schema), ', ',
    'VERSION(), ',
    QUOTE('SQL helper backup: base table structure/data copied; metadata snapshots included.'),
    ')'
  );
  PREPARE stmt FROM v_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;

  OPEN cur_objects;

  copy_loop: LOOP
    FETCH cur_objects INTO v_table_name, v_table_type;
    IF v_done = 1 THEN
      LEAVE copy_loop;
    END IF;

    IF v_table_type = 'BASE TABLE' THEN
      SET v_sql = CONCAT(
        'CREATE TABLE `', REPLACE(p_backup_schema, '`', '``'), '`.`', REPLACE(v_table_name, '`', '``'),
        '` LIKE `', REPLACE(p_source_schema, '`', '``'), '`.`', REPLACE(v_table_name, '`', '``'), '`'
      );
      PREPARE stmt FROM v_sql;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;

      SET v_sql = CONCAT(
        'INSERT INTO `', REPLACE(p_backup_schema, '`', '``'), '`.`', REPLACE(v_table_name, '`', '``'),
        '` SELECT * FROM `', REPLACE(p_source_schema, '`', '``'), '`.`', REPLACE(v_table_name, '`', '``'), '`'
      );
      PREPARE stmt FROM v_sql;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
    ELSEIF v_table_type = 'VIEW' THEN
      SELECT VIEW_DEFINITION
        INTO v_view_definition
        FROM information_schema.VIEWS
       WHERE TABLE_SCHEMA = p_source_schema
         AND TABLE_NAME = v_table_name;

      SET v_sql = CONCAT(
        'CREATE OR REPLACE ALGORITHM=UNDEFINED SQL SECURITY INVOKER VIEW `',
        REPLACE(p_backup_schema, '`', '``'), '`.`', REPLACE(v_table_name, '`', '``'),
        '` AS ', v_view_definition
      );
      PREPARE stmt FROM v_sql;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
    END IF;
  END LOOP;

  CLOSE cur_objects;

  SET v_sql = CONCAT(
    'CREATE TABLE `', REPLACE(p_backup_schema, '`', '``'), '`.`backup__schemata` AS ',
    'SELECT * FROM information_schema.SCHEMATA'
  );
  PREPARE stmt FROM v_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;

  SET v_sql = CONCAT(
    'CREATE TABLE `', REPLACE(p_backup_schema, '`', '``'), '`.`backup__tables` AS ',
    'SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA = ', QUOTE(p_source_schema)
  );
  PREPARE stmt FROM v_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;

  SET v_sql = CONCAT(
    'CREATE TABLE `', REPLACE(p_backup_schema, '`', '``'), '`.`backup__columns` AS ',
    'SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ', QUOTE(p_source_schema)
  );
  PREPARE stmt FROM v_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;

  SET v_sql = CONCAT(
    'CREATE TABLE `', REPLACE(p_backup_schema, '`', '``'), '`.`backup__statistics` AS ',
    'SELECT * FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ', QUOTE(p_source_schema)
  );
  PREPARE stmt FROM v_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;

  SET v_sql = CONCAT(
    'CREATE TABLE `', REPLACE(p_backup_schema, '`', '``'), '`.`backup__routines` AS ',
    'SELECT * FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ', QUOTE(p_source_schema)
  );
  PREPARE stmt FROM v_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;

  SET v_sql = CONCAT(
    'CREATE TABLE `', REPLACE(p_backup_schema, '`', '``'), '`.`backup__triggers` AS ',
    'SELECT * FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ', QUOTE(p_source_schema)
  );
  PREPARE stmt FROM v_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;

  SET v_sql = CONCAT(
    'CREATE TABLE `', REPLACE(p_backup_schema, '`', '``'), '`.`backup__events` AS ',
    'SELECT * FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ', QUOTE(p_source_schema)
  );
  PREPARE stmt FROM v_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;

  SET v_sql = CONCAT(
    'CREATE TABLE `', REPLACE(p_backup_schema, '`', '``'), '`.`backup__views` AS ',
    'SELECT * FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ', QUOTE(p_source_schema)
  );
  PREPARE stmt FROM v_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;

  SET v_sql = CONCAT(
    'CREATE TABLE `', REPLACE(p_backup_schema, '`', '``'), '`.`backup__user_privileges` AS ',
    'SELECT * FROM information_schema.USER_PRIVILEGES'
  );
  PREPARE stmt FROM v_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;

  SET v_sql = CONCAT(
    'CREATE TABLE `', REPLACE(p_backup_schema, '`', '``'), '`.`backup__schema_privileges` AS ',
    'SELECT * FROM information_schema.SCHEMA_PRIVILEGES'
  );
  PREPARE stmt FROM v_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;

  SET v_sql = CONCAT(
    'CREATE TABLE `', REPLACE(p_backup_schema, '`', '``'), '`.`backup__table_privileges` AS ',
    'SELECT * FROM information_schema.TABLE_PRIVILEGES'
  );
  PREPARE stmt FROM v_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;

  SET v_sql = CONCAT(
    'CREATE TABLE `', REPLACE(p_backup_schema, '`', '``'), '`.`backup__server_variables` AS ',
    'SELECT VARIABLE_NAME, VARIABLE_VALUE FROM information_schema.GLOBAL_VARIABLES'
  );
  PREPARE stmt FROM v_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;
END $$

DELIMITER ;

CALL backup_advertise_schema(@source_schema, @backup_schema);
DROP PROCEDURE IF EXISTS backup_advertise_schema;

SELECT CONCAT('Backup completed: ', @backup_schema) AS message;
