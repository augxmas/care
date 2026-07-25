-- 캠페인 수집 폼 옵션 컬럼 추가
-- 기존 DB에 1회 적용:
-- mariadb -h localhost -u advertiser -p advertise < database/schema-campaign-form.sql

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS collect_item_options TEXT COMMENT '수집항목별 폼 옵션 JSON' AFTER collect_items;
