// /routes/auth.routes.js
const router = require('express').Router();
const bcrypt = require('bcrypt'); 
const jwt = require('jsonwebtoken'); 
const { redis } = require('../config/redis');
const { KEY_USERS_HASH } = require('../socket/constants');

const JWT_SECRET = process.env.JWT_SECRET;

router.post("/login", async (req, res) => {
    // 【v3.0】 已移除 try...catch，由 express-async-errors 處理
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "帳號和密碼為必填。" });
    }
    
    const userKey = username.trim().toLowerCase();
    const userJSON = await redis.hget(KEY_USERS_HASH, userKey);
    
    if (!userJSON) {
        return res.status(401).json({ error: "帳號或密碼錯誤。" });
    }
    const user = JSON.parse(userJSON);

    if (!user.passwordHash) {
        return res.status(401).json({ error: "帳號或密碼錯誤。" });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
        return res.status(401).json({ error: "帳號或密碼錯誤。" });
    }

    const payload = {
        username: userKey,
        role: user.role
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' }); 
    
    // 【v3.0】 設定 HttpOnly Cookie
    res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // 僅在 HTTPS 下發送
        sameSite: 'Strict', // 防範 CSRF
        maxAge: 8 * 60 * 60 * 1000 // 8 小時
    });
    
    // 仍然回傳 user 物件，供前端 sessionStorage 儲存
    res.json({ success: true, user: payload });
});

module.exports = router;