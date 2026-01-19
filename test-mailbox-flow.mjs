

const DOMAIN = "to.aillm.net";
const PROTOCOL = "https";
const PDA_ID = "MAILBOX_TEST_" + Math.floor(Math.random() * 100000);
const SENDER = "Sender_Mock_Wallet_Addr_555";
const RECIPIENT = "Recipient_Mock_Wallet_999";

async function run() {
  console.log(`🚀 开始 Mailbox D1 索引测试 (Production): ${PDA_ID}`);
  console.log(`📧 发件人: ${SENDER}`);
  console.log(`📩 收件人: ${RECIPIENT}`);

  // 1. 发信 (触发 D1 写入)
  console.log("\n1️⃣ 发起存证初始化 (Init)...");
  const initRes = await fetch(`${PROTOCOL}://${DOMAIN}/api/init?pda=${PDA_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      recipient: RECIPIENT, 
      hash: "sha256-content-hash",
      onchain_tx: "TEST_BYPASS_" + PDA_ID, 
      content_hash: "sha256-content-hash"
    })
  });
  console.log(`   Init Status: ${initRes.status}`);
  if (!initRes.ok) {
    console.error("❌ Init Failed:", await initRes.text());
    return;
  }

  // 等待一下 D1 异步写入 (waitUntil 是异步的)
  console.log("   ⏳ 等待 3秒 让 D1 完成异步写入...");
  await new Promise(r => setTimeout(r, 3000));

  // 2. 查发件箱
  console.log("\n2️⃣ 检查发件箱 (Sender Mailbox)...");
  const senderBoxRes = await fetch(`${PROTOCOL}://${DOMAIN}/api/mailbox?wallet=${SENDER}&role=sender`);
  const senderData = await senderBoxRes.json();
  const foundInSender = senderData.data?.find(item => item.pda === PDA_ID);
  
  if (foundInSender) {
    console.log("   ✅ 发件箱验证成功!");
    console.log("   记录详情:", foundInSender);
  } else {
    console.error("   ❌ 发件箱未找到该记录!", senderData);
  }

  // 3. 查收件箱
  console.log("\n3️⃣ 检查收件箱 (Recipient Mailbox)...");
  const recipientBoxRes = await fetch(`${PROTOCOL}://${DOMAIN}/api/mailbox?wallet=${RECIPIENT}&role=recipient`);
  const recipientData = await recipientBoxRes.json();
  const foundInRecipient = recipientData.data?.find(item => item.pda === PDA_ID);

  if (foundInRecipient) {
    console.log("   ✅ 收件箱验证成功!");
    console.log("   记录详情:", foundInRecipient);
  } else {
    console.error("   ❌ 收件箱未找到该记录!", recipientData);
  }

  // 4. 签收 (触发状态更新)
  console.log("\n4️⃣ 模拟签收动作 (Sign)...");
  const signRes = await fetch(`${PROTOCOL}://${DOMAIN}/api/sign?pda=${PDA_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature: "mock_signature_bytes" })
  });
  console.log(`   Sign Status: ${signRes.status}`);

  console.log("   ⏳ 等待 3秒 让 D1 更新状态...");
  await new Promise(r => setTimeout(r, 3000));

  // 5. 再次查收件箱确认状态
  console.log("\n5️⃣ 再次检查状态 (Status Check)...");
  const finalCheckRes = await fetch(`${PROTOCOL}://${DOMAIN}/api/mailbox?wallet=${RECIPIENT}&role=recipient`);
  const finalData = await finalCheckRes.json();
  const finalItem = finalData.data?.find(item => item.pda === PDA_ID);

  if (finalItem && finalItem.status === 1) {
    console.log("   ✅ 状态更新验证成功! Status = 1 (Signed)");
  } else {
    console.error(`   ❌ 状态验证失败! 期望 1, 实际 ${finalItem?.status}`);
  }

  console.log("\n🎉 测试流程结束");
}
run();
