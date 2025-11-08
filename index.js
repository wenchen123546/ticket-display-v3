/*
 * ==========================================
 * 伺服器 (index.js)
 * ... (舊註解) ...
 * * 8. 【CSP 修正 v2】 
 * * - 修正 helmet 的 CSP 策略，允許載入 GridStack 和 QR Code 的 CDN
 * * 9. 【安全修復】 
 * * - 實作 express-rate-limit 防止暴力破解
 * * - 實作 helmet 增加 HTTP 安全標頭
 * * - 統一 API 驗證中間件
 * * 10. 【v2 架構升級】
 * * - 引入 bcrypt, jsonwebtoken
 * * - 新增 JWT 登入及超級管理員 API
 * * - 啟動時自動建立超級管理員
 * ==========================================
 */

// --- 1. 模組載入 ---
const express = require("express");
const http = require("http");
const socketio = require("socket.io");
const Redis = require("ioredis");
const helmet = require('helmet'); 
const rateLimit = require('express-rate-limit'); 
const bcrypt = require('bcrypt'); // 【v2 新增】 密碼雜湊
const jwt = require('jsonwebtoken'); // 【v2 新增】 JWT

// --- 2. 伺服器實體化 ---
const app = express();
const server = http.createServer(app);
const io = socketio(server);

// --- 3. 核心設定 & 安全性 ---
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const REDIS_URL = process.env.UPSTASH_REDIS_URL;
// 【v2 新增】 讀取新的環境變數
const JWT_SECRET = process.env.JWT_SECRET;
const SUPER_ADMIN_USERNAME = process.env.SUPER_ADMIN_USERNAME;
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

// --- 4. 關鍵檢查 ---
if (!ADMIN_TOKEN) {
    console.error("❌ 錯誤： ADMIN_TOKEN 環境變數未設定！");
    process.exit(1);
}
if (!REDIS_URL) {
    console.error("❌ 錯誤： UPSTASH_REDIS_URL 環境變數未設定！");
    process.exit(1);
}
// 【v2 新增】 檢查新變數
if (!JWT_SECRET || !SUPER_ADMIN_USERNAME || !SUPER_ADMIN_PASSWORD) {
    console.error("❌ 錯誤： 缺少 JWT_SECRET 或超級管理員帳密 (SUPER_ADMIN_USERNAME / SUPER_ADMIN_PASSWORD) 環境變數！");
    process.exit(1);
}


// --- 5. 連線到 Upstash Redis ---
const redis = new Redis(REDIS_URL, {
    tls: {
        rejectUnauthorized: false
    }
});
redis.on('connect', () => { console.log("✅ 成功連線到 Upstash Redis 資料庫。"); });
redis.on('error', (err) => { console.error("❌ Redis 連線錯誤:", err); process.exit(1); });

redis.defineCommand("decrIfPositive", {
    numberOfKeys: 1,
    lua: `
        local currentValue = tonumber(redis.call("GET", KEYS[1]))
        if currentValue > 0 then
            return redis.call("DECR", KEYS[1])
        else
            return currentValue
        end
    `,
});


// --- 6. Redis Keys & 全域狀態 ---
const KEY_CURRENT_NUMBER = 'callsys:number';
const KEY_PASSED_NUMBERS = 'callsys:passed';
const KEY_FEATURED_CONTENTS = 'callsys:featured';
const KEY_LAST_UPDATED = 'callsys:updated';
const KEY_SOUND_ENABLED = 'callsys:soundEnabled';
const KEY_IS_PUBLIC = 'callsys:isPublic'; 
const KEY_ADMIN_LAYOUT = 'callsys:admin-layout'; 
const KEY_ADMIN_LOG = 'callsys:admin-log'; 
const KEY_USERS_HASH = 'callsys:users'; // 【v2 新增】 用於儲存所有用戶資料

// --- 7. Express 中介軟體 (Middleware) ---

app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
        "style-src": ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
        "connect-src": ["'self'", "https://cdn.jsdelivr.net"]
      },
    },
}));
app.use(express.static("public"));
app.use(express.json());

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 1000, 
    message: { error: "請求過於頻繁，請稍後再試。" },
    standardHeaders: true, 
    legacyHeaders: false, 
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 10, 
    message: { error: "登入嘗試次數過多，請 15 分鐘後再試。" },
    standardHeaders: true,
    legacyHeaders: false,
});

// 【v1 中介軟體】 (保持不變) - 用於檢查靜態 ADMIN_TOKEN
const authMiddleware = (req, res, next) => {
    const { token } = req.body;
    if (token !== ADMIN_TOKEN) {
        return res.status(403).json({ error: "密碼錯誤" });
    }
    next();
};

// --- 【v2 新增】 JWT 驗證中介軟體 ---
const jwtAuthMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "缺少驗證 Token" });
    }
    const token = authHeader.split(' ')[1];
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload; // 將用戶資料 (例如 { username: '...', role: '...' }) 附加到 req
        next();
    } catch (e) {
        res.status(401).json({ error: "Token 無效或已過期" });
    }
};

// --- 【v2 新增】 超級管理員檢查中介軟體 ---
const superAdminCheckMiddleware = (req, res, next) => {
    if (req.user && req.user.role === 'superadmin') {
        next();
    } else {
        res.status(403).json({ error: "權限不足，此操作僅限超級管理員。" });
    }
};


// --- 8. 輔助函式 ---
async function updateTimestamp() {
    const now = new Date().toISOString();
    await redis.set(KEY_LAST_UPDATED, now);
    io.emit("updateTimestamp", now);
}
async function broadcastPassedNumbers() {
    try {
        const numbersRaw = await redis.zrange(KEY_PASSED_NUMBERS, 0, -1);
        const numbers = numbersRaw.map(Number);
        io.emit("updatePassed", numbers);
        await updateTimestamp();
    } catch (e) {
        console.error("broadcastPassedNumbers 失敗:", e);
    }
}
async function broadcastFeaturedContents() {
    try {
        const contentsJSONs = await redis.lrange(KEY_FEATURED_CONTENTS, 0, -1);
        const contents = contentsJSONs.map(JSON.parse);
        io.emit("updateFeaturedContents", contents);
        await updateTimestamp();
    } catch (e) {
        console.error("broadcastFeaturedContents 失敗:", e);
    }
}

async function addAdminLog(message, actor = "系統") { // 【v2 修改】 增加 actor 參數
    try {
        const timestamp = new Date().toLocaleTimeString('zh-TW', { hour12: false });
        const logMessage = `[${timestamp}] (${actor}) ${message}`; // 紀錄操作者
        
        await redis.lpush(KEY_ADMIN_LOG, logMessage);
        await redis.ltrim(KEY_ADMIN_LOG, 0, 50);
        io.emit("newAdminLog", logMessage);
        
    } catch (e) {
        console.error("addAdminLog 失敗:", e);
    }
}


// --- 9. 【v1 API 路由】 (保持不變) ---
// 這些 API 繼續使用舊的 ADMIN_TOKEN 系統，讓 admin.html 保持運作

app.post("/check-token", loginLimiter, authMiddleware, (req, res) => { res.json({ success: true }); });

const protectedAPIs_v1 = [
    "/change-number", "/set-number",
    "/api/passed/add", "/api/passed/remove", "/api/passed/clear",
    "/api/featured/add", "/api/featured/remove", "/api/featured/clear",
    "/set-sound-enabled", "/set-public-status", "/reset",
    "/api/layout/load", "/api/layout/save",
    "/api/logs/clear"
];
app.use(protectedAPIs_v1, apiLimiter, authMiddleware);

// (所有 v1 API ... 保持不變 ... 篇幅關係，此處省略，請保留您原本的程式碼)
app.post("/change-number", async (req, res) => { /* ... */ });
app.post("/set-number", async (req, res) => { /* ... */ });
app.post("/api/passed/add", async (req, res) => { /* ... */ });
// ... (請保留您所有舊的 API 路由) ...
app.post("/api/layout/save", async (req, res) => { /* ... */ });
app.post("/api/logs/clear", async (req, res) => { /* ... */ });


// --- 10. 【v2 API 路由】 (全新) ---

// 【v2】 登入 API (使用嚴格速率限制)
app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: "帳號和密碼為必填。" });
        }

        // 1. 從 Redis Hash 取得用戶資料
        const userJSON = await redis.hget(KEY_USERS_HASH, username.toLowerCase());
        if (!userJSON) {
            return res.status(401).json({ error: "帳號或密碼錯誤。" });
        }
        
        const user = JSON.parse(userJSON);

        // 2. 驗證密碼
        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match) {
            return res.status(401).json({ error: "帳號或密碼錯誤。" });
        }

        // 3. 密碼正確，簽發 JWT
        const payload = {
            username: user.username,
            role: user.role
        };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' }); // 8 小時過期

        res.json({ success: true, token, user: payload });

    } catch (e) {
        console.error("Login API 錯誤:", e);
        res.status(500).json({ error: "伺服器內部錯誤。" });
    }
});


// --- 【v2】 超級管理員 API (使用 JWT 驗證 + 超級管理員權限) ---

// 獲取所有用戶列表
app.post("/api/admin/users/list", jwtAuthMiddleware, superAdminCheckMiddleware, async (req, res) => {
    try {
        const userHash = await redis.hgetall(KEY_USERS_HASH);
        // 移除密碼雜湊，只回傳安全資訊
        const users = Object.values(userHash).map(u => {
            const user = JSON.parse(u);
            return { username: user.username, role: user.role };
        });
        res.json({ success: true, users });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 建立新用戶 (管理員)
app.post("/api/admin/users/create", jwtAuthMiddleware, superAdminCheckMiddleware, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password || !role) {
            return res.status(400).json({ error: "帳號、密碼和角色為必填。" });
        }
        if (role !== 'admin' && role !== 'superadmin') {
            return res.status(400).json({ error: "無效的角色。" });
        }

        const lowerUsername = username.toLowerCase();
        
        // 檢查用戶是否已存在
        if (await redis.hexists(KEY_USERS_HASH, lowerUsername)) {
            return res.status(409).json({ error: "此帳號名稱已存在。" });
        }

        // 建立密碼雜湊
        const passwordHash = await bcrypt.hash(password, 10);
        
        const newUser = {
            username: lowerUsername,
            passwordHash,
            role
        };
        
        await redis.hset(KEY_USERS_HASH, lowerUsername, JSON.stringify(newUser));
        await addAdminLog(`建立了新用戶: ${lowerUsername} (${role})`, req.user.username); // 紀錄操作
        
        res.status(201).json({ success: true, user: { username: lowerUsername, role } });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 刪除用戶
app.post("/api/admin/users/delete", jwtAuthMiddleware, superAdminCheckMiddleware, async (req, res) => {
    try {
        const { username } = req.body;
        const lowerUsername = username.toLowerCase();

        // 不允許刪除自己
        if (lowerUsername === req.user.username) {
            return res.status(400).json({ error: "無法刪除您自己的帳號。" });
        }
        
        const result = await redis.hdel(KEY_USERS_HASH, lowerUsername);
        if (result === 0) {
            return res.status(404).json({ error: "找不到該用戶。" });
        }

        await addAdminLog(`刪除了用戶: ${lowerUsername}`, req.user.username); // 紀錄操作
        res.json({ success: true, message: "用戶已刪除。" });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// --- 11. Socket.io 連線處理 ---
// (v1 的 Socket 邏輯保持不變，v2 的 JWT 驗證可以在之後加入)
io.on("connection", async (socket) => {
    const token = socket.handshake.auth.token;
    const isAdmin = (token === ADMIN_TOKEN && token !== undefined);

    if (isAdmin) {
        console.log("✅ 一個已驗證的 Admin 連線", socket.id);
        socket.on("disconnect", (reason) => {
            console.log(`🔌 Admin ${socket.id} 斷線: ${reason}`);
        });

        // Admin 連線時，傳送日誌歷史
        try {
            const logs = await redis.lrange(KEY_ADMIN_LOG, 0, 50);
            socket.emit("initAdminLogs", logs); 
        } catch (e) {
            console.error("讀取日誌歷史失敗:", e);
        }

    } else {
        // 【v2 檢查】 這裡也可以加入 JWT 驗證邏輯
        try {
            const payload = jwt.verify(token, JWT_SECRET);
            // 如果驗證成功，這也是一個「管理員」
            console.log(`✅ 一個已驗證的 (JWT) Admin 連線: ${payload.username}`, socket.id);
            socket.on("disconnect", (reason) => {
                console.log(`🔌 (JWT) Admin ${payload.username} 斷線: ${reason}`);
            });
            // 也傳送日誌給他
            const logs = await redis.lrange(KEY_ADMIN_LOG, 0, 50);
            socket.emit("initAdminLogs", logs); 

        } catch (e) {
            // JWT 驗證失敗，視為一般 Public User
             console.log("🔌 一個 Public User 連線", socket.id);
        }
    }

    try {
        // (讀取號碼等邏輯保持不變)
        const pipeline = redis.multi();
        pipeline.get(KEY_CURRENT_NUMBER);
        pipeline.zrange(KEY_PASSED_NUMBERS, 0, -1);
        pipeline.lrange(KEY_FEATURED_CONTENTS, 0, -1);
        pipeline.get(KEY_LAST_UPDATED);
        pipeline.get(KEY_SOUND_ENABLED);
        pipeline.get(KEY_IS_PUBLIC); 
        
        const results = await pipeline.exec();
        if (results.some(res => res[0] !== null)) {
            const firstError = results.find(res => res[0] !== null)[0];
            throw new Error(`Redis multi 執行失敗: ${firstError.message}`);
        }
        const [
            [err0, currentNumberRaw],
            [err1, passedNumbersRaw],
            [err2, featuredContentsJSONs],
            [err3, lastUpdatedRaw],
            [err4, soundEnabledRaw],
            [err5, isPublicRaw]
        ] = results;

        const currentNumber = Number(currentNumberRaw || 0);
        const passedNumbers = (passedNumbersRaw || []).map(Number);
        const featuredContents = (featuredContentsJSONs || []).map(JSON.parse);
        const lastUpdated = lastUpdatedRaw || new Date().toISOString();
        const isSoundEnabled = soundEnabledRaw === null ? "1" : soundEnabledRaw;
        const isPublic = isPublicRaw === null ? "1" : isPublicRaw; 

        socket.emit("update", currentNumber);
        socket.emit("updatePassed", passedNumbers);
        socket.emit("updateFeaturedContents", featuredContents);
        socket.emit("updateTimestamp", lastUpdated);
        socket.emit("updateSoundSetting", isSoundEnabled === "1");
        socket.emit("updatePublicStatus", isPublic === "1"); 

    }
    catch (e) {
        console.error("Socket 連線處理失敗:", e);
        socket.emit("initialStateError", "無法載入初始資料，請稍後重新整理。");
    }
});


// --- 12. 伺服器啟動 & 自動建立 Super Admin ---

// 【v2 新增】 伺服器啟動時，檢查並建立超級管理員
async function createSuperAdminOnStartup() {
    try {
        const username = SUPER_ADMIN_USERNAME.toLowerCase();
        const userExists = await redis.hexists(KEY_USERS_HASH, username);

        if (!userExists) {
            console.log(`... 找不到超級管理員 "${username}"，正在自動建立...`);
            const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);
            const superAdmin = {
                username,
                passwordHash,
                role: 'superadmin'
            };
            await redis.hset(KEY_USERS_HASH, username, JSON.stringify(superAdmin));
            console.log(`✅ 超級管理員 "${username}" 已成功建立！`);
        } else {
            console.log(`ℹ️ 超級管理員 "${username}" 已存在，跳過建立。`);
        }
    } catch (e) {
        console.error("❌ 建立超級管理員時發生嚴重錯誤:", e);
        process.exit(1); // 啟動失敗
    }
}

server.listen(PORT, '0.0.0.0', async () => {
    console.log(`✅ Server running on host 0.0.0.0, port ${PORT}`);
    console.log(`🎟 User page (local): http://localhost:${PORT}/index.html`);
    console.log(`🛠 Admin page (local): http://localhost:${PORT}/admin.html`);
    
    // 【v2 新增】 連線到 Redis 之後，再執行 Super Admin 檢查
    await createSuperAdminOnStartup();
});
