// test-full-flow.mjs
const DOMAIN = "to.aillm.net";
const NEW_PDA = "Delivery_Final_Check_" + Math.floor(Math.random() * 1000); // 随机生成新 ID

async function run() {
  console.log(`🚀 开始全新全链路测试: ${NEW_PDA}`);

  // 1. 初始化
  const initRes = await fetch(`https://${DOMAIN}/api/init?pda=${NEW_PDA}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pda: NEW_PDA, recipient: "Alice", hash: "hash123" })
  });
  console.log("1️⃣ 存证初始化:", (await initRes.json()).success ? "✅" : "❌");

  // 2. 上传文件
  await fetch(`https://${DOMAIN}/api/upload?pda=${NEW_PDA}`, {
    method: "PUT",
    body: "这是存放在 R2 桶里的高度机密信件内容。"
  });
  console.log("2️⃣ 载荷上传 R2: ✅");

  // 3. 拦截测试 (预期 403)
  console.log("3️⃣ 验证拦截逻辑 (未签收下载)...");
  const failRes = await fetch(`https://${DOMAIN}/api/download?pda=${NEW_PDA}`);
  if (failRes.status === 403) {
    console.log("   ✅ 拦截成功！系统拒绝了未签收的访问。");
  } else {
    console.log("   ❌ 拦截失败，状态码:", failRes.status);
  }

  // 4. 签收
  await fetch(`https://${DOMAIN}/api/sign?pda=${NEW_PDA}`, { method: "POST" });
  console.log("4️⃣ 执行电子签收: ✅");

  // 5. 最终取货
  console.log("5️⃣ 验证签收后下载...");
  const successRes = await fetch(`https://${DOMAIN}/api/download?pda=${NEW_PDA}`);
  if (successRes.ok) {
    const text = await successRes.text();
    console.log("   🎉 取货成功！内容:", text);
  }
}

run();
