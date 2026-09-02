/**
 * PMIS — Công cụ kiểm tra kết nối Live Google Apps Script Web App
 *
 * Cách dùng:
 *   node pmis/tools/test-apps-script-live.js <APPS_SCRIPT_EXEC_URL> [API_TOKEN]
 *
 * Lệnh này sẽ kiểm tra:
 *   1. Action 'ping' — độ phản hồi của Apps Script
 *   2. Action 'rev'  — khả năng bắt dấu hiệu phiên bản
 *   3. Action 'meta' — danh sách các bảng tính tìm thấy trên Google Sheets
 */

const scriptUrl = process.argv[2];
const token = process.argv[3] || '';

if (!scriptUrl || scriptUrl.includes('--help')) {
  console.log(`
PMIS Google Apps Script Verification Tool
==================================================
Cách dùng:
  node pmis/tools/test-apps-script-live.js <URL_EXEC> [TOKEN]

Ví dụ:
  node pmis/tools/test-apps-script-live.js "https://script.google.com/macros/s/.../exec"
  `);
  process.exit(0);
}

async function get(url, params) {
  const u = new URL(url);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  });
  const res = await fetch(u.toString(), { method: 'GET', redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} khi gọi Apps Script`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('Phản hồi không phải JSON hợp lệ. Vui lòng kiểm tra quyền "Bất kỳ ai (Anyone)" khi triển khai Web App.');
  }
}

async function runTest() {
  console.log('⚡ PMIS — Đang kiểm tra kết nối tới Google Apps Script...');
  console.log(`URL: ${scriptUrl}\n`);

  try {
    // Test 1: Ping
    process.stdout.write('1. Thử nghiệm action=ping ... ');
    const pingRes = await get(scriptUrl, { action: 'ping', token });
    if (pingRes.status === 'success') {
      console.log('✅ THÀNH CÔNG (Thời gian server:', pingRes.data.time, ')');
    } else {
      console.log('❌ THẤT BẠI:', pingRes.message);
    }

    // Test 2: Rev
    process.stdout.write('2. Thử nghiệm action=rev ... ');
    const revRes = await get(scriptUrl, { action: 'rev', token });
    if (revRes.status === 'success') {
      console.log('✅ THÀNH CÔNG (Revision stamp:', revRes.data.rev, '| AutoSync trigger:', revRes.data.autoSync ? 'ĐANG BẬT' : 'Đang tắt', ')');
    } else {
      console.log('❌ THẤT BẠI:', revRes.message);
    }

    // Test 3: Meta
    process.stdout.write('3. Thử nghiệm action=meta ... ');
    const metaRes = await get(scriptUrl, { action: 'meta', token });
    if (metaRes.status === 'success') {
      console.log('✅ THÀNH CÔNG');
      console.log(`   Tên bảng tính: "${metaRes.data.name}"`);
      console.log(`   Số lượng bảng (Sheets): ${metaRes.data.tables.length}`);
      metaRes.data.tables.forEach(t => {
        console.log(`   · Sheet: ${t.name.padEnd(18)} | Dòng: ${String(t.rows).padStart(4)} | Khoá chính: ${t.idField}`);
      });
    } else {
      console.log('❌ THẤT BẠI:', metaRes.message);
    }

    console.log('\n🎉 Hoàn thành kiểm tra! URL Apps Script hợp lệ và sẵn sàng đồng bộ 2 chiều.');
  } catch (err) {
    console.error('\n❌ LỖI KẾT NỐI:', err.message);
    process.exit(1);
  }
}

runTest();
