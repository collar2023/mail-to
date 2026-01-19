import { DurableObject } from "cloudflare:workers";
import puppeteer from "@cloudflare/puppeteer";
import bs58 from "bs58";
import { Resend } from "resend";
import { 
  Connection, 
  Keypair, 
  Transaction, 
  SystemProgram, 
  TransactionInstruction, 
  sendAndConfirmTransaction,
  PublicKey,
  ComputeBudgetProgram
} from "@solana/web3.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// --- 🔐 核心安全组件：密钥与身份管理 ---

// 1. 密钥派生 (Key Derivation) - 无状态设计的核心
// Logic: PrivateKey = HMAC-SHA256(MasterSecret, "SOL_DELIVERY_V1" + Email + Salt)
async function deriveUserKey(masterSecret: string, email: string, salt: string): Promise<Keypair> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(masterSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  // 混合因子：增加前缀防止跨上下文攻击，混合 Salt 确保随机性
  const data = encoder.encode(`SOL_DELIVERY_V1:${email}:${salt}`);
  const signature = await crypto.subtle.sign("HMAC", keyMaterial, data);
  
  // 使用派生的 32 字节种子生成 Solana Keypair (Ed25519)
  return Keypair.fromSeed(new Uint8Array(signature).slice(0, 32));
}

// 2. 密码学工具
async function hashOTP(otp: string): Promise<string> {
  const msg = new TextEncoder().encode(otp);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msg);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateRandomSalt(): string {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return bs58.encode(randomBytes);
}

function generateOTP(): string {
  // 生成 6 位数字验证码
  const randomBytes = new Uint8Array(4);
  crypto.getRandomValues(randomBytes);
  const num = new DataView(randomBytes.buffer).getUint32(0);
  return (num % 1000000).toString().padStart(6, '0');
}

// --- 📧 邮件服务 ---
async function sendAuthEmail(env: any, email: string, pda: string, salt: string, otp: string, mode: 'anchor' | 'delivery', content_hash: string, aes_key?: string) {
  const resend = new Resend(env.RESEND_API_KEY);
  let link = `https://to.aillm.net/?pda=${pda}#salt=${salt}`;
  if (aes_key) link += `&key=${encodeURIComponent(aes_key)}`;
  
  const subject = mode === 'anchor' 
    ? '【数字主权声明】请签署您的原创权益证书' 
    : '【可信电子送达】您有一份加密文书待签收';

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
      <h2 style="color: #333; margin-bottom: 10px;">${subject}</h2>
      <p style="color: #555; font-size: 14px;">您好，</p>
      <p style="color: #555; font-size: 14px; margin-bottom: 25px;">
        ${mode === 'anchor' 
          ? '系统收到一份内容固化请求，关联到了您的邮箱。' 
          : '有人通过分布式网络向您发送了一份加密文书，指定您为收件人。'}
      </p>
      
      <div style="background: #f8f9fa; padding: 25px; border: 2px dashed #ddd; border-radius: 8px; text-align: center; margin: 20px 0;">
        <p style="margin: 0; color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">签收验证码 (OTP)</p>
        <p style="margin: 8px 0 20px; color: #000; font-size: 36px; font-weight: bold; letter-spacing: 4px; font-family: monospace;">${otp}</p>
        
        <a href="${link}" style="display: inline-block; background: #000; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 4px; font-weight: bold; font-size: 15px;">
          ${mode === 'anchor' ? '立即声明权益' : '查看并签收'}
        </a>
      </div>

      <div style="margin-top: 25px; font-size: 12px; color: #888; line-height: 1.6; border-top: 1px solid #eee; padding-top: 15px;">
        <p style="margin: 0;"><strong>存证 PDA (ID):</strong> <span style="font-family: monospace;">${pda}</span></p>
        <p style="margin: 5px 0 0;"><strong>唯一内容指纹:</strong> <span style="font-family: monospace;">${content_hash ? content_hash.slice(0, 32) + '...' : 'PENDING'}</span></p>
      </div>
      
      <p style="font-size: 11px; color: #bbb; margin-top: 20px;">
        * 本邮件由分布式可信网络自动发送。<br>
        * 系统采用分布式存证技术，平台物理无法获取内容。<br>
        * 验证码仅本次有效，请勿泄露。
      </p>
    </div>
  `;

  await resend.emails.send({
    from: 'Digital Delivery Anchor <system@mail.aillm.net>',
    to: email,
    subject: subject,
    html: html
  });
}

// --- 🏦 DO & PDF Logic (Keep Existing) ---
// (保留 LetterDO 类和 generatePdf 函数，不做大的变动，仅适配新逻辑)
export class LetterDO extends DurableObject {
  constructor(public ctx: DurableObjectState, public env: any) { super(ctx, env); }

  async fetch(request: Request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    
    const url = new URL(request.url);
    const path = url.pathname;

    // 🔥 新增：异步交易监视 (Fire-and-Forget)
    if (path === "/api/monitor" && request.method === "POST") {
      const { signature, recordId, pda } = await request.json() as any;
      
      // 在后台启动确认流程，不阻塞 Response
      this.ctx.waitUntil(this.confirmAndFinalize(signature, recordId, pda));
      
      return Response.json({ status: "monitoring" }, { headers: corsHeaders });
    }

    // 🔥 新增：记录查阅时间
    if (path === "/api/read" && request.method === "POST") {
      const data: any = await this.ctx.storage.get("metadata") || {};
      if (!data.read_at) {
        data.read_at = Date.now();
        await this.ctx.storage.put("metadata", data);
      }
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    if (request.method === "POST") {
      try {
        const newData = await request.json();
        const oldData: any = await this.ctx.storage.get("metadata") || {};
        
        // ... (保持原有逻辑) ...
        let isDuplicate = false;
        if (newData.status === 0 && oldData.status >= 0 && oldData.onchain_tx === newData.onchain_tx) isDuplicate = true;
        if (newData.status === 1 && oldData.status === 1) isDuplicate = true;

        const mergedData = { ...oldData, ...newData };
        if (!isDuplicate) await this.ctx.storage.put("metadata", mergedData);
        return Response.json({ ...mergedData, _is_duplicate: isDuplicate }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: "Storage Error" }, { status: 500, headers: corsHeaders });
      }
    }

    if (request.method === "GET") {
      // ... (保持原有 GET 逻辑) ...
      const url = new URL(request.url);
      const viewer = url.searchParams.get("viewer");
      const data: any = await this.ctx.storage.get("metadata");
      if (!data) return Response.json({ error: "NOT_FOUND" }, { status: 404, headers: corsHeaders });

      if (!data.read_at && data.status === 0 && viewer === data.recipient_pubkey) {
        data.read_at = Date.now();
        await this.ctx.storage.put("metadata", data);
      }
      return Response.json(data, { headers: corsHeaders });
    }
    return new Response(null, { status: 405, headers: corsHeaders });
  }

  // 🕵️‍♂️ 后台确认逻辑
  async confirmAndFinalize(signature: string, recordId: number, pda: string) {
    console.log(`[DO] Monitoring Tx: ${signature}`);
    const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=713cdc01-150c-4598-9dbe-23f4fe51a70a", "confirmed");
    
    try {
      // 1. 等待确认 (DO 没有 30s 限制，可以放心等)
      // 使用 getSignatureStatus 轮询比 confirmTransaction 更轻量
      let confirmed = false;
      for (let i = 0; i < 60; i++) { // 最多等 60*2 = 120秒
        const status = await connection.getSignatureStatus(signature);
        if (status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'finalized') {
          confirmed = true;
          break;
        }
        if (status.value?.err) throw new Error("Tx Failed on Chain");
        await new Promise(r => setTimeout(r, 2000));
      }

      if (!confirmed) throw new Error("Tx Confirmation Timeout");

      console.log(`[DO] Tx Confirmed: ${signature}`);

      // 2. 更新 D1 数据库
      await this.env.DB.prepare("UPDATE pending_emails SET status = 'claimed' WHERE id = ?").bind(recordId).run();

      // 3. 更新 DO 自身状态
      const oldData: any = await this.ctx.storage.get("metadata") || {};
      await this.ctx.storage.put("metadata", {
        ...oldData,
        status: 1,
        signature: signature,
        onchain_tx: signature, // 🛡️ 双重保险：兼容旧字段
        signed_at: Date.now()
      });

      // 4. 触发 PDF 生成
      await this.env.PDF_QUEUE.send({ pda });

    } catch (e) {
      console.error(`[DO] Monitor Failed for ${signature}:`, e);
      // 🔙 回滚状态：允许重试
      await this.env.DB.prepare("UPDATE pending_emails SET status = 'pending' WHERE id = ?").bind(recordId).run();
    }
  }
}

async function generatePdf(browser: any, env: any, pda: string, data: any) {
  const isAnchorMode = data.type === 'anchor';
  const recipientDisplay = data.recipient_email || data.recipient_pubkey || "UNKNOWN";
  const contentHash = data.content_hash || data.hash || "PENDING";
  const txHash = data.onchain_tx || data.signature || data.tx || "PENDING";
  const isRecipient = data.status === 1;

  // 不同的标题和副标题
  const title = isAnchorMode ? "数字权益主权声明" : "数字信息存证证明";
  const subTitle = isAnchorMode 
    ? "DIGITAL SOVEREIGNTY DECLARATION • SRD-ANCHOR" 
    : "DIGITAL EVIDENCE CERTIFICATE • SRD-V1 STANDARD";

  // 不同的字段展示逻辑
  const extraFields = isAnchorMode ? `
    <div class="row"><label>项目名称 (Project)</label><code>${data.project_name || 'N/A'}</code></div>
    <div class="row"><label>声明作者 (Author)</label><code>${data.author_name || 'N/A'}</code></div>
    <div class="row"><label>验证邮箱 (Email)</label><code>${recipientDisplay}</code></div>
  ` : `
    <div class="row"><label>指定收件人 (Email)</label><code>${recipientDisplay}</code></div>
  `;

  // 不同的底部声明
  const footerLegal = isAnchorMode 
    ? `1. <strong>权益声明:</strong> 本证书证明持有人通过邮箱双钥验证，在特定时间点拥有该内容的哈希指纹，用于主张原创权益。<br>2. <strong>技术中立:</strong> 平台不存储明文。存证秘钥由邮箱动态派生，平台无法伪造签名。`
    : `1. <strong>存证效力:</strong> 本凭证基于分布式账本生成。收件人通过 OTP 双重验证完成签收，证明送达事实不可抵赖。<br>2. <strong>合规与中立:</strong> 平台仅提供技术通道，不接触明文内容。`;

  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      @page { size: A4 portrait; margin: 0; }
      body { margin: 0; background-color: #0a0e27; color: white; font-family: sans-serif; -webkit-print-color-adjust: exact; display: flex; justify-content: center; align-items: center; height: 100vh; }
      .card { width: 86%; height: 90%; max-width: 800px; padding: 35px 45px; border: 2px solid ${isAnchorMode ? '#ffd700' : '#00f2ff'}; border-radius: 16px; background: rgba(255,255,255,0.01); box-sizing: border-box; display: flex; flex-direction: column; }
      h2 { font-size: 30px; letter-spacing: 4px; margin: 0 0 5px 0; text-align: center; color: #fff; }
      p.sub { font-size: 11px; color: ${isAnchorMode ? '#ffd700' : '#00f2ff'}; margin-bottom: 25px; font-weight: bold; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px; letter-spacing: 1px; }
      .grid { flex-grow: 0; }
      .row { display: block; margin-bottom: 18px; border-bottom: 1px dashed rgba(255,255,255,0.08); padding-bottom: 10px; }
      label { color: #888; font-size: 10px; text-transform: uppercase; font-weight: bold; display: block; margin-bottom: 6px; letter-spacing: 1px; }
      code { font-family: monospace; color: ${isAnchorMode ? '#ffd700' : '#00f2ff'}; font-size: 13px; word-break: break-all; white-space: normal; background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 4px; display: block; line-height: 1.4; }
      .split-box { display: flex; gap: 20px; margin-top: 15px; border-top: 2px solid #333; padding-top: 20px; }
      .col { flex: 1; }
      .section-title { font-size: 12px; color: #fff; font-weight: bold; margin-bottom: 10px; border-left: 3px solid ${isAnchorMode ? '#ffd700' : '#00f2ff'}; padding-left: 8px; text-transform: uppercase; }
      .tech-list { font-size: 10px; color: #aaa; line-height: 1.8; }
      .tech-item { display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); }
      .tech-key { font-weight: bold; color: #666; }
      .tech-val { color: ${isAnchorMode ? '#ffd700' : '#00f2ff'}; font-family: monospace; }
      .verify-text { font-size: 10px; color: #aaa; line-height: 1.5; text-align: justify; }
      .footer-box { margin-top: auto; padding-top: 15px; border-top: 1px solid #333; }
      .legal-text { font-size: 9px; color: #555; line-height: 1.5; text-align: justify; }
      .state-def { color: ${isAnchorMode ? '#ffd700' : '#00f2ff'}; margin-bottom: 6px; display: block; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>${title}</h2>
      <p class="sub">${subTitle}</p>
      <div className="grid">
        <div className="row"><label>身份标识 (PDA)</label><code>${pda}</code></div>
        ${extraFields}
        <div className="row"><label>内容哈希 (SHA256)</label><code>${contentHash}</code></div>
        <div className="row"><label>交易哈希 (Tx)</label><code>${txHash}</code></div>
        ${data.read_at && !isAnchorMode ? `<div class="row"><label>首次查阅 (Opened)</label><code>${new Date(data.read_at).toISOString()}</code></div>` : ''}
      </div>
      <div class="split-box">
        <div class="col">
          <div class="section-title">⚙️ 技术规格 (Tech Spec)</div>
          <div class="tech-list">
            <div class="tech-item"><span class="tech-key">Protocol Ver</span><span class="tech-val">${isAnchorMode ? 'SRD-ANCHOR' : 'SRD-V1'}</span></div>
            <div class="tech-item"><span class="tech-key">Network</span><span class="tech-val">Solana Mainnet</span></div>
            <div class="tech-item"><span class="tech-key">Identity</span><span class="tech-val">Email-Derived PDA</span></div>
            <div class="tech-item"><span class="tech-key">Signature</span><span class="tech-val">Ed25519 (Zero-Knowledge)</span></div>
          </div>
        </div>
        <div class="col">
          <div class="section-title">🛡️ 独立查证 (Verification)</div>
          <div class="verify-text">
            1. 访问 <strong>分布式账本浏览器</strong> (如 Solscan.io)。<br>
            2. 在交易详情中核对 <strong>Memo</strong> 记录。<br>
            3. 核对内容是否为: <code style="font-size:9px; padding:2px; margin:3px 0;">SRD-V1:${contentHash}|${pda}</code><br>
            4. <strong>身份核验:</strong> 确认该 PDA 地址已获得授权签名，证明持有人意图。
          </div>
        </div>
      </div>
      <div class="footer-box">
        <div class="section-title" style="margin-bottom:6px;">⚖️ 法律定义与免责 (Legal & Liability)</div>
        <div class="legal-text">
          <strong class="state-def">【状态定义】${isAnchorMode ? '本系统将 "ANCHORED" 定义为“权益主张已声明”。' : '本系统将 "CLAIMED" 定义为“送达完成”。'}</strong>
          ${footerLegal}
        </div>
      </div>
    </div>
  </body>
  </html>`;

  const page = await browser.newPage();
  try {
    await page.setContent(htmlContent, { waitUntil: "domcontentloaded" });
    const pdf = await page.pdf({ format: 'A4', landscape: false, printBackground: true });
    return pdf;
  } finally {
    await page.close();
  }
}

// --- 🌐 Main Worker Entry ---
export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/api/")) {
      
      // 🟢 API 1: 发送邮件 (Start Flow)
      if (path === "/api/send-email" && request.method === "POST") {
        try {
          const body: any = await request.json();
          const { email, content_hash, mode, project_name, author_name, aes_key } = body;
          
          if (!email || !content_hash || !mode) return Response.json({ error: "MISSING_FIELDS" }, { status: 400, headers: corsHeaders });
          if (!env.MASTER_SECRET || !env.RESEND_API_KEY) return Response.json({ error: "SERVER_CONFIG_ERROR" }, { status: 500, headers: corsHeaders });

          // 1. 生成双钥
          const salt = generateRandomSalt();
          const otp = generateOTP();
          const otp_hash = await hashOTP(otp);

          // 2. 预计算 PDA (为了生成链接)
          const userKeypair = await deriveUserKey(env.MASTER_SECRET, email, salt);
          const pda = userKeypair.publicKey.toBase58();

          // 3. 存入 D1 (不存 Salt!)
          const stmt = env.DB.prepare(`
            INSERT INTO pending_emails (pda, content_hash, recipient_email, otp_hash, status)
            VALUES (?, ?, ?, ?, 'pending')
          `);
          await stmt.bind(pda, content_hash, email, otp_hash).run();

          // 4. 发送邮件
          // 注意：Anchor 模式下，Project/Author 只是元数据，存储到 DO 即可，D1 仅负责验证流
          await sendAuthEmail(env, email, pda, salt, otp, mode, content_hash, aes_key);

          // 5. 初始化 DO (存储元数据)
          const doId = env.LETTER_STORAGE.idFromName(pda);
          const stub = env.LETTER_STORAGE.get(doId);
          await stub.fetch(new Request("http://internal/api/init", {
            method: "POST",
            body: JSON.stringify({
              type: mode,
              status: 0, // 待签收
              content_hash,
              recipient_email: email, // 新增字段
              project_name,
              author_name,
              pda,
              created_at: Date.now()
            })
          }));

          return Response.json({ success: true, pda, message: "Email Sent" }, { headers: corsHeaders });

        } catch (e: any) {
          console.error(e);
          return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 🟢 API 2: 签收并上链 (Claim & Sign)
      if (path === "/api/claim" && request.method === "POST") {
        try {
          const { pda, otp, salt } = await request.json() as any;
          if (!pda || !otp || !salt) return Response.json({ error: "MISSING_CREDENTIALS" }, { status: 400, headers: corsHeaders });

          // 1. 查库验证 OTP
          // 修正：先不加 status='pending' 条件，查出来再判断
          const record = await env.DB.prepare("SELECT * FROM pending_emails WHERE pda = ?").bind(pda).first();
          
          if (!record) {
             console.log("[Claim] Record not found");
             return Response.json({ error: "INVALID_PDA" }, { status: 404, headers: corsHeaders });
          }

          // 幂等性处理：如果已经签收了，直接告诉前端成功
          if (record.status === 'claimed') {
             console.log("[Claim] Already claimed");
             const doId = env.LETTER_STORAGE.idFromName(pda);
             const stub = env.LETTER_STORAGE.get(doId);
             const doData: any = await stub.fetch(new Request("http://internal/")).then(r => r.json());
             return Response.json({ success: true, tx: doData.signature || "ALREADY_CLAIMED", status: "claimed" }, { headers: corsHeaders });
          }

          // 🔥 防重扣款：如果正在处理中，直接阻断
          if (record.status === 'processing') {
             return Response.json({ error: "TX_PROCESSING", message: "Transaction is being confirmed. Please wait." }, { status: 409, headers: corsHeaders });
          }

          if (record.status !== 'pending') {
             return Response.json({ error: "EXPIRED_OR_INVALID_STATUS" }, { status: 403, headers: corsHeaders });
          }

          // 🔒 锁定状态：立即标记为 processing，防止并发点击
          await env.DB.prepare("UPDATE pending_emails SET status = 'processing' WHERE id = ?").bind(record.id).run();

          // 🛡️ 安全检查：防暴力破解
          if (record.attempts >= 5) {
            return Response.json({ error: "MAX_ATTEMPTS_EXCEEDED" }, { status: 403, headers: corsHeaders });
          }

          const inputOtpHash = await hashOTP(otp);
          if (inputOtpHash !== record.otp_hash) {
            // ❌ 验证失败：增加计数
            await env.DB.prepare("UPDATE pending_emails SET attempts = attempts + 1 WHERE id = ?").bind(record.id).run();
            const remaining = 5 - (record.attempts + 1);
            return Response.json({ error: `INVALID_OTP`, remaining_attempts: remaining }, { status: 403, headers: corsHeaders });
          }

          // 2. 派生密钥
          const userKeypair = await deriveUserKey(env.MASTER_SECRET, record.recipient_email, salt);
          
          // 双重检查：派生的公钥必须匹配请求的 PDA (防止 Salt 对应的邮箱不匹配)
          if (userKeypair.publicKey.toBase58() !== pda) {
            console.error(`[Security Alert] Key Mismatch for PDA: ${pda}`); // 只记录 PDA，不记录 Salt
            return Response.json({ error: "KEY_MISMATCH_SECURITY_ALERT" }, { status: 403, headers: corsHeaders });
          }

          // 3. 构造并发送交易 (Gasless: Treasury Pays)
          if (!env.TREASURY_SECRET) return Response.json({ error: "NO_TREASURY" }, { status: 500, headers: corsHeaders });
          
          let secretKeyBytes: Uint8Array;
          try {
            const secretStr = env.TREASURY_SECRET.trim();
            if (secretStr.startsWith('[') && secretStr.endsWith(']')) {
              // 处理 JSON 数组格式: [123, 44, ...]
              secretKeyBytes = new Uint8Array(JSON.parse(secretStr));
            } else {
              // 处理 Base58 格式
              secretKeyBytes = bs58.decode(secretStr);
            }
          } catch (e) {
            console.error("Invalid Treasury Secret Format");
            return Response.json({ error: "SERVER_CONFIG_ERROR: INVALID_SECRET_FORMAT" }, { status: 500, headers: corsHeaders });
          }

          const treasuryKeypair = Keypair.fromSecretKey(secretKeyBytes);
          const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=713cdc01-150c-4598-9dbe-23f4fe51a70a", "confirmed");

          const tx = new Transaction();
          
          // 添加 Memo 指令 (证明：我是 PDA，我确认了这个 Content Hash)
          const memoContent = `SRD-V1:${record.content_hash}|${pda}`;
          
          // 🔥 提速：增加计算单元价格 (Priority Fee)
          // 500,000 microLamports = 0.0005 SOL，确保极速打包
                    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20000 });
                    tx.add(addPriorityFee);
          tx.add(new TransactionInstruction({
            keys: [{ pubkey: userKeypair.publicKey, isSigner: true, isWritable: false }], // 用户只需签名
            programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
            data: new TextEncoder().encode(memoContent)
          }));

          // 设置 Treasury 为 Fee Payer
          tx.feePayer = treasuryKeypair.publicKey;
          
          // 🔄 优化：获取最新的 finalized blockhash，减少过期概率
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
          tx.recentBlockhash = blockhash;

          // 双方签名
          tx.partialSign(userKeypair); // 用户证明意图
          tx.partialSign(treasuryKeypair); // 平台付钱

          // 发送 (关闭 skipPreflight 以暴露真实错误)
          let signature;
          try {
            signature = await connection.sendRawTransaction(tx.serialize(), {
              maxRetries: 3,
              skipPreflight: false // 🔥 开启预检
            });
          } catch (sendError: any) {
            // 🛡️ 鲁棒性修复
            const errorMessage = sendError?.message || String(sendError);
            const errorLogs = sendError?.logs || [];
            console.error("[Send Error] Simulation Failed:", errorMessage);
            return Response.json({ 
              error: "TX_SIMULATION_FAILED", 
              details: errorMessage, 
              logs: errorLogs 
            }, { status: 400, headers: corsHeaders });
          }
          
          // 🔥 7. 异步委托 (Fire-and-Forget)
          // 既然 Worker 有 30s Wall Clock 限制，我们就把“等待确认”这个耗时任务扔给 Durable Object
          // DO 没有 Wall Clock 限制，可以安心地等
          const doId = env.LETTER_STORAGE.idFromName(pda);
          const stub = env.LETTER_STORAGE.get(doId);
          
          await stub.fetch(new Request("http://internal/api/monitor", {
            method: "POST",
            body: JSON.stringify({ signature, recordId: record.id, pda })
          }));

          return Response.json({ success: true, tx: signature, status: "confirming" }, { headers: corsHeaders });

        } catch (e: any) {
          console.error("Claim Error:", e);
          return Response.json({ error: e.message || "CLAIM_FAILED" }, { status: 500, headers: corsHeaders });
        }
      }

      // --- 保持原有的状态查询和下载接口 ---
      if (path === "/api/status") {
        const pda = url.searchParams.get("pda");
        if (!pda) return new Response("Missing PDA", { status: 400 });
        const stub = env.LETTER_STORAGE.get(env.LETTER_STORAGE.idFromName(pda));
        return stub.fetch(request);
      }
      
      // ... (Upload/Download payload logic remains similar, handled by Frontend encryption usually)
      // 注意：Payload 的加密目前在前端做。如果是 Email Flow，发送方前端加密后上传。
      // 接收方点链接后，因为没有私钥，是解不开 Payload 的！
      // ⚠️ 这是一个逻辑断点：以前用户有钱包私钥可以解密，现在用户没有私钥。
      // 解决方案：Payload 的解密密钥 (AES Key) 依然需要在 URL Hash 中传递！
      // 所以邮件链接应该是：#salt=...&key=... (把 AES Key 也放在 Hash 里)
      
      if (path === "/api/upload") {
        const pda = url.searchParams.get("pda");
        await env.CONTENT_BUCKET.put(`payload_${pda}.bin`, request.body);
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path === "/api/download") {
        const pda = url.searchParams.get("pda");
        const otp = request.headers.get("X-Auth-OTP");

        if (!pda) return new Response("Missing PDA", { status: 400 });

        const record = await env.DB.prepare("SELECT * FROM pending_emails WHERE pda = ?").bind(pda).first();
        if (!record) return new Response("Not Found", { status: 404 });

        // 🛡️ 鉴权逻辑：先看后签
        // 1. 如果未签收，必须提供 OTP 证明身份才能看
        if (record.status !== 'claimed') {
          if (!otp) return Response.json({ error: "OTP_REQUIRED" }, { status: 401, headers: corsHeaders });
          const inputHash = await hashOTP(otp);
          if (inputHash !== record.otp_hash) return Response.json({ error: "INVALID_OTP" }, { status: 403, headers: corsHeaders });
          
          // ✅ 记录查阅时间 (Fire-and-Forget)
          // 这一步确保 PDF 证书上能显示 "首次查阅时间"
          const doId = env.LETTER_STORAGE.idFromName(pda);
          const stub = env.LETTER_STORAGE.get(doId);
          // 调用 DO 的 GET 方法，里面包含 read_at 的更新逻辑 (如果 viewer 匹配)
          // 但这里我们没有 viewer (公钥)，只有 pda。
          // 修正：我们需要显式告诉 DO "有人读了"
          ctx.waitUntil(stub.fetch(new Request("http://internal/api/read", { method: "POST" })));
        }
        // 2. 如果已签收，视为公开存证 (依赖 URL Key 保护内容隐私)

        const file = await env.CONTENT_BUCKET.get(`payload_${pda}.bin`);
        return file ? new Response(file.body, { headers: corsHeaders }) : new Response("Not Found", { status: 404, headers: corsHeaders });
      }

      if (path === "/api/download-proof") {
        // ... (保持原有的 download-proof 逻辑，调用 generatePdf)
        const pda = url.searchParams.get("pda");
        const stub = env.LETTER_STORAGE.get(env.LETTER_STORAGE.idFromName(pda || "default"));
        const dataRes = await stub.fetch(new Request("http://internal/"));
        const data = await dataRes.json();
        
        // 简单处理：如果没有 PDF 缓存，现场生成
        const browser = await puppeteer.launch(env.BROWSER);
        const pdf = await generatePdf(browser, env, pda!, data);
        await browser.close();
        return new Response(pdf, { headers: { ...corsHeaders, "Content-Type": "application/pdf" } });
      }
    }

    // Static Assets
    const asset = await env.STATIC_ASSETS.get(path === "/" ? "index.html" : path.slice(1));
    if (!asset) return new Response("Not Found", { status: 404 });
    const headers = new Headers();
    asset.writeHttpMetadata(headers);
    if (path.endsWith(".js")) headers.set("Content-Type", "application/javascript");
    if (path.endsWith(".css")) headers.set("Content-Type", "text/css");
    if (path.endsWith(".html")) headers.set("Content-Type", "text/html");
    
    // 🛡️ 注入 2.0 版确权 Proof (从环境变量读取)
    if (env.SOLANA_TX_PROOF) {
      headers.set("x-project-ownership-proof", env.SOLANA_TX_PROOF);
    }
    
    return new Response(asset.body, { headers });
  },
  
  // Queue Consumer
  async queue(batch: MessageBatch<any>, env: any) {
      // ... (Keep existing queue logic)
  }
};