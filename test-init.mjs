// test-init.mjs
const DOMAIN = "to.aillm.net";
const PDA_ADDRESS = "Delivery_Real_Test_007";

async function fullFlow() {
  console.log("1️⃣ 正在初始化存证...");
  const initUrl = `https://${DOMAIN}/api/init?pda=${PDA_ADDRESS}`;
  const res = await fetch(initUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pda: PDA_ADDRESS,
      recipient: "0xRecipientPublicKey",
      hash: "sha256-content-integrity-hash"
    })
  });

  const { upload_endpoint } = await res.json();
  console.log("✅ 存证已固化。获得上传终结点:", upload_endpoint);

  console.log("2️⃣ 正在上传加密载荷至 R2...");
  const mockFileContent = "这是加密后的电子信件内容，只有收件人能解开。";
  const uploadRes = await fetch(upload_endpoint, {
    method: "PUT",
    body: mockFileContent
  });

  const uploadResult = await uploadRes.json();
  if (uploadResult.success) {
    console.log("🎉 全链路打通！文件已安全存储在 R2 桶中。");
  }
}

fullFlow();
