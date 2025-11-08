// /routes/settings.routes.js
const router = require('express').Router();
const { redis } = require('../config/redis');
const {
    KEY_SOUND_ENABLED,
    KEY_IS_PUBLIC,
    KEY_ADMIN_LOG,
    KEY_CURRENT_NUMBER,
    KEY_PASSED_NUMBERS,
    KEY_FEATURED_CONTENTS
} = require('../socket/constants');
const { addAdminLog, updateTimestamp } = require('./routeHelpers');

// --- Settings ---
 
router.post("/settings/sound", async (req, res) => {
    const { enabled } = req.body;
    const io = req.app.get('socketio');
    const valueToSet = enabled ? "1" : "0";
    
    await redis.set(KEY_SOUND_ENABLED, valueToSet);
    await addAdminLog(io, `前台音效已設為: ${enabled ? '開啟' : '關閉'}`, req.user.username); 
    io.emit("updateSoundSetting", enabled);
    await updateTimestamp(io);
    res.json({ success: true, isEnabled: enabled });
});
 
router.post("/settings/public", async (req, res) => {
    const { isPublic } = req.body;
    const io = req.app.get('socketio');
    const valueToSet = isPublic ? "1" : "0";
    
    await redis.set(KEY_IS_PUBLIC, valueToSet);
    await addAdminLog(io, `前台已設為: ${isPublic ? '對外開放' : '關閉維護'}`, req.user.username); 
    io.emit("updatePublicStatus", isPublic); 
    await updateTimestamp(io);
    res.json({ success: true, isPublic: isPublic });
});

// --- 【v3.1】 Layout 區塊已移至 superadmin.routes.js ---

// --- Logs ---

router.post("/logs/clear", async (req, res) => {
    const io = req.app.get('socketio');
    await redis.del(KEY_ADMIN_LOG);
    await addAdminLog(io, `🧼 管理員清空了所有日誌`, req.user.username); 
    io.emit("initAdminLogs", []); 
    res.json({ success: true, message: "日誌已清空。" });
});

// --- System ---

router.post("/system/reset", async (req, res) => {
    const io = req.app.get('socketio');
    const multi = redis.multi();
    multi.set(KEY_CURRENT_NUMBER, 0);
    multi.del(KEY_PASSED_NUMBERS);
    multi.del(KEY_FEATURED_CONTENTS);
    multi.set(KEY_SOUND_ENABLED, "1");
    multi.set(KEY_IS_PUBLIC, "1"); 
    // multi.del(KEY_ADMIN_LAYOUT); // 【v3.1】 此 key 已改由 SuperAdmin 管理
    multi.del(KEY_ADMIN_LOG); 
    await multi.exec();

    await addAdminLog(io, `💥 系統已重置所有資料`, req.user.username); 

    io.emit("update", 0);
    io.emit("updatePassed", []);
    io.emit("updateFeaturedContents", []);
    io.emit("updateSoundSetting", true);
    io.emit("updatePublicStatus", true); 
    io.emit("initAdminLogs", []); 

    await updateTimestamp(io);
    res.json({ success: true, message: "已重置所有內容" });
});

module.exports = router;