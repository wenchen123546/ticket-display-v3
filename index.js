/*
 * ==========================================
 * 伺服器 (index.js) - v3.7
 *
 * 【v3.7 修改】
 * - [PWA 移除] 移除 v3.6 針對 /sw.js 的 no-cache 中介軟體
 * ==========================================
 */
 
require('express-async-errors');

// --- 1. 模組載入 ---
const express = require("express");
const http = require("http");
const socketio = require("socket.io");
const helmet = require('helmet'); 
const rateLimit = require('express-rate-limit'); 
const cookieParser = require('cookie-parser');
const { createAdapter } = require("@socket.io/redis-adapter");

const { redis, pubClient, subClient } = require('./config/redis');
const centralErrorHandler = require('./middleware/errorHandler');
const { jwtAuthMiddleware, superAdminCheckMiddleware } = require('./middleware/auth');
const { initializeSocket } = require('./socket/handler');
const { createSuperAdminOnStartup } = require('./utils/startup'); 

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

app.set('socketio', io);
io.adapter(createAdapter(pubClient, subClient));
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(cookieParser()));

// --- 4. Express 中介軟體 (Middleware) ---

// 【v3.7 移除】 /sw.js no-cache 中介軟體已移除

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
app.use(cookieParser()); 

// --- 5. Rate Limiters (不變) ---
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

// --- 6. 路由 (v3.1, 不變) ---
const authRoutes = require('./routes/auth.routes');
const numberRoutes = require('./routes/number.routes');
const listRoutes = require('./routes/list.routes');
const settingsRoutes = require('./routes/settings.routes');
const superadminRoutes = require('./routes/superadmin.routes');

app.use("/api/auth", loginLimiter, authRoutes);

const adminAPIs = [
    numberRoutes,
    listRoutes,
    settingsRoutes
];
app.use("/api", apiLimiter, jwtAuthMiddleware, adminAPIs);
app.use("/api/admin", apiLimiter, jwtAuthMiddleware, superAdminCheckMiddleware, superadminRoutes);

// --- 7. Socket.io 連線處理 (不變) ---
initializeSocket(io);

// --- 8. 中央錯誤處理 (不變) ---
app.use(centralErrorHandler);

// --- 9. 伺服器啟動 (不變) ---
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`✅ Server (v3.7) running on host 0.0.0.0, port ${PORT}`);
    console.log(`🎟 User page (local): http://localhost:${PORT}/index.html`);
    console.log(`🛠 Admin login: http://localhost:${PORT}/login.html`); 
     
    await createSuperAdminOnStartup(); 
});
