-- Existing installations created before campaign SNS targeting was added.
ALTER TABLE campaigns
  ADD COLUMN image_sns VARCHAR(255) NOT NULL DEFAULT '' COMMENT '이미지 광고 노출 SNS' AFTER youtube_url,
  ADD COLUMN html_sns VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'HTML 광고 노출 SNS' AFTER image_sns,
  ADD COLUMN youtube_sns VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'YouTube 광고 노출 SNS' AFTER html_sns;
