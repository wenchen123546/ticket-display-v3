/*
 * ==========================================
 * 伺服器 (index.js) - v3.0 (重構版)
 *
 * 【v3.0 架構】
 * - [安全] 使用 HttpOnly Cookie 儲存 JWT
 * - [擴展] 啟用 Socket.io Redis Adapter
 * - [結構] 專案結構模組化 (routes, middleware, config, socket)
 * - [錯誤] 實作中央錯誤處理
 * ==========================================
 */
 
// 【v3.0】 自動錯誤捕捉
require('express-async-errors');

// --- 1. 模組載入 ---
const express = require("express");
const http = require("http");
const socketio = require("socket.io");
const helmet = require('helmet'); 
const rateLimit = require('express-rate-limit'); 
const cookieParser = require('cookie-parser');
const { createAdapter } = require("@socket.io/redis-adapter");

// 【v3.0】 載入模組
const { redis, pubClient, subClient } = require('./config/redis');
const centralErrorHandler = require('./middleware/errorHandler');
const { jwtAuthMiddleware, superAdminCheckMiddleware } = require('./middleware/auth');
const { initializeSocket } = require('./socket/handler');
const { createSuperAdminOnStartup } = require('./utils/startup'); // 輔助函式

// --- 2. 伺服器實體化 ---
const app = express();
const server = http.createServer(app);
const io = socketio(server);

// --- 3. 核心設定 ---
const PORT = process.env.PORT || 3000;
if (!process.env.JWT_SECRET || !process.env.SUPER_ADMIN_USERNAME || !process.env.SUPER_ADMIN_PASSWORD) {
    console.error("❌ 錯誤： 缺少 JWT_SECRET 或超級管理員帳密環境變數！");
    process.exit(1);
}

// 【v3.0】 將 io 實例存儲在 app 中，以便路由存取
app.set('socketio', io);

// 【v3.0】 Socket.io Redis Adapter
io.adapter(createAdapter(pubClient, subClient));

// 【v3.0】 Socket.io Middleware (用於讀取 Cookie)
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(cookieParser()));

// --- 4. Express 中介軟體 (Middleware) ---
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
app.use(cookieParser()); // 【v3.0】 啟用 Cookie Parser

// --- 5. Rate Limiters ---
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

// --- 6. 路由 (Routes) ---
const authRoutes = require('./routes/auth.routes');
const numberRoutes = require('./routes/number.routes');
const listRoutes = require('./routes/list.routes');
const settingsRoutes = require('./routes/settings.routes');
const superadminRoutes = require('./routes/superadmin.routes');

// 公開路由
app.use("/api/auth", loginLimiter, authRoutes);

// 管理員路由 (Admin)
const adminAPIs = [
    numberRoutes,
    listRoutes,
    settingsRoutes
];
app.use("/api", apiLimiter, jwtAuthMiddleware, adminAPIs);

// 超級管理員路由 (SuperAdmin)
app.use("/api/admin", apiLimiter, jwtAuthMiddleware, superAdminCheckMiddleware, superadminRoutes);

// --- 7. Socket.io 連線處理 ---
initializeSocket(io);

// --- 8. 中央錯誤處理 ---
app.use(centralErrorHandler);

// --- 9. 伺服器啟動 ---
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`✅ Server (v3.0) running on host 0.0.0.0, port ${PORT}`);
    console.log(`🎟 User page (local): http://localhost:${PORT}/index.html`);
    console.log(`🛠 Admin login: http://localhost:${PORT}/login.html`); 
     
    await createSuperAdminOnStartup(); // 檢查並建立 Super Admin
});