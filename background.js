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
        // Lấy tab đang active thay vì dùng sender.tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) {
                sendResponse({ error: 'No active tab found' });
                return;
            }

            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: toggleAvatarGuard,
                args: [message.userId, message.fbDtsg, message.toggle]
            }, (results) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ error: chrome.runtime.lastError.message });
                } else {
                    sendResponse(results[0].result);
                }
            });
        });
        return true; // Giữ channel mở cho async response
    }
});

function toggleAvatarGuard(userId, fbDtsg, toggle) {
    function makeid(a) {
        let b = "";
        for (let d = 0; d < a;) b += "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(Math.random() * 62)), d += 1;
        return b;
    }

    const variables = {
        input: {
            is_shielded: toggle,
            session_id: 'Aimen25Cne' + makeid(14),
            actor_id: userId,
            client_mutation_id: 'Aimen25Cne' + (10 + 80 * Math.random())
        },
    };

    const body = new URLSearchParams();
    body.append('av', userId);
    body.append('__user', userId);
    body.append('__a', 1);
    body.append('fb_dtsg', fbDtsg);
    body.append('variables', JSON.stringify(variables));
    body.append('server_timestamps', true);
    body.append('doc_id', '1477043292367183');

    return fetch('https://www.facebook.com/api/graphql/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    })
    .then(response => response.json())
    .then(res => res.errors ? Promise.reject(res) : res);
}