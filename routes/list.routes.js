// /routes/list.routes.js
const router = require('express').Router();
const { redis } = require('../config/redis');
const { KEY_PASSED_NUMBERS, KEY_FEATURED_CONTENTS } = require('../socket/constants');
const { addAdminLog, updateTimestamp, broadcastPassedNumbers, broadcastFeaturedContents } = require('./routeHelpers');
 
// --- Passed Numbers ---
 
router.post("/passed/add", async (req, res) => {
    const { number } = req.body;
    const io = req.app.get('socketio');
    const num = Number(number);

    if (isNaN(num) || num <= 0 || !Number.isInteger(num)) {
        return res.status(400).json({ error: "請提供有效的正整數。" });
    }
    await redis.zadd(KEY_PASSED_NUMBERS, num, num);
    await redis.zremrangebyrank(KEY_PASSED_NUMBERS, 0, -21); // 自動修剪
    
    await addAdminLog(io, `過號列表新增 ${num}`, req.user.username); 
    await broadcastPassedNumbers(io);
    res.json({ success: true });
});
 
router.post("/passed/remove", async (req, res) => {
    const { number } = req.body;
    const io = req.app.get('socketio');
    
    await redis.zrem(KEY_PASSED_NUMBERS, number);
    await addAdminLog(io, `過號列表移除 ${number}`, req.user.username); 
    await broadcastPassedNumbers(io);
    res.json({ success: true });
});
 
router.post("/passed/clear", async (req, res) => {
    const io = req.app.get('socketio');
    await redis.del(KEY_PASSED_NUMBERS);
    await addAdminLog(io, `過號列表已清空`, req.user.username); 
    io.emit("updatePassed", []);
    await updateTimestamp(io);
    res.json({ success: true, message: "過號列表已清空" });
});

// --- Featured Contents ---

router.post("/featured/add", async (req, res) => {
    const { linkText, linkUrl } = req.body;
    const io = req.app.get('socketio');

    if (!linkText || !linkUrl) {
        return res.status(400).json({ error: "文字和網址皆必填。" });
    }
    if (!linkUrl.startsWith('http://') && !linkUrl.startsWith('https://')) {
        return res.status(400).json({ error: "網址請務必以 http:// 或 https:// 開頭。" });
    }
    const item = { linkText, linkUrl };
    await redis.rpush(KEY_FEATURED_CONTENTS, JSON.stringify(item));
    await addAdminLog(io, `精選連結新增: ${linkText}`, req.user.username); 
    await broadcastFeaturedContents(io);
    res.json({ success: true });
});
 
router.post("/featured/remove", async (req, res) => {
    const { linkText, linkUrl } = req.body;
    const io = req.app.get('socketio');

    if (!linkText || !linkUrl) {
        return res.status(400).json({ error: "缺少必要參數。" });
    }
    const item = { linkText, linkUrl };
    await redis.lrem(KEY_FEATURED_CONTENTS, 1, JSON.stringify(item));
    await addAdminLog(io, `精選連結移除: ${linkText}`, req.user.username); 
    await broadcastFeaturedContents(io);
    res.json({ success: true });
});
 
router.post("/featured/clear", async (req, res) => {
    const io = req.app.get('socketio');
    await redis.del(KEY_FEATURED_CONTENTS);
    await addAdminLog(io, `精選連結已清空`, req.user.username); 
    io.emit("updateFeaturedContents", []);
    await updateTimestamp(io);
    res.json({ success: true, message: "精選連結已清空" });
});

module.exports = router;