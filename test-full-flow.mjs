// test-full-flow.mjs
const DOMAIN = "to.aillm.net";
const PDA_ID = "HARDCORE_PRO_TEST_" + Math.floor(Math.random() * 1000);

async function run() {
  console.log(`🚀 开始 VPS 终端硬核验证: ${PDA_ID}`);

  // 1. 初始化 (写入基础事实)
  console.log("1️⃣ 发起存证初始化...");
  await fetch(`https://${DOMAIN}/api/init?pda=${PDA_ID}`, {
    method: 'POST',
    body: JSON.stringify({ recipient: "Solana_Alice_Pubkey", hash: "sha256-encrypted-payload-v1" })
  });

  // 2. 上传负载 (存入 R2)
  console.log("2️⃣ 上传密文负载至 R2...");
  await fetch(`https://${DOMAIN}/api/upload?pda=${PDA_ID}`, {
    method: 'PUT',
    body: "--- THIS IS ENCRYPTED MILITARY GRADE DATA ---"
  });

  // 3. 模拟签收 (更新 SQLite 状态)
  console.log("3️⃣ 模拟钱包签收动作...");
  const signRes = await fetch(`https://${DOMAIN}/api/sign?pda=${PDA_ID}`, {
    method: 'POST',
    body: JSON.stringify({ signature: "MOCK_ONCHAIN_SIGNATURE_DATA_0x789" })
  });
  const signData = await signRes.json();
  console.log("   签收回执:", signData.success ? "✅ 成功" : "❌ 失败");

  // 4. 最终取货 (验证门禁)
  console.log("4️⃣ 验证签收后下载权限...");
  const dlRes = await fetch(`https://${DOMAIN}/api/download?pda=${PDA_ID}`);
  if (dlRes.ok) {
    const content = await dlRes.text();
    console.log("🎉 验证成功！取回内容:", content);
  } else {
    console.log("❌ 验证失败！错误信息:", await dlRes.json());
  }
}

run();
