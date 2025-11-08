// /routes/number.routes.js
const router = require('express').Router();
const { redis } = require('../config/redis');
const { KEY_CURRENT_NUMBER } = require('../socket/constants');
const { addAdminLog, updateTimestamp } = require('./routeHelpers'); // 輔助函式

router.post("/number/change", async (req, res) => {
    const { direction } = req.body;
    const io = req.app.get('socketio'); // 從 app 取得 io 實例
    let num;
    
    if (direction === "next") {
        num = await redis.incr(KEY_CURRENT_NUMBER);
        await addAdminLog(io, `號碼增加為 ${num}`, req.user.username); 
    }
    else if (direction === "prev") {
        const oldNum = await redis.get(KEY_CURRENT_NUMBER) || 0;
        num = await redis.decrIfPositive(KEY_CURRENT_NUMBER);
        if (Number(oldNum) > 0) {
             await addAdminLog(io, `號碼減少為 ${num}`, req.user.username); 
        }
    } 
    else {
        num = await redis.get(KEY_CURRENT_NUMBER) || 0;
    }
    
    io.emit("update", num);
    await updateTimestamp(io);
    res.json({ success: true, number: num });
});
 
router.post("/number/set", async (req, res) => {
    const { number } = req.body;
    const io = req.app.get('socketio');
    const num = Number(number);
    
    if (isNaN(num) || num < 0 || !Number.isInteger(num)) {
        return res.status(400).json({ error: "請提供一個有效的非負整數。" });
    }
    
    await redis.set(KEY_CURRENT_NUMBER, num);
    await addAdminLog(io, `號碼手動設定為 ${num}`, req.user.username); 
    io.emit("update", num);
    await updateTimestamp(io);
    res.json({ success: true, number: num });
});

module.exports = router;