CREATE TABLE IF NOT EXISTS medellin_store_orders (
  id VARCHAR(36) PRIMARY KEY,
  mp_order_id VARCHAR(64) NULL UNIQUE,
  mp_payment_id VARCHAR(64) NULL,
  passport VARCHAR(64) NOT NULL,
  nick VARCHAR(100) NOT NULL,
  license VARCHAR(160) NOT NULL,
  email VARCHAR(160) NOT NULL,
  diamonds INT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'created',
  delivered TINYINT(1) NOT NULL DEFAULT 0,
  delivered_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_passport (passport),
  INDEX idx_license (license),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Se você já instalou uma versão anterior da tabela e ela ainda não possui
-- a coluna license, execute APENAS a linha abaixo uma vez:
-- ALTER TABLE medellin_store_orders ADD COLUMN license VARCHAR(160) NOT NULL AFTER nick, ADD INDEX idx_license (license);


-- Migração da V5 (Payments API) para V6 (Orders API):
ALTER TABLE medellin_store_orders ADD COLUMN IF NOT EXISTS mp_order_id VARCHAR(64) NULL AFTER id;
ALTER TABLE medellin_store_orders ADD UNIQUE INDEX IF NOT EXISTS uq_mp_order_id (mp_order_id);
