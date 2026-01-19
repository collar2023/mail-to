-- Migration number: 0002_email_flow
-- strictly typed SQLite

-- 这个表用于暂存“待验证”的邮件请求
-- 无论是“送达”还是“锚定”，只要发了邮件，就进这里
CREATE TABLE pending_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- 核心业务字段
  pda TEXT NOT NULL,              -- 对应链上的 PDA 地址 (作为唯一索引)
  content_hash TEXT NOT NULL,     -- 内容指纹
  recipient_email TEXT NOT NULL,  -- 收件人/锚定人邮箱
  
  -- 安全字段 (双钥机制)
  otp_hash TEXT NOT NULL,         -- 仅存储 Hash(OTP)，不存明文 OTP
  -- 注意：Salt 绝对不存！Salt 在邮件链接里！
  
  -- 状态管理
  status TEXT DEFAULT 'pending',  -- pending(已发邮件), claimed(已上链), expired(已过期)
  attempts INTEGER DEFAULT 0,     -- 安全：重试次数限制
  created_at INTEGER DEFAULT (unixepoch())
);

-- 索引，加速查询
CREATE INDEX idx_pda_lookup ON pending_emails(pda);
CREATE INDEX idx_email_status ON pending_emails(recipient_email, status);
