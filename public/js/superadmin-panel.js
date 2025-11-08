// public/js/superadmin-panel.js

document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("jwtToken");
    const welcomeMessage = document.getElementById("welcome-message");
    const userListContainer = document.getElementById("user-list-container");
    const logoutButton = document.getElementById("logout-button");

    const newUsernameInput = document.getElementById("new-username");
    const newPasswordInput = document.getElementById("new-password");
    const newRoleInput = document.getElementById("new-role");
    const createUserButton = document.getElementById("create-user-button");
    const createError = document.getElementById("create-error");

    let currentUser = null;

    // --- 1. 驗證與 API 請求 ---

    // 檢查 Token 是否存在
    if (!token) {
        alert("您尚未登入，將轉跳至登入頁面。");
        window.location.href = "/superadmin.html";
        return;
    }

    // 解碼 JWT (簡易版) 來取得使用者名稱
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        currentUser = payload;
        welcomeMessage.textContent = `歡迎， ${currentUser.username} (${currentUser.role})！`;
    } catch (e) {
        console.error("解碼 Token 失敗:", e);
        localStorage.removeItem("jwtToken");
        window.location.href = "/superadmin.html";
        return;
    }

    // 登出按鈕
    logoutButton.addEventListener("click", () => {
        if (confirm("確定要登出嗎？")) {
            localStorage.removeItem("jwtToken");
            window.location.href = "/superadmin.html";
        }
    });

    // 帶有 JWT 的 API 請求
    const apiRequest = async (endpoint, method = "POST", body = null) => {
        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}` // 關鍵：使用 JWT
        };

        const config = { method, headers };
        if (body) {
            config.body = JSON.stringify(body);
        }

        const res = await fetch(endpoint, config);
        const data = await res.json();

        if (!res.ok) {
            // 如果 Token 過期 (401)，自動登出
            if (res.status === 401) {
                localStorage.removeItem("jwtToken");
                alert("您的登入已過期，請重新登入。");
                window.location.href = "/superadmin.html";
            }
            throw new Error(data.error || "API 請求失敗");
        }
        return data;
    };

    // --- 2. 載入用戶列表 ---

    const renderUserList = (users) => {
        userListContainer.innerHTML = "";
        if (!users || users.length === 0) {
            userListContainer.innerHTML = "<p>目前沒有其他用戶。</p>";
            return;
        }

        users.forEach(user => {
            const item = document.createElement("div");
            item.className = "user-list-item";

            const info = document.createElement("div");
            info.className = "user-info";
            info.textContent = user.username;
            
            const roleSpan = document.createElement("span");
            roleSpan.textContent = user.role;
            roleSpan.className = `role-${user.role}`;
            info.appendChild(roleSpan);

            item.appendChild(info);

            // 超級管理員不能刪除自己
            if (user.username !== currentUser.username) {
                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.className = "btn-danger";
                deleteButton.textContent = "刪除";
                deleteButton.style.width = "auto";
                deleteButton.style.minWidth = "80px";
                deleteButton.style.fontSize = "0.9rem";
                
                deleteButton.onclick = () => deleteUser(user.username);
                
                item.appendChild(deleteButton);
            }

            userListContainer.appendChild(item);
        });
    };

    const loadUsers = async () => {
        try {
            const data = await apiRequest("/api/admin/users/list", "POST");
            renderUserList(data.users);
        } catch (err) {
            userListContainer.innerHTML = `<p style="color: red;">載入用戶列表失敗: ${err.message}</p>`;
        }
    };

    // --- 3. 刪除用戶 ---

    const deleteUser = async (username) => {
        if (!confirm(`確定要永久刪除用戶 "${username}" 嗎？\n此動作無法復原！`)) {
            return;
        }

        try {
            await apiRequest("/api/admin/users/delete", "POST", { username });
            alert(`用戶 ${username} 已成功刪除。`);
            loadUsers(); // 重新載入列表
        } catch (err) {
            alert(`刪除失敗: ${err.message}`);
        }
    };

    // --- 4. 建立用戶 ---

    const createUserInput = () => {
        const username = newUsernameInput.value.trim().toLowerCase();
        const password = newPasswordInput.value.trim();
        const role = newRoleInput.value;

        if (!username || !password || !role) {
            createError.textContent = "所有欄位皆為必填。";
            return;
        }
        
        if (password.length < 8) {
            createError.textContent = "密碼長度至少需 8 個字元。";
            return;
        }
        
        if (!/^[a-z0-9_]+$/.test(username)) {
            createError.textContent = "帳號只能包含小寫英文、數字和底線(_)。";
            return;
        }

        createUserButton.disabled = true;
        createUserButton.textContent = "建立中...";
        createError.textContent = "";

        apiRequest("/api/admin/users/create", "POST", { username, password, role })
            .then(() => {
                alert(`用戶 ${username} (${role}) 已成功建立！`);
                newUsernameInput.value = "";
                newPasswordInput.value = "";
                createUserButton.disabled = false;
                createUserButton.textContent = "建立用戶";
                loadUsers(); // 重新載入列表
            })
            .catch(err => {
                createError.textContent = `建立失敗: ${err.message}`;
                createUserButton.disabled = false;
                createUserButton.textContent = "建立用戶";
            });
    };
    
    createUserButton.addEventListener("click", createUserInput);

    // --- 5. 初始載入 ---
    loadUsers();
});