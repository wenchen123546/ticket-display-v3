// --- 1. Socket.io 初始化 ---
const socket = io();

// --- 2. 元素節點 (DOM) ---
const numberEl = document.getElementById("number");
const passedListEl = document.getElementById("passedList");
const featuredContainerEl = document.getElementById("featured-container");
const statusBar = document.getElementById("status-bar");
const notifySound = document.getElementById("notify-sound"); 
const lastUpdatedEl = document.getElementById("last-updated"); // 【新增】

// --- 3. Socket.io 連線狀態監聽 ---

socket.on("connect", () => {
    console.log("Socket.io 已連接");
    statusBar.classList.remove("visible"); 
});

socket.on("disconnect", () => {
    console.log("Socket.io 已斷線");
    statusBar.classList.add("visible"); 
    lastUpdatedEl.textContent = "連線中斷..."; // 【新增】 斷線時顯示
});

// --- 4. Socket.io 資料更新監聽 ---

/** 【新增】 監聽 'updateTimestamp' */
socket.on("updateTimestamp", (timestamp) => {
    const date = new Date(timestamp);
    // 格式化為本地時間 (e.g., 下午 3:15:02)
    const timeString = date.toLocaleTimeString('zh-TW');
    lastUpdatedEl.textContent = `最後更新於 ${timeString}`;
});

/** 監聽 'update': 更新目前號碼 */
socket.on("update", (num) => {
    if (numberEl.textContent !== String(num)) {
        numberEl.textContent = num;
        
        if (notifySound) {
            notifySound.play().catch(e => console.warn("音效播放失敗 (需使用者互動):", e));
        }
        document.title = `目前號碼 ${num} - 候位顯示`;

        numberEl.classList.add("updated");
        setTimeout(() => {
            numberEl.classList.remove("updated");
        }, 500);
    }
});

/** 監聽 'updatePassed': 更新已過號列表 */
socket.on("updatePassed", (numbers) => {
    passedListEl.innerHTML = "";
    const h3 = document.querySelector("#passed-container h3");

    if (numbers && numbers.length > 0) {
        h3.style.marginTop = "25px";
        numbers.forEach((num) => {
            const li = document.createElement("li");
            li.textContent = num;
            passedListEl.appendChild(li);
        });
    } else {
        h3.style.marginTop = "0";
    }
});

/** 監聽 'updateFeaturedContents': 更新精選連結列表 */
socket.on("updateFeaturedContents", (contents) => {
    featuredContainerEl.innerHTML = "";
    if (contents && contents.length > 0) {
        let hasVisibleLinks = false; 
        contents.forEach(item => {
            if (item && item.linkText && item.linkUrl) {
                const a = document.createElement("a");
                a.className = "featured-link";
                a.target = "_blank";
                a.href = item.linkUrl;
                a.textContent = item.linkText;
                featuredContainerEl.appendChild(a);
                hasVisibleLinks = true; 
            }
        });
        if (hasVisibleLinks) {
            featuredContainerEl.style.display = "flex";
        } else {
            featuredContainerEl.style.display = "none";
        }
    } else {
        featuredContainerEl.style.display = "none";
    }
});


/*
 * =============================================
 * 5. 動態 QR Code 產生器
 * =============================================
 */
try {
    const qrPlaceholder = document.getElementById("qr-code-placeholder");
    if (qrPlaceholder) {
        new QRCode(qrPlaceholder, {
            text: window.location.href,
            width: 120, 
            height: 120,
            correctLevel: QRCode.CorrectLevel.M 
        });
    }
} catch (e) {
    console.error("QR Code 產生失敗", e);
    const qrPlaceholder = document.getElementById("qr-code-placeholder");
    if (qrPlaceholder) {
        qrPlaceholder.textContent = "QR Code 載入失敗";
    }
}
