// /middleware/auth.js
const jwt = require('jsonwebtoken'); 
const JWT_SECRET = process.env.JWT_SECRET;

// 【v3.0】 從 HttpOnly Cookie 讀取 JWT
const jwtAuthMiddleware = (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ error: "缺少驗證 Token" });
    }
    
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload; 
        next();
    }
    catch (e) {
        // 清除無效 cookie
        res.clearCookie('token');
        res.status(401).json({ error: "Token 無效或已過期" });
    }
};
 
const superAdminCheckMiddleware = (req, res, next) => {
    if (req.user && req.user.role === 'superadmin') {
        next();
    }
    else {
        res.status(403).json({ error: "權限不足，此操作僅限超級管理員。" });
    }
};

module.exports = {
    jwtAuthMiddleware,
    superAdminCheckMiddleware
};