chrome.webNavigation.onCompleted.addListener((details) => {
    if (details.url.includes('facebook.com')) {
        chrome.scripting.executeScript({
            target: { tabId: details.tabId },
            function: checkInitialState
        });
    }
});

function checkInitialState() {
    chrome.runtime.sendMessage({
        type: 'PAGE_LOADED',
        url: window.location.href
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TOGGLE_GUARD') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) {
                sendResponse({ error: 'No active tab found' });
                return;
            }

            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: toggleAvatarGuard, // Inject hàm này
                args: [message.userId, message.fbDtsg, message.toggle]
            }, (results) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ error: chrome.runtime.lastError.message });
                } else if (results && results[0] && results[0].result) {
                    const result = results[0].result;
                    if (result.error) {
                         sendResponse({ error: result.error });
                    } else {
                         sendResponse(result);
                    }
                } else {
                    sendResponse({ error: "Unknown error occurred" });
                }
            });
        });
        return true; 
    }
});

// === HÀM NÀY SẼ CHẠY TRONG CONSOLE CỦA FACEBOOK ===
function toggleAvatarGuard(userId, fbDtsg, toggle) {
    // 1. Đưa các hàm Helper vào bên trong để tránh lỗi "is not defined"
    const getJazoest = (dtsg) => {
        if (!dtsg) return "";
        let sum = 0;
        for (let i = 0; i < dtsg.length; i++) {
            sum += dtsg.charCodeAt(i);
        }
        return "2" + sum;
    };

    // Lấy LSD giống như cách code All Reacts làm (quét từ DOM)
    const getLsd = () => {
        const html = document.documentElement.innerHTML;
        let match = /name=\"lsd\" value=\"([^\"]+)\"/m.exec(html);
        if (match) return match[1];
        match = /\["LSD",\[],\{"token":"(.+?)"\}\]/m.exec(html);
        return match ? match[1] : '';
    };

    const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };

    // 2. Chuẩn bị dữ liệu (Payload) giống All Reacts
    const variables = {
        input: {
            is_shielded: toggle,
            session_id: generateUUID(),
            actor_id: userId,
            client_mutation_id: generateUUID()
        },
    };

    const lsd = getLsd();
    const jazoest = getJazoest(fbDtsg);

    const body = new URLSearchParams();
    body.append('av', userId);
    body.append('__user', userId);
    body.append('__a', 1);
    body.append('fb_dtsg', fbDtsg);
    body.append('fb_api_caller_class', 'RelayModern'); // Giống All Reacts
    body.append('fb_api_req_friendly_name', 'IsShieldedSetMutation'); // Tên chuẩn của Query này
    body.append('variables', JSON.stringify(variables));
    body.append('server_timestamps', true);
    body.append('doc_id', '1477043292367183');

    // Thêm các tham số bảo mật nếu có
    if (jazoest) body.append('jazoest', jazoest);
    if (lsd) body.append('lsd', lsd);

    // 3. Gọi Fetch với Header chuẩn
    return fetch('https://www.facebook.com/api/graphql/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-FB-Friendly-Name': 'IsShieldedSetMutation',
        },
        body: body,
    })
    .then(async response => {
        // [FIX 429]: Kiểm tra status code
        if (response.status === 429) {
            return { error: 'RATE_LIMIT_429' };
        }
        if (!response.ok) {
            return { error: `HTTP_ERROR_${response.status}` };
        }
        // Cố gắng parse JSON
        try {
            const text = await response.text();
            // Đôi khi FB trả về "for (;;);JSON" để chống hijack, cần xóa nó đi
            const jsonText = text.replace("for (;;);", ""); 
            return JSON.parse(jsonText);
        } catch (e) {
            return { error: 'INVALID_JSON_RESPONSE' };
        }
    })
    .then(res => {
        if (res.error) return Promise.reject(res.error);
        if (res.errors) return Promise.reject(res.errors[0].message);
        return res;
    })
    .catch(err => {
        return { error: typeof err === 'string' ? err : JSON.stringify(err) };
    });
}

function checkUpdate() {
    fetch("https://raw.githubusercontent.com/DuckCIT/Facebook-Avatar-Guard/main/data/version.json")
        .then(response => response.json())
        .then(data => {
            const currentVersion = chrome.runtime.getManifest().version;

            if (data.version > currentVersion) {
                chrome.storage.local.get(["update_notified"], (result) => {
                    if (!result.update_notified) {
                        chrome.storage.local.set({ update_notified: true });
                        chrome.notifications.create("update_notification", {
                            type: "basic",
                            iconUrl: "img/icon.png",
                            title: "New Update Available!",
                            message: `A new version (${data.version}) is available. Click here to update.`,
                            priority: 2
                        });
                        chrome.notifications.onClicked.addListener((notificationId) => {
                            if (notificationId === "update_notification") {
                                chrome.tabs.create({ url: "https://github.com/DuckCIT/Facebook-Avatar-Guard" });
                            }
                        });
                    }
                });
            }
        })
        .catch(() => {});
}

chrome.runtime.onStartup.addListener(checkUpdate);
chrome.runtime.onInstalled.addListener(checkUpdate);