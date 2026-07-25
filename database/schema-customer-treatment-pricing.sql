ALTER TABLE customer_visits
  ADD COLUMN IF NOT EXISTS treatment_amount DECIMAL(15,0) NULL COMMENT '시술 금액(원)' AFTER treated_at,
  ADD COLUMN IF NOT EXISTS treatment_discount_rate DECIMAL(5,2) NULL COMMENT '시술 할인율(%)' AFTER treatment_amount;

UPDATE customer_visits cv
 INNER JOIN campaigns c ON c.id = cv.campaign_id
   SET cv.treatment_amount = COALESCE(cv.treatment_amount, cv.payment_amount),
       cv.treatment_discount_rate = c.discount_rate,
       cv.payment_amount = ROUND(COALESCE(cv.treatment_amount, cv.payment_amount) * (100 - c.discount_rate) / 100)
 WHERE cv.visit_type = 'treated'
   AND COALESCE(cv.treatment_amount, cv.payment_amount) IS NOT NULL;
