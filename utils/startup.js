// /utils/startup.js
// (從 index.js 移出的啟動函式)
const bcrypt = require('bcrypt');
const { redis } = require('../config/redis');
const { KEY_USERS_HASH } = require('../socket/constants');

async function createSuperAdminOnStartup() {
    const SUPER_ADMIN_USERNAME = process.env.SUPER_ADMIN_USERNAME;
    const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

    try {
        const username = SUPER_ADMIN_USERNAME.trim().toLowerCase();
        const userJSON = await redis.hget(KEY_USERS_HASH, username);
 
        if (!userJSON) {
            console.log(`... 找不到超級管理員 "${username}"，正在自動建立...`);
            const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);
            const superAdmin = {
                username,
                passwordHash: passwordHash, 
                role: 'superadmin'
            };
            await redis.hset(KEY_USERS_HASH, username, JSON.stringify(superAdmin));
            console.log(`✅ 超級管理員 "${username}" 已成功建立！`);
        
        } else {
            const user = JSON.parse(userJSON);
            if (!user.passwordHash) {
                console.warn(`... 偵測到舊的 (不安全) 超級管理員帳號，正在強制更新密碼...`);
                const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);
                const fixedUser = {
                    username: user.username,
                    passwordHash: passwordHash,
                    role: 'superadmin' 
                };
                await redis.hset(KEY_USERS_HASH, username, JSON.stringify(fixedUser));
                console.log(`✅ 超級管理員 "${username}" 已成功更新為安全雜湊！`);
            } else {
                console.log(`ℹ️ 超級管理員 "${username}" 已存在且格式正確，跳過建立。`);
            }
        }
    }
    catch (e) {
        console.error("❌ 建立超級管理員時發生嚴重錯誤:", e);
        process.exit(1); 
    }
}

module.exports = { createSuperAdminOnStartup };