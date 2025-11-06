/*
 * ==========================================
 * 伺服器 (index.js)
 * * 終極升級版 (使用 Upstash Redis 雲端資料庫)
 * * 職責：
 * 1. 連線到 Upstash Redis。
 * 2. API 請求會「寫入」到 Redis。
 * 3. Socket 連線會「讀取」自 Redis。
 * ==========================================
 */

// --- 1. 模組載入 ---
const express = require("express");
const http = require("http");
const socketio = require("socket.io");
const Redis = require("ioredis"); // 【新增】 載入 Redis 驅動

// --- 2. 伺服器實體化 ---
const app = express();
const server = http.createServer(app);
const io = socketio(server);

// --- 3. 核心設定 & 安全性 ---
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

// 【新增】 Redis 連線 URL
const REDIS_URL = process.env.UPSTASH_REDIS_URL;

// --- 4. 關鍵檢查 ---
if (!ADMIN_TOKEN) {
    console.error("❌ 錯誤： ADMIN_TOKEN 環境變數未設定！");
    process.exit(1);
}
if (!REDIS_URL) {
    console.error("❌ 錯誤： UPSTASH_REDIS_URL 環境變數未設定！");
    process.exit(1);
}

// --- 5. 連線到 Upstash Redis ---
// 【新增】 建立 Redis 用戶端
const redis = new Redis(REDIS_URL, {
    tls: {
        rejectUnauthorized: false // Upstash 需要這個設定
    }
});

redis.on('connect', () => {
    console.log("✅ 成功連線到 Upstash Redis 資料庫。");
});
redis.on('error', (err) => {
    console.error("❌ Redis 連線錯誤:", err);
    // 雖然 ioredis 會自動重連，但在 Render 上連線失敗通常是致命的
    process.exit(1);
});

// --- 6. 全域狀態 (Global State) ---
// [REMOVED] let currentNumber, passedNumbers, featuredContents
// 所有狀態現在都儲存在 Redis 中。
// Redis Keys:
// 'currentNumber' (String)
// 'passedNumbers' (List)
// 'featuredContents' (Stringified JSON)

const MAX_PASSED_NUMBERS = 5;

// --- 7. Express 中介軟體 (Middleware) ---
app.use(express.static("public"));
app.use(express.json());

const authMiddleware = (req, res, next) => {
    const { token } = req.body;
    if (token !== ADMIN_TOKEN) {
        return res.status(403).json({ error: "密碼錯誤" });
    }
    next();
};

// --- 8. 輔助函式 (已重構為 async) ---
/**
 * [Async] 將一個號碼加入「過號列表」(Redis List)。
 */
async function addNumberToPassed(num) {
    try {
        if (num <= 0) return;
        
        // 檢查是否已存在 (lrem 在這裡是個壞主意，用 lrange 讀取)
        const list = await redis.lrange('passedNumbers', 0, -1);
        if (list.includes(String(num))) return; // Redis 存的是字串

        // lpush: 從左側 (開頭) 推入
        await redis.lpush('passedNumbers', num);
        // ltrim: 修剪列表，只保留 0 到 MAX-1 (共 MAX 個)
        await redis.ltrim('passedNumbers', 0, MAX_PASSED_NUMBERS - 1);
        
        const newList = await redis.lrange('passedNumbers', 0, -1);
        io.emit("updatePassed", newList);
    } catch (e) {
        console.error("addNumberToPassed 失敗:", e);
    }
}

// --- 9. API 路由 (Routes) ---
// (所有 API 都已重構為 async 並使用 Redis)

app.post("/check-token", authMiddleware, (req, res) => {
    res.json({ success: true }); // Token 檢查不需存取資料庫
});

app.post("/change-number", authMiddleware, async (req, res) => {
    try {
        const { direction } = req.body;
        let num = Number(await redis.get('currentNumber') || 0);

        if (direction === "next") { 
            await addNumberToPassed(num); // 等待加入過號
            num++; 
        } 
        else if (direction === "prev" && num > 0) { 
            num--; 
        }
        
        await redis.set('currentNumber', num); // 寫入新號碼
        io.emit("update", num); 
        res.json({ success: true, number: num });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/set-number", authMiddleware, async (req, res) => {
    try {
        const { number } = req.body;
        const num = Number(number);
        
        if (num !== 0) {
            const oldNum = Number(await redis.get('currentNumber') || 0);
            await addNumberToPassed(oldNum);
        }

        await redis.set('currentNumber', num);
        io.emit("update", num); 
        res.json({ success: true, number: num });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/set-passed-numbers", authMiddleware, async (req, res) => {
    try {
        const { numbers } = req.body;
        if (!Array.isArray(numbers)) { return res.status(400).json({ error: "Input must be an array." }); }
        
        const sanitizedNumbers = numbers
            .map(n => Number(n))
            .filter(n => !isNaN(n) && n > 0 && Number.isInteger(n))
            .slice(0, MAX_PASSED_NUMBERS); // 限制數量
        
        // 寫入 Redis List
        await redis.del('passedNumbers'); // 刪除舊列表
        if (sanitizedNumbers.length > 0) {
            // rpush: 從右側 (結尾) 推入，以保持順序
            await redis.rpush('passedNumbers', ...sanitizedNumbers);
        }
        
        io.emit("updatePassed", sanitizedNumbers); 
        res.json({ success: true, numbers: sanitizedNumbers });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/set-featured-contents", authMiddleware, async (req, res) => {
    try {
        const { contents } = req.body; 
        if (!Array.isArray(contents)) {
            return res.status(400).json({ error: "Input must be an array." });
        }
        const sanitizedContents = contents
            .filter(item => item && typeof item === 'object') 
            .map(item => ({ 
                linkText: item.linkText || '', 
                linkUrl: item.linkUrl || ''
            }))
            .filter(item => { // 安全過濾
                if (item.linkUrl === '') return true;
                return item.linkUrl.startsWith('http://') || item.linkUrl.startsWith('https://');
            });

        // 將陣列轉為 JSON 字串存入 Redis
        await redis.set('featuredContents', JSON.stringify(sanitizedContents));
        
        io.emit("updateFeaturedContents", sanitizedContents); 
        res.json({ success: true, contents: sanitizedContents });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


app.post("/reset", authMiddleware, async (req, res) => {
    try {
        // 重置 Redis 中的所有值
        await redis.set('currentNumber', 0);
        await redis.del('passedNumbers');
        await redis.del('featuredContents');
        
        // 廣播預設值
        io.emit("update", 0);
        io.emit("updatePassed", []);
        io.emit("updateFeaturedContents", []);
        
        res.json({ success: true, message: "已重置所有內容" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- 10. Socket.io 連線處理 (已重構為 async) ---
io.on("connection", async (socket) => {
    try {
        // [讀取] 當客戶端連線時，從 Redis 讀取所有目前狀態
        
        // 1. 讀取號碼 (預設為 0)
        const currentNumber = Number(await redis.get('currentNumber') || 0);
        
        // 2. 讀取過號列表 (預設為 [])
        const passedNumbers = await redis.lrange('passedNumbers', 0, -1); // 讀取整個列表
        
        // 3. 讀取精選連結 (預設為 [])
        const featuredContentsJSON = await redis.get('featuredContents');
        const featuredContents = featuredContentsJSON ? JSON.parse(featuredContentsJSON) : [];

        // [發送] 將資料一次性發送給「剛連線的」客戶端
        socket.emit("update", currentNumber);
        socket.emit("updatePassed", passedNumbers);
        socket.emit("updateFeaturedContents", featuredContents);

    } catch (e) {
        console.error("Socket 連線處理失敗:", e);
    }
});

// --- 11. 啟動伺服器 ---
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on host 0.0.0.0, port ${PORT}`);
    console.log(`🎟 User page (local): http://localhost:${PORT}/index.html`);
    console.log(`🛠 Admin page (local): http://localhost:${PORT}/admin.html`);
});
