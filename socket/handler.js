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
    KEY_ADMIN_LOG,
    KEY_USERS_HASH, // 【v3.8】 引入
    KEY_ONLINE_ADMINS // 【v3.8】 引入
} = require('./constants'); 

const JWT_SECRET = process.env.JWT_SECRET;

// 【v3.8】 管理員專用的廣播頻道
const ADMIN_BROADCAST_ROOM = 'admin_room';

// 輔助函式：發送初始狀態 (不變)
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

// 【v3.8】 新增：廣播在線管理員列表
async function broadcastOnlineAdmins(io) {
    try {
        const onlineUsernames = await redis.hkeys(KEY_ONLINE_ADMINS);
        
        if (onlineUsernames.length === 0) {
            io.to(ADMIN_BROADCAST_ROOM).emit("updateOnlineList", []);
            return;
        }

        // 從 Users HASH 中撈取這些在線用戶的詳細資料
        const userJSONs = await redis.hmget(KEY_USERS_HASH, ...onlineUsernames);
        
        const userPayloads = userJSONs
            .filter(json => json) // 過濾掉 null (以防萬一)
            .map(json => {
                const user = JSON.parse(json);
                return { username: user.username, role: user.role }; // 只發送必要的資訊
            });
            
        io.to(ADMIN_BROADCAST_ROOM).emit("updateOnlineList", userPayloads);
    } catch (e) {
        console.error("❌ 廣播在線管理員列表失敗:", e);
    }
}


// Socket.io 連線處理
function initializeSocket(io) {
    io.on("connection", async (socket) => {
        
        const token = socket.request.cookies.token;
         
        let payload;
        try {
            if (!token) throw new Error("No token");
            payload = jwt.verify(token, JWT_SECRET);
        }
        catch (e) {
            // ( Public User 邏輯 )
            await sendInitialState(socket);
            return; 
        }
     
        // --- 【v3.8】 以下為 JWT 驗證成功的管理員 ---
         
        // console.log(`✅ Admin 連線: ${payload.username}`);
        
        // 【v3.8】 將用戶資料附加到 socket 上，以便 'disconnect' 事件使用
        socket.user = payload; 
        
        // 【v3.8】 加入管理員廣播頻道
        socket.join(ADMIN_BROADCAST_ROOM);
     
        await sendInitialState(socket);
     
        try {
            const logs = await redis.lrange(KEY_ADMIN_LOG, 0, 50);
            socket.emit("initAdminLogs", logs); 
        }
        catch (e) {
            console.error("讀取日誌歷史失敗:", e);
        }

        // --- 【v3.8】 處理在線列表 (連線時) ---
        try {
            // HASH 欄位: username, 值: socket 數量 (計數+1)
            await redis.hincrby(KEY_ONLINE_ADMINS, payload.username, 1);
            await broadcastOnlineAdmins(io); // 廣播最新列表
        } catch (e) {
            console.error("❌ 更新在線列表 (連線) 失敗:", e);
        }

        // --- 【v3.8】 處理在線列表 (斷線時) ---
        socket.on("disconnect", async (reason) => {
            // console.log(`🔌 Admin ${socket.user?.username} 斷線: ${reason}`);
            
            if (!socket.user?.username) {
                return; // 理論上不會發生
            }

            try {
                const username = socket.user.username;
                // 計數-1
                const newCount = await redis.hincrby(KEY_ONLINE_ADMINS, username, -1);
                
                // 如果此用戶的 socket 數量歸零，才從 HASH 移除
                if (newCount <= 0) {
                    await redis.hdel(KEY_ONLINE_ADMINS, username);
                }
                
                await broadcastOnlineAdmins(io); // 廣播最新列表
            } catch (e) {
                console.error("❌ 更新在線列表 (斷線) 失敗:", e);
            }
        });
    });
}

module.exports = {
    initializeSocket
};
