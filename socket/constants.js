// /socket/constants.js
// (我們將 Keys 移到這裡，以便路由和 Socket 處理器都能共用)

const KEY_CURRENT_NUMBER = 'callsys:number';
const KEY_PASSED_NUMBERS = 'callsys:passed';
const KEY_FEATURED_CONTENTS = 'callsys:featured';
const KEY_LAST_UPDATED = 'callsys:updated';
const KEY_SOUND_ENABLED = 'callsys:soundEnabled';
const KEY_IS_PUBLIC = 'callsys:isPublic'; 
const KEY_ADMIN_LAYOUT = 'callsys:admin-layout'; 
const KEY_ADMIN_LOG = 'callsys:admin-log'; 
const KEY_USERS_HASH = 'callsys:users'; 

module.exports = {
    KEY_CURRENT_NUMBER,
    KEY_PASSED_NUMBERS,
    KEY_FEATURED_CONTENTS,
    KEY_LAST_UPDATED,
    KEY_SOUND_ENABLED,
    KEY_IS_PUBLIC,
    KEY_ADMIN_LAYOUT,
    KEY_ADMIN_LOG,
    KEY_USERS_HASH
};