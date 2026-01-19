import { Buffer } from 'buffer';
if (typeof window !== 'undefined') { window.Buffer = window.Buffer || Buffer; }
import React, { useState, useEffect } from 'react';
import JSZip from 'jszip'; 
import './App.css';

// --- 工具库：加密与辅助 ---
async function calculateHash(data: Uint8Array): Promise<string> {
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = { 'pdf': 'application/pdf', 'png': 'image/png', 'jpg': 'image/jpeg', 'txt': 'text/plain', 'doc': 'application/msword', 'zip': 'application/zip' };
  return map[ext || ''] || 'application/octet-stream';
}

const CryptoSuite = {
  generateKey: async () => window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]),
  exportKey: async (key: CryptoKey) => arrayBufferToBase64(await window.crypto.subtle.exportKey("raw", key)),
  importKey: async (base64Key: string) => window.crypto.subtle.importKey("raw", base64ToArrayBuffer(base64Key), "AES-GCM", true, ["encrypt", "decrypt"]),
  encrypt: async (data: Uint8Array | string, key: CryptoKey) => {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedData = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const ciphertext = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encodedData);
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv); combined.set(new Uint8Array(ciphertext), iv.length);
    return arrayBufferToBase64(combined.buffer);
  },
  decrypt: async (encryptedBase64: string, key: CryptoKey) => {
    const raw = base64ToArrayBuffer(encryptedBase64);
    const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
    return new Uint8Array(decrypted);
  }
};

function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type ProcessStep = 'idle' | 'encrypting' | 'uploading' | 'sending_email' | 'done' | 'verifying_otp' | 'verified_view' | 'signing' | 'success';
type AppMode = 'delivery' | 'anchor';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('delivery');
  
  // 发送端状态
  const [projectName, setProjectName] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const [payload, setPayload] = useState(""); 
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [processStep, setProcessStep] = useState<ProcessStep>('idle');
  const [sentResult, setSentResult] = useState<{email: string, pda: string, key: string} | null>(null);

  // 接收端状态
  const [pda, setPda] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [hashParams, setHashParams] = useState<{salt?: string, key?: string}>({});
  const [otpInput, setOtpInput] = useState("");
  const [decryptedAttachments, setDecryptedAttachments] = useState<Array<{name: string, url: string, size: number}>>([]);
  const [claimTx, setClaimTx] = useState<string>("");
  const [isVerified, setIsVerified] = useState(false); // 是否已通过 OTP 验证并查看过内容

  // 初始化
  useEffect(() => { 
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('pda');
    const hash = window.location.hash.slice(1); 
    const params: any = {};
    hash.split('&').forEach(part => {
      const [k, v] = part.split('=');
      if (k && v) params[k] = decodeURIComponent(v);
    });

    if (id) {
      setPda(id);
      setHashParams(params);
      fetchStatus(id);
    }
  }, []);

  const fetchStatus = (id: string) => { 
    fetch(`/api/status?pda=${id}`) 
      .then(r => r.json())
      .then(d => { setStatus(d.error ? null : d); })
      .catch(console.error); 
  };

  const handleCreate = async () => {
    if (mode === 'delivery' && !targetEmail) return alert("请输入收件人邮箱");
    if (mode === 'anchor' && (!projectName || !authorName || !targetEmail)) return alert("请完整填写信息");
    if (!payload && (!selectedFiles || selectedFiles.length === 0)) return alert("请填写内容或上传文件");

    const email = targetEmail;

    try {
      setProcessStep('encrypting');
      const zip = new JSZip();
      if (payload) zip.file("message.txt", payload);
      if (selectedFiles && selectedFiles.length > 0) { 
        const attachFolder = zip.folder("attachments"); 
        Array.from(selectedFiles).forEach(file => attachFolder?.file(file.name, file)); 
      }
      const zipContent = await zip.generateAsync({ type: "uint8array" });
      const key = await CryptoSuite.generateKey(); 
      const encryptedBlobStr = await CryptoSuite.encrypt(zipContent, key); 
      const keyStr = await CryptoSuite.exportKey(key); 
      const contentHash = await calculateHash(base64ToArrayBuffer(encryptedBlobStr));

      setProcessStep('sending_email');
      const sendRes = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, email, content_hash: contentHash, project_name: projectName, author_name: authorName, aes_key: keyStr })
      });
      
      const sendData = await sendRes.json();
      if (!sendRes.ok) throw new Error(sendData.error || "Email sending failed");
      const pdaId = sendData.pda;

      setProcessStep('uploading');
      const uploadRes = await fetch(`/api/upload?pda=${pdaId}`, { method: 'PUT', body: encryptedBlobStr });
      if (!uploadRes.ok) throw new Error("Payload upload failed");

      setProcessStep('done');
      setSentResult({ email, pda: pdaId, key: keyStr });
    } catch (e: any) { alert("Error: " + e.message); setProcessStep('idle'); }
  };

  // Phase 1: 验证 OTP 并解密查看
  const handleVerifyAndview = async () => {
    if (!otpInput || otpInput.length !== 6) return alert("请输入6位验证码");
    if (!hashParams.salt || !hashParams.key) return alert("链接无效或缺少密钥");

    try {
      setProcessStep('verifying_otp');
      
      // 调用下载接口，带上 OTP Header
      const resp = await fetch(`/api/download?pda=${pda}`, {
        headers: { 'X-Auth-OTP': otpInput }
      });

      if (resp.status === 401 || resp.status === 403) throw new Error("验证码错误或权限不足");
      if (!resp.ok) throw new Error("下载失败，请稍后重试");

      const encryptedText = await resp.text(); 
      
      // 解密逻辑
      const key = await CryptoSuite.importKey(hashParams.key); 
      const decryptedUint8 = await CryptoSuite.decrypt(encryptedText, key); 
      const zip = await JSZip.loadAsync(decryptedUint8); 
      const msgFile = zip.file("message.txt"); 
      if (msgFile) setPayload(await msgFile.async("string")); 
      
      const attachmentsList: any[] = []; 
      const attachFolder = zip.folder("attachments");
      if (attachFolder) {
          const promises: any[] = [];
          attachFolder.forEach((p, f) => { if(!f.dir) promises.push(f.async("blob").then(b => { attachmentsList.push({ name: p, url: URL.createObjectURL(b), size: b.size }); })); });
          await Promise.all(promises);
      }
      setDecryptedAttachments(attachmentsList);
      
      // 成功解密，进入 Phase 2
      setIsVerified(true);
      setProcessStep('verified_view');

    } catch (e: any) { 
      alert("验证失败: " + e.message); 
      setProcessStep('idle'); 
    }
  };

  // Phase 2: 正式签收并云端固化
  const handleSignOnChain = async () => {
    try {
      setProcessStep('signing');
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pda, otp: otpInput, salt: hashParams.salt })
      });
      const data = await res.json();
      
      if (res.status === 409) {
        alert("正在云端确认中，请稍候...");
        setProcessStep('success'); 
        return;
      }

      if (!res.ok) throw new Error(data.error || "Claim failed");
      
      setClaimTx(data.tx); 
      setProcessStep('success'); 
      setStatus((prev: any) => ({ ...prev, status: 1, signature: data.tx }));
      
    } catch (e: any) { alert("云端固化失败: " + e.message); setProcessStep('verified_view'); }
  };

  const downloadProof = (idOverride?: string) => { const id = idOverride || pda; if (id) window.open(`/api/download-proof?pda=${id}`, '_blank'); };

  if (sentResult) {
    const receiptLink = `${window.location.origin}/?pda=${sentResult.pda}#key=${encodeURIComponent(sentResult.key)}`;
    return (
      <div className="fortress-bg">
        <div className="glass-panel center-mode">
          <div className="success-icon">📨</div>
          <h2>加密文书已发出</h2>
          <p>系统已向 <strong>{sentResult.email}</strong> 发送了一封包含安全链接的邮件。</p>
          <div className="info-box">
             <label style={{fontSize: '11px', color: '#666', textTransform: 'uppercase', marginBottom: '10px', display: 'block'}}>您的发信存根 (含解密密钥)</label>
             <code className="share-link" onClick={() => {navigator.clipboard.writeText(receiptLink); alert("存根链接已复制");}}>{receiptLink}</code>
          </div>
          <p className="sub-text" style={{fontSize: '13px', color: '#888', marginBottom: '25px'}}>请妥善保存存根。您可以凭此链接追踪签收状态或证明原创权。(注: 如未收到邮件，请检查垃圾箱)</p>
          <div className="btn-group">
            <button className="gold-btn outline" onClick={() => downloadProof(sentResult.pda)}>📥 下载发信回执 (PDF)</button>
            <button className="gold-btn success" onClick={() => window.location.reload()}>✍️ 发起新文书</button>
          </div>
        </div>
      </div>
    );
  }

  if (pda) {
    const isAnchor = status?.type === 'anchor';
    const isClaimed = status?.status === 1;
    
    // 如果已经上链，或者用户已经验证通过，都应该显示内容
    const showContent = isClaimed || isVerified;

    return (
      <div className={`fortress-bg ${isAnchor ? 'anchor-theme' : ''}`}>
        <header className="top-nav"><div className="brand">Digital Delivery & Sovereignty Anchor</div><div className="status-badge">{isClaimed ? '✅ 已签收' : '⏳ 待签收'}</div></header>
        <main className="stage">
          <div className="recipient-view">
            <div className="evidence-card-wrapper"><EvidenceCard pda={pda} status={status} /></div>
            <div className="action-panel">
              {/* 如果还没验证 OTP，显示验证框 */}
              {!showContent && (
                <div className="claim-zone">
                  <h3>🔐 身份验证与开信</h3>
                  <p>请输入邮件中的 6 位验证码以解密查看内容。</p>
                  {!hashParams.salt ? <div className="error-box">⚠️ 链接缺少凭证 (Salt)</div> : (
                    <>
                      <input type="text" maxLength={6} placeholder="000000" className="otp-input" value={otpInput} onChange={e => setOtpInput(e.target.value.replace(/\D/g,''))} />
                      <button className="gold-btn" onClick={handleVerifyAndview} disabled={processStep === 'verifying_otp'}>{processStep === 'verifying_otp' ? "正在解密..." : "🔓 验证并查看原文"}</button>
                    </>
                  )}
                </div>
              )}

              {/* 如果已验证/已展示内容 */}
              {showContent && (
                <div className="success-zone">
                  {(payload || decryptedAttachments.length > 0) && (
                    <div className="decrypted-content">
                      <div style={{marginBottom:'10px', color:'#aaa', fontSize:'12px'}}>👇 原文内容 (解密后可见):</div>
                      {payload && <textarea readOnly value={payload} className="read-only-area" />}
                      {decryptedAttachments.map((f, i) => (<div key={i} className="file-row"><span>📎 {f.name}</span><a href={f.url} download={f.name}>下载</a></div>))}
                    </div>
                  )}

                  {/* 关键：如果还没云端固化，显示巨大的签收按钮 */}
                  {!isClaimed ? (
                    <div style={{marginTop: '25px', textAlign:'center', borderTop:'1px dashed #444', paddingTop:'20px'}}>
                      <p style={{color: '#ffd700', marginBottom:'15px'}}>⚠️ 您已查阅内容。请确认无误后，点击下方按钮完成云端存证。</p>
                      <button className="gold-btn pulse" onClick={handleSignOnChain} disabled={processStep === 'signing'}>{processStep === 'signing' ? "正在固化..." : "✍️ 确认无误，正式签收 (云端固化)"}</button>
                    </div>
                  ) : (
                    <div className="btn-group" style={{marginTop: '20px'}}>
                      <button className="gold-btn outline" onClick={() => downloadProof()}>📥 下载签收证书 (PDF)</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`fortress-bg ${mode === 'anchor' ? 'anchor-theme' : ''}`}>
      <header className="top-nav"><div className="brand">Digital Delivery & Sovereignty Anchor</div></header>
      <main className="stage">
        <div className="sender-view">
          <h1 className="hero-title">{mode === 'delivery' ? '全球信息数字送达系统' : '原创权益数字主权声明'}</h1>
          <div className="hero-slogan">
            {mode === 'delivery' ? (
              <div className="slogan-row"><span>端到端加密全球秒达</span><span className="spacer-h"></span><span>内容完整性送达事实双验证</span></div>
            ) : (
              <div className="slogan-row"><span>为思想上锁 为价值锚定</span><span className="spacer-h"></span><span>分布式固化 存证即确权</span></div>
            )}
          </div>
          <div className="mode-toggle">
            <button className={mode === 'delivery' ? 'active' : ''} onClick={() => setMode('delivery')}>📬 数字送达</button>
            <button className={mode === 'anchor' ? 'active' : ''} onClick={() => setMode('anchor')}>⚖️ 主权锚定</button>
          </div>
          <div className="glass-panel">
            <textarea placeholder={mode === 'delivery' ? "输入送达文书正文..." : "输入原创作品简介..."} className="fortress-area" value={payload} onChange={e=>setPayload(e.target.value)} />
            <div className="file-upload-zone"><input type="file" id="fInput" multiple className="hidden-input" onChange={e=>setSelectedFiles(e.target.files)}/><label htmlFor="fInput" className="upload-btn">📎 添加附件 {selectedFiles?.length ? `(${selectedFiles.length})` : ""}</label></div>
            <div className="input-group">
              {mode === 'anchor' && <div className="input-row" style={{marginBottom: '18px'}}><input placeholder="项目名称" className="fortress-input" style={{margin:0, marginRight:'10px'}} value={projectName} onChange={e=>setProjectName(e.target.value)} /><input placeholder="作者姓名" className="fortress-input" style={{margin:0}} value={authorName} onChange={e=>setAuthorName(e.target.value)} /></div>}
              <input placeholder={mode === 'delivery' ? "收件人邮箱" : "您的邮箱"} className="fortress-input" value={targetEmail} onChange={e=>setTargetEmail(e.target.value)} />
            </div>
            <button className={`gold-btn ${mode === 'anchor' ? 'anchor-btn' : ''}`} onClick={handleCreate} disabled={processStep !== 'idle'}>{processStep === 'idle' ? "立即云端固化并发送邮件" : "处理中..."}</button>
          </div>
        </div>
      </main>
    </div>
  );
};

const EvidenceCard = ({ pda, status }: any) => {
  const isAnchor = status?.type === 'anchor';
  return (
    <div className={`landscape-card pro-view ${isAnchor ? 'anchor-card' : ''}`}>
      <div className="card-top"><h2>{isAnchor ? '数字权益主权声明' : '数字存证证明'}</h2></div>
      <div className="card-grid">
        <div className="row"><label>存证 PDA:</label><code>{pda}</code></div>
        {isAnchor ? (
          <><div className="row"><label>项目名称:</label><code>{status?.project_name}</code></div><div className="row"><label>声明作者:</label><code>{status?.author_name}</code></div></>
        ) : (
          <div className="row"><label>收件人:</label><code>{status?.recipient_email}</code></div>
        )}
        <div className="row"><label>内容哈希:</label><code>{status?.content_hash}</code></div>
        <div className="row"><label>交易哈希:</label><code>{status?.onchain_tx || status?.signature || "PENDING"}</code></div>
      </div>
    </div>
  );
};

export default App;
