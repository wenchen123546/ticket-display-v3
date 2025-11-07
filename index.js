/*
 * ==========================================
 * 伺服器 (index.js)
 * * ... (註解不變) ...
 * * (【v3.0】 已修改為支援多人協作的原子 API)
 * ==========================================
 */

// --- 1. 模組載入 (不變) ---
const express = require("express");
const http = require("http");
const socketio = require("socket.io");
const Redis = require("ioredis");

// --- 2. 伺服器實體化 (不變) ---
const app = express();
const server = http.createServer(app);
const io = socketio(server);

// --- 3. 核心設定 & 安全性 (不變) ---
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const REDIS_URL = process.env.UPSTASH_REDIS_URL;

// --- 4. 關鍵檢查 (不變) ---
if (!ADMIN_TOKEN) { /* ... */ }
if (!REDIS_URL) { /* ... */ }

// --- 5. 連線到 Upstash Redis (不變) ---
const redis = new Redis(REDIS_URL, { /* ... */ });
redis.on('connect', () => { console.log("✅ 成功連線到 Upstash Redis 資料庫。"); });
redis.on('error', (err) => { console.error("❌ Redis 連線錯誤:", err); process.exit(1); });

// --- 6. Redis Keys & 全域狀態 (不變) ---
const KEY_CURRENT_NUMBER = 'callsys:number';
const KEY_PASSED_NUMBERS = 'callsys:passed';
const KEY_FEATURED_CONTENTS = 'callsys:featured';
const KEY_LAST_UPDATED = 'callsys:updated';
const KEY_SOUND_ENABLED = 'callsys:soundEnabled'; 

const MAX_PASSED_NUMBERS = 5;

// --- 7. Express 中介軟體 (Middleware) (不變) ---
app.use(express.static("public"));
app.use(express.json());
const authMiddleware = (req, res, next) => { /* ... */ };

// --- 8. 輔助函式 (不變) ---
async function updateTimestamp() { /* ... */ }

// --- 9. API 路由 (Routes) ---

app.post("/check-token", authMiddleware, (req, res) => { res.json({ success: true }); });

// 【重大修改】 使用 INCR/DECR 原子操作
app.post("/change-number", authMiddleware, async (req, res) => {
    try {
        const { direction } = req.body;
        let num;

        if (direction === "next") {
            // INCR 是原子的，直接 +1 並返回新值
            num = await redis.incr(KEY_CURRENT_NUMBER);
        } 
        else if (direction === "prev") {
            // DECR 是原子的，直接 -1 並返回新值
            num = await redis.decr(KEY_CURRENT_NUMBER);
            // 如果減到負數，將其校正回 0
            if (num < 0) {
                num = 0;
                await redis.set(KEY_CURRENT_NUMBER, 0);
            }
        } else {
            return res.status(400).json({ error: "無效的操作" });
        }
        
        io.emit("update", num); 
        await updateTimestamp(); 
        res.json({ success: true, number: num });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// (set-number 保持不變，因為 "設定" 本來就是覆蓋操作)
app.post("/set-number", authMiddleware, async (req, res) => {
    try {
        const { number } = req.body;
        const num = Number(number);
        if (isNaN(num) || num < 0 || !Number.isInteger(num)) {
            return res.status(400).json({ error: "請提供一個有效的非負整數。" });
        }
        await redis.set(KEY_CURRENT_NUMBER, num);
        io.emit("update", num); 
        await updateTimestamp(); 
        res.json({ success: true, number: num });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 【移除】 /set-passed-numbers (舊的 API)
// app.post("/set-passed-numbers", ...);

// 【新增】 API：新增「單一」過號
app.post("/add-passed-number", authMiddleware, async (req, res) => {
    try {
        const { number } = req.body;
        const num = Number(number);
        if (isNaN(num) || num <= 0 || !Number.isInteger(num)) {
            return res.status(400).json({ error: "無效的號碼" });
        }

        // 檢查是否已存在
        const currentList = await redis.lrange(KEY_PASSED_NUMBERS, 0, -1);
        if (currentList.includes(String(num))) {
            return res.status(409).json({ error: "號碼已存在" });
        }
        
        // 檢查是否已達上限
        if (currentList.length >= MAX_PASSED_NUMBERS) {
            return res.status(400).json({ error: `列表已滿 (最多 ${MAX_PASSED_NUMBERS} 筆)` });
        }

        // 原子操作：推入列表
        await redis.rpush(KEY_PASSED_NUMBERS, num);
        
        const newList = await redis.lrange(KEY_PASSED_NUMBERS, 0, -1);
        io.emit("updatePassed", newList); // 廣播新列表
        await updateTimestamp();
        res.json({ success: true, numbers: newList });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 【新增】 API：移除「單一」過號
app.post("/remove-passed-number", authMiddleware, async (req, res) => {
    try {
        const { number } = req.body; // 移除是依據 "值"
        
        // 原子操作：從列表中移除 1 個 "number"
        await redis.lrem(KEY_PASSED_NUMBERS, 1, number); 
        
        const newList = await redis.lrange(KEY_PASSED_NUMBERS, 0, -1);
        io.emit("updatePassed", newList); // 廣播新列表
        await updateTimestamp();
        res.json({ success: true, numbers: newList });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// --- 輔助函式 (精選連結專用) ---
// 【新增】 使用 WATCH 進行樂觀鎖 (Optimistic Locking)
async function modifyFeaturedContents(modificationCallback) {
    let retries = 5; // 重試 5 次
    while (retries > 0) {
        try {
            // 1. 監視這個 Key
            await redis.watch(KEY_FEATURED_CONTENTS);
            
            const jsonString = await redis.get(KEY_FEATURED_CONTENTS);
            const contents = jsonString ? JSON.parse(jsonString) : [];

            // 2. 執行傳入的修改 (例如 add 或 remove)
            const newContents = modificationCallback(contents); 
            if (!newContents) {
                 await redis.unwatch();
                 return { success: false, error: "修改操作失敗" };
            }

            // 3. 啟動事務
            const multi = redis.multi();
            multi.set(KEY_FEATURED_CONTENTS, JSON.stringify(newContents));
            
            // 4. 執行事務
            //    如果 WATCH 發現 Key 在這期間被別人改了，result 會是 null
            const result = await multi.exec(); 

            if (result) { // [ 'OK' ] - 成功！
                io.emit("updateFeaturedContents", newContents);
                await updateTimestamp();
                return { success: true, contents: newContents };
            }
            
            // result 是 null (WATCH 失敗)，迴圈將自動重試
            console.log("WATCH 失敗，正在重試...");

        } catch (err) {
            await redis.unwatch(); // 發生錯誤時解除監視
            throw err; 
        }
        retries--;
    }
    await redis.unwatch();
    throw new Error("更新精選連結失敗：高併發衝突");
}


// 【移除】 /set-featured-contents (舊的 API)
// app.post("/set-featured-contents", ...);

// 【新增】 API：新增「單一」精選連結
app.post("/add-featured-content", authMiddleware, async (req, res) => {
    try {
        const { linkText, linkUrl } = req.body;
        // (您可以在此處加入更嚴格的 linkUrl 驗證)
        if (!linkText || !linkUrl) {
            return res.status(400).json({ error: "文字和網址皆為必填" });
        }

        const result = await modifyFeaturedContents((contents) => {
            contents.push({ linkText, linkUrl });
            return contents;
        });
        res.json(result);

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 【新增】 API：移除「單一」精選連結 (依據索引)
app.post("/remove-featured-content", authMiddleware, async (req, res) => {
    try {
        const { index } = req.body; // 移除是依據 "索引"

        const result = await modifyFeaturedContents((contents) => {
            if (index >= 0 && index < contents.length) {
                contents.splice(index, 1);
                return contents;
            }
            return null; // 回傳 null 表示索引無效
        });
        res.json(result);

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// (set-sound-enabled 保持不變)
app.post("/set-sound-enabled", authMiddleware, async (req, res) => { /* ... */ });

// (reset 保持不變)
app.post("/reset", authMiddleware, async (req, res) => { /* ... */ });

// --- 10. Socket.io 連線處理 (不變) ---
io.on("connection", async (socket) => { /* ... */ });

// --- 11. 啟動伺服器 (不變) ---
server.listen(PORT, '0.0.0.0', () => { /* ... */ });
