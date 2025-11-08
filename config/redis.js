// /config/redis.js
const Redis = require("ioredis");

const REDIS_URL = process.env.UPSTASH_REDIS_URL;
if (!REDIS_URL) {
    console.error("❌ 錯誤： UPSTASH_REDIS_URL 環境變數未設定！");
    process.exit(1);
}

const redisOptions = {
    tls: { rejectUnauthorized: false }
};

// 主要的 Redis 客戶端 (用於 GET/SET/HSET 等)
const redis = new Redis(REDIS_URL, redisOptions);

// 專門用於 Socket.io Adapter (Pub/Sub) 的客戶端
const pubClient = new Redis(REDIS_URL, redisOptions);
const subClient = pubClient.duplicate();

redis.on('connect', () => { console.log("✅ [Redis] 成功連線到 Upstash (主要)。"); });
redis.on('error', (err) => { console.error("❌ [Redis] 連線錯誤:", err); process.exit(1); });

redis.defineCommand("decrIfPositive", {
    numberOfKeys: 1,
    lua: `
        local currentValue = tonumber(redis.call("GET", KEYS[1]))
        if currentValue > 0 then
            return redis.call("DECR", KEYS[1])
        else
            return currentValue
        end
    `,
});

module.exports = {
    redis,
    pubClient,
    subClient,
};