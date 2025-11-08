// /middleware/errorHandler.js

// 【v3.0】 中央錯誤處理器
const centralErrorHandler = (err, req, res, next) => {
    // 記錄完整錯誤
    console.error("❌ [中央錯誤處理]:", err.stack || err);
    
    // 檢查是否為已知的 API 錯誤 (例如 rate-limit)
    if (err.status) {
        return res.status(err.status).json({ error: err.message });
    }

    // 回傳通用 500 錯誤，不洩漏細節
    res.status(500).json({
        error: "伺服器內部錯誤，請稍後再試。"
    });
};

module.exports = centralErrorHandler;