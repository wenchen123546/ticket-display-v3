// /socket/handler.js
const jwt = require('jsonwebtoken'); 
const { redis } = require('../config/redis');
const {
    KEY_CURRENT_NUMBER,
    KEY_PASSED_NUMBERS,
    KEY_FEATURED_CONTENTS,
    KEY_LAST_UPDATED,
    KEY_SOUND_ENABLED,
    KEY_IS_PUBLIC,
    KEY_ADMIN_LOG
} = require('./constants'); // 我們將 Keys 移出

const JWT_SECRET = process.env.JWT_SECRET;

// 輔助函式：發送初始狀態 (與 v2.5 相同)
async function sendInitialState(socket) {
    try {
        const pipeline = redis.multi();
        pipeline.get(KEY_CURRENT_NUMBER);
        pipeline.zrange(KEY_PASSED_NUMBERS, -20, -1);
        pipeline.lrange(KEY_FEATURED_CONTENTS, 0, -1);
        pipeline.get(KEY_LAST_UPDATED);
        pipeline.get(KEY_SOUND_ENABLED);
        pipeline.get(KEY_IS_PUBLIC); 
        const results = await pipeline.exec();
        
        if (results.some(r => r[0])) throw new Error("Redis pipeline failed");
        
        const [ [e0,d0],[e1,d1],[e2,d2],[e3,d3],[e4,d4],[e5,d5] ] = results;
        
        socket.emit("update", Number(d0 || 0));
        socket.emit("updatePassed", (d1 || []).map(Number));
        socket.emit("updateFeaturedContents", (d2 || []).map(JSON.parse));
        socket.emit("updateTimestamp", d3 || new Date().toISOString());
        socket.emit("updateSoundSetting", (d4 === null ? "1" : d4) === "1");
        socket.emit("updatePublicStatus", (d5 === null ? "1" : d5) === "1");
    } catch(e_inner) {
        console.error("sendInitialState 失敗:", e_inner);
        socket.emit("initialStateError", "無法載入初始資料。");
    }
}

// Socket.io 連線處理
function initializeSocket(io) {
    io.on("connection", async (socket) => {
        
        // 【v3.0】 從 HttpOnly Cookie 讀取 Token
        const token = socket.request.cookies.token;
         
        let payload;
        try {
            if (!token) throw new Error("No token");
            payload = jwt.verify(token, JWT_SECRET);
        }
        catch (e) {
            // ( Public User 邏輯 )
            // console.log("🔌 一個 Public User 連線", socket.id);
            await sendInitialState(socket);
            return; 
        }
     
        // --- 以下為 JWT 驗證成功的管理員 ---
         
        // console.log(`✅ Admin 連線: ${payload.username}`, socket.id);
        socket.on("disconnect", (reason) => {
            // console.log(`🔌 Admin ${payload.username} 斷線: ${reason}`);
        });
     
        await sendInitialState(socket);
     
        try {
            const logs = await redis.lrange(KEY_ADMIN_LOG, 0, 50);
            socket.emit("initAdminLogs", logs); 
        }
        catch (e) {
            console.error("讀取日誌歷史失敗:", e);
        }
    });
}

module.exports = {
    initializeSocket,
    sendInitialState,
    // (其他輔助函式也可以放在這裡)
};