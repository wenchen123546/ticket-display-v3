// --- 1. 元素節點 (DOM) ---
const loginContainer = document.getElementById("login-container");
const adminPanel = document.getElementById("admin-panel");
const passwordInput = document.getElementById("password-input");
const loginButton = document.getElementById("login-button");
const loginError = document.getElementById("login-error");
const numberEl = document.getElementById("number");

// 【修改】 抓取新的 GUI 元素
const passedListUI = document.getElementById("passed-list-ui");
const newPassedNumberInput = document.getElementById("new-passed-number");
const addPassedBtn = document.getElementById("add-passed-btn");
const savePassedButton = document.getElementById("savePassedNumbers");

const featuredListUI = document.getElementById("featured-list-ui");
const newLinkTextInput = document.getElementById("new-link-text");
const newLinkUrlInput = document.getElementById("new-link-url");
const addFeaturedBtn = document.getElementById("add-featured-btn");
const saveFeaturedButton = document.getElementById("saveFeaturedContents");

// --- 2. 全域變數 ---
let token = "";
const TOKEN_KEY = "adminToken"; 
// 【新增】 用於 UI 編輯的本地暫存陣列
let localPassedNumbers = [];
let localFeaturedContents = [];

// --- 3. Socket.io ---
const socket = io({ autoConnect: false });

// --- 4. 登入/顯示邏輯 (保持不變) ---
function showLogin() { loginContainer.style.display = "block"; adminPanel.style.display = "none"; localStorage.removeItem(TOKEN_KEY); document.title = "後台管理 - 登入"; socket.disconnect(); }
function showPanel() { loginContainer.style.display = "none"; adminPanel.style.display = "block"; document.title = "後台管理 - 控制台"; socket.connect(); }
async function checkToken(tokenToCheck) { if (!tokenToCheck) return false; try { const res = await fetch("/check-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: tokenToCheck }), }); return res.ok; } catch (err) { console.error("checkToken 失敗:", err); return false; } }
async function attemptLogin(tokenToCheck) { loginError.textContent = "驗證中..."; const isValid = await checkToken(tokenToCheck); if (isValid) { token = tokenToCheck; localStorage.setItem(TOKEN_KEY, tokenToCheck); showPanel(); } else { loginError.textContent = "密碼錯誤"; showLogin(); } }
document.addEventListener("DOMContentLoaded", async () => { const storedToken = localStorage.getItem(TOKEN_KEY); if (storedToken) { await attemptLogin(storedToken); } else { showLogin(); } });
loginButton.addEventListener("click", () => { attemptLogin(passwordInput.value); });
passwordInput.addEventListener("keyup", (event) => { if (event.key === "Enter") { attemptLogin(passwordInput.value); } });

// --- 5. 控制台 Socket 監聽器 ---
socket.on("connect", () => { console.log("Socket.io 已連接"); });
socket.on("update", (num) => (numberEl.textContent = num));

// 【修改】 更新過號列表 (從 Socket)
socket.on("updatePassed", (numbers) => {
    // 伺服器傳來的是字串陣列，轉為數字
    localPassedNumbers = numbers.map(Number);
    renderPassedListUI(); // 渲染 UI
});

// 【修改】 更新精選連結 (從 Socket)
socket.on("updateFeaturedContents", (contents) => {
    localFeaturedContents = contents;
    renderFeaturedListUI(); // 渲染 UI
});

// --- 6. API 請求函式 (保持不變) ---
async function apiRequest(endpoint, body) {
    try {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, token }),
        });
        if (!res.ok) {
            const errorData = await res.json();
            if (res.status === 403) { alert("密碼驗證失敗或 Token 已過期，請重新登入。"); showLogin(); } else { alert("發生錯誤：" + (errorData.error || "未知錯誤")); }
            return false;
        }
        return true;
    } catch (err) {
        alert("網路連線失敗或伺服器無回應：" + err.message);
        return false;
    }
}

// --- 7. GUI 渲染函式 ---

/** 【新增】 渲染「過號列表」的 UI */
function renderPassedListUI() {
    passedListUI.innerHTML = ""; // 清空
    if (localPassedNumbers.length > 5) {
        // 確保本地陣列也遵守伺服器限制
        localPassedNumbers = localPassedNumbers.slice(0, 5);
    }
    localPassedNumbers.forEach((number, index) => {
        const li = document.createElement("li");
        li.innerHTML = `<span>${number}</span>`;
        
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "delete-item-btn";
        deleteBtn.textContent = "×";
        deleteBtn.onclick = () => {
            localPassedNumbers.splice(index, 1); // 從本地陣列移除
            renderPassedListUI(); // 重新渲染
        };
        
        li.appendChild(deleteBtn);
        passedListUI.appendChild(li);
    });
}

/** 【新增】 渲染「精選連結」的 UI */
function renderFeaturedListUI() {
    featuredListUI.innerHTML = ""; // 清空
    localFeaturedContents.forEach((item, index) => {
        const li = document.createElement("li");
        // 顯示文字，並用一個小 span 顯示網址
        li.innerHTML = `<span>${item.linkText}<br><small style="color: #666;">${item.linkUrl}</small></span>`;
        
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "delete-item-btn";
        deleteBtn.textContent = "×";
        deleteBtn.onclick = () => {
            localFeaturedContents.splice(index, 1); // 從本地陣列移除
            renderFeaturedListUI(); // 重新渲染
        };
        
        li.appendChild(deleteBtn);
        featuredListUI.appendChild(li);
    });
}

// --- 8. 控制台按鈕功能 ---

async function changeNumber(direction) {
    await apiRequest("/change-number", { direction });
}

async function setNumber() {
    const num = document.getElementById("manualNumber").value;
    if (num === "") return;
    const success = await apiRequest("/set-number", { number: num });
    if (success) {
        document.getElementById("manualNumber").value = "";
    }
}

/** 【修改】 儲存過號列表 */
async function savePassedNumbers() {
    savePassedButton.disabled = true;
    savePassedButton.textContent = "儲存中...";

    // 直接使用本地暫存的陣列
    const success = await apiRequest("/set-passed-numbers", { numbers: localPassedNumbers });
    if (success) {
        alert("過號列表已儲存。");
    }
    
    savePassedButton.disabled = false;
    savePassedButton.textContent = "儲存過號列表";
}

/** 【修改】 儲存精選連結 */
async function saveFeaturedContents() {
    saveFeaturedButton.disabled = true;
    saveFeaturedButton.textContent = "儲存中...";

    // 直接使用本地暫存的陣列
    const success = await apiRequest("/set-featured-contents", { contents: localFeaturedContents });
    if (success) {
        alert("精選連結已儲存。");
    }

    saveFeaturedButton.disabled = false;
    saveFeaturedButton.textContent = "儲存精選連結";
}

// --- 重置功能 (保持不變) ---
async function resetNumber() {
    if (!confirm("確定要將「目前號碼」重置為 0 嗎？")) return;
    const success = await apiRequest("/set-number", { number: 0 });
    if (success) { document.getElementById("manualNumber").value = ""; alert("號碼已重置為 0。"); }
}
async function resetPassed() {
    if (!confirm("確定要清空「已叫號碼(過號)」列表嗎？")) return;
    await apiRequest("/set-passed-numbers", { numbers: [] });
}
async function resetFeaturedContents() {
    if (!confirm("確定要清空「精選連結」嗎？")) return;
    const success = await apiRequest("/set-featured-contents", { contents: [] });
    if (success) { alert("精選連結已清空。"); }
}
async function resetAll() {
    if (!confirm("確定要將所有內容全部重置嗎？")) { return; }
    const success = await apiRequest("/reset", {});
    if (success) { document.getElementById("manualNumber").value = ""; alert("已全部重置。"); }
}

// --- 9. 綁定按鈕事件 ---
document.getElementById("next").onclick = () => changeNumber("next");
document.getElementById("prev").onclick = () => changeNumber("prev");
document.getElementById("setNumber").onclick = setNumber;
document.getElementById("savePassedNumbers").onclick = savePassedNumbers;
document.getElementById("saveFeaturedContents").onclick = saveFeaturedContents;
document.getElementById("resetNumber").onclick = resetNumber;
document.getElementById("resetFeaturedContents").onclick = resetFeaturedContents;
document.getElementById("resetPassed").onclick = resetPassed;
document.getElementById("resetAll").onclick = resetAll;

// 【新增】 綁定新的 "Add" 按鈕
addPassedBtn.onclick = () => {
    const num = Number(newPassedNumberInput.value);
    if (num > 0 && !localPassedNumbers.includes(num)) {
        if (localPassedNumbers.length >= 5) {
            alert("過號列表最多只能 5 筆。");
            return;
        }
        localPassedNumbers.push(num);
        renderPassedListUI();
        newPassedNumberInput.value = "";
    } else {
        alert("請輸入有效的、且尚未在列表中的號碼。");
    }
};

addFeaturedBtn.onclick = () => {
    const text = newLinkTextInput.value.trim();
    const url = newLinkUrlInput.value.trim();
    
    if (text && url) {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            alert("網址請務必以 http:// 或 https:// 開頭。");
            return;
        }
        localFeaturedContents.push({ linkText: text, linkUrl: url });
        renderFeaturedListUI();
        newLinkTextInput.value = "";
        newLinkUrlInput.value = "";
    } else {
        alert("「連結文字」和「網址」都必須填寫。");
    }
};

// 綁定登出按鈕
const logoutButton = document.getElementById("logoutButton");
if (logoutButton) {
    logoutButton.onclick = showLogin;
}
