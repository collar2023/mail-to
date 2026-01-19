// test-status.mjs
const DOMAIN = "to.aillm.net";
const PDA_ADDRESS = "Delivery_Test_001";

async function checkStatus() {
  console.log(`🕵️ 正在从边缘 SQLite 检索 PDA 存证: ${PDA_ADDRESS}...`);
  
  try {
    const url = `https://${DOMAIN}/api/status?pda=${PDA_ADDRESS}`;
    const response = await fetch(url);
    const data = await response.json();

    if (response.ok && !data.error) {
      console.log("📜 存证检索成功！");
      console.table(data); // 以表格形式打印数据库记录
    } else {
      console.error("❌ 检索失败，存证可能不存在:", data);
    }
  } catch (err) {
    console.error("🚨 网络异常:", err.message);
  }
}

checkStatus();
