// /routes/routeHelpers.js
// 存放路由共用的輔助函式
const { redis } = require('../config/redis');
const { 
    KEY_LAST_UPDATED, 
    KEY_ADMIN_LOG, 
    KEY_PASSED_NUMBERS, 
    KEY_FEATURED_CONTENTS 
} = require('../socket/constants');

async function updateTimestamp(io) {
    const now = new Date().toISOString();
    await redis.set(KEY_LAST_UPDATED, now);
    io.emit("updateTimestamp", now);
}

async function addAdminLog(io, message, actor = "系統") { 
    try {
        const timestamp = new Date().toLocaleTimeString('zh-TW', { hour12: false });
        const logMessage = `[${timestamp}] (${actor}) ${message}`; 
        
        await redis.lpush(KEY_ADMIN_LOG, logMessage);
        await redis.ltrim(KEY_ADMIN_LOG, 0, 50);
        io.emit("newAdminLog", logMessage);
    }
    catch (e) {
        console.error("addAdminLog 失敗:", e);
    }
}

async function broadcastPassedNumbers(io) {
    try {
        const numbersRaw = await redis.zrange(KEY_PASSED_NUMBERS, -20, -1);
        const numbers = numbersRaw.map(Number);
        io.emit("updatePassed", numbers);
        await updateTimestamp(io);
    }
    catch (e) {
        console.error("broadcastPassedNumbers 失敗:", e);
    }
}

async function broadcastFeaturedContents(io) {
    try {
        const contentsJSONs = await redis.lrange(KEY_FEATURED_CONTENTS, 0, -1);
        const contents = contentsJSONs.map(JSON.parse);
        io.emit("updateFeaturedContents", contents);
        await updateTimestamp(io);
    }
    catch (e) {
        console.error("broadcastFeaturedContents 失敗:", e);
    }
}

module.exports = {
    updateTimestamp,
    addAdminLog,
    broadcastPassedNumbers,
    broadcastFeaturedContents
};