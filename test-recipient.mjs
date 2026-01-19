// test-recipient.mjs
const DOMAIN = "to.aillm.net";
const PDA_ID = "Delivery_Real_Test_007";

async function simulateRecipient() {
  console.log(`👤 收件人开始操作 [ID: ${PDA_ID}]`);

  // 1. 尝试直接下载 (预期失败)
  console.log("1️⃣ 尝试未签收下载...");
  const failRes = await fetch(`https://${DOMAIN}/api/download?pda=${PDA_ID}`);
  console.log("❌ 下载结果:", await failRes.json());

  // 2. 执行签收 (修改状态)
  console.log("2️⃣ 正在执行电子签收...");
  const signRes = await fetch(`https://${DOMAIN}/api/sign?pda=${PDA_ID}`, {
    method: "POST",
    body: JSON.stringify({ signature: "mock_signature_data" })
  });
  console.log("✅ 签收结果:", await signRes.json());

  // 3. 再次尝试下载 (预期成功)
  console.log("3️⃣ 签收后再次尝试下载...");
  const successRes = await fetch(`https://${DOMAIN}/api/download?pda=${PDA_ID}`);
  
  if (successRes.ok) {
    const content = await successRes.text();
    console.log("🎉 下载成功！文件内容:", content);
  } else {
    console.log("❌ 依然下载失败");
  }
}

simulateRecipient();
