const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const PORT = process.env.PORT || 3000;

// --- 安全性優化 ---
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
if (!ADMIN_TOKEN) {
  console.error("❌ 錯誤： ADMIN_TOKEN 環境變數未設定！");
  console.log("👉 請使用 'ADMIN_TOKEN=your_secret_password node index.js' 啟動");
  process.exit(1);
}
// ---

let currentNumber = 0;
let currentText = "";
let passedNumbers = []; 
const MAX_PASSED_NUMBERS = 5; 

app.use(express.static("public"));
app.use(express.json());

// --- 中介軟體 ---
const authMiddleware = (req, res, next) => {
  const { token } = req.body;
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: "密碼錯誤" });
  }
  next();
};

// --- 輔助函式 ---
function addNumberToPassed(num) {
  if (num <= 0) return; 
  if (passedNumbers.includes(num)) return; 

  passedNumbers.unshift(num);
  if (passedNumbers.length > MAX_PASSED_NUMBERS) {
    passedNumbers.pop();
  }
  io.emit("updatePassed", passedNumbers);
}

// --- API 路由 ---

// 下一號 / 上一號
app.post("/change-number", authMiddleware, (req, res) => {
  const { direction } = req.body;
  if (direction === "next") {
    addNumberToPassed(currentNumber);
    currentNumber++;
  } else if (direction === "prev" && currentNumber > 0) {
    currentNumber--;
  }
  io.emit("update", currentNumber);
  res.json({ success: true, number: currentNumber });
});

// 設定號碼
app.post("/set-number", authMiddleware, (req, res) => {
  const { number } = req.body;
  addNumberToPassed(currentNumber);
  currentNumber = Number(number);
  io.emit("update", currentNumber);
  res.json({ success: true, number: currentNumber });
});

// 設定提示文字
app.post("/set-text", authMiddleware, (req, res) => {
  const { text } = req.body;
  currentText = text;
  io.emit("updateText", currentText);
  res.json({ success: true, text: currentText });
});

// ========================================================
// === 
// ===               👇👇 新增的 API 路由 👇👇
// === 
// ========================================================

// 手動設定「已叫號碼」列表
app.post("/set-passed-numbers", authMiddleware, (req, res) => {
  const { numbers } = req.body;

  // 1. 驗證
  if (!Array.isArray(numbers)) {
    return res.status(400).json({ error: "Input must be an array." });
  }

  // 2. 過濾與轉換：確保陣列內容是乾淨的數字
  const sanitizedNumbers = numbers
    .map(n => Number(n)) // 轉成數字
    .filter(n => !isNaN(n) && n > 0 && Number.isInteger(n)); // 移除無效值 (NaN, 0, 小數)

  // 3. 覆蓋伺服器上的列表
  passedNumbers = sanitizedNumbers;
  
  // (注意：這裡我們移除了 MAX_PASSED_NUMBERS 的限制，允許管理者手動增加)
  // (如果您仍想限制，可以取消下面這行的註解)
  // if (passedNumbers.length > MAX_PASSED_NUMBERS) {
  //   passedNumbers = passedNumbers.slice(0, MAX_PASSED_NUMBERS);
  // }

  // 4. 廣播給所有人 (包括前台和所有後台)
  io.emit("updatePassed", passedNumbers);
  res.json({ success: true, numbers: passedNumbers });
});

// ========================================================

// 重置全部 (這個路由不動，它本來就會清空 passedNumbers)
app.post("/reset", authMiddleware, (req, res) => {
  currentNumber = 0;
  currentText = "";
  passedNumbers = []; // <-- 保持清空
  
  io.emit("update", currentNumber);
  io.emit("updateText", currentText);
  io.emit("updatePassed", passedNumbers); // <-- 保持廣播
  res.json({ success: true, message: "已重置所有內容" });
});

// --- Socket.io 初始化 ---
io.on("connection", (socket) => {
  socket.emit("update", currentNumber);
  socket.emit("updateText", currentText);
  socket.emit("updatePassed", passedNumbers); // <-- 保持發送
});

// --- 啟動伺服器 ---
http.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`🎟 User page: http://localhost:${PORT}/index.html`);
  console.log(`🛠 Admin page: http://localhost:${PORT}/admin.html`);
});
