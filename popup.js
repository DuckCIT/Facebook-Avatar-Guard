document.addEventListener('DOMContentLoaded', function() {
    const enableButton = document.getElementById('enableButton');
    const disableButton = document.getElementById('disableButton');
    const statusDiv = document.getElementById('status');
    const spinner = document.getElementById('spinner');

    // Trạng thái nút: chỉ khóa khi đang xử lý
    function setButtonsState(isProcessing = false) {
        enableButton.disabled = isProcessing;
        disableButton.disabled = isProcessing;
        spinner.style.display = isProcessing ? 'block' : 'none';
    }

    // Cập nhật thông báo status
    function updateStatus(message, type = 'normal') {
        statusDiv.textContent = message;
        statusDiv.classList.remove('error', 'success');
        if (type === 'error') statusDiv.classList.add('error');
        else if (type === 'success') statusDiv.classList.add('success');
    }

    // Lấy thông tin từ trang Facebook
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            function: getPageInfo
        }, (results) => {
            if (chrome.runtime.lastError || !results || !results[0]) {
                updateStatus('Please open Facebook', 'error');
                setButtonsState(false);
                return;
            }

            const { cookie, html } = results[0].result;
            const userId = getUserId(cookie);
            const fbDtsg = getFbdtsg({documentElement: {innerHTML: html}});

            if (!userId || !fbDtsg) {
                updateStatus('Please login to Facebook PC', 'error');
                setButtonsState(false);
                return;
            }

            updateStatus('Ready');

            enableButton.addEventListener('click', () => {
                setButtonsState(true);
                updateStatus('Enabling...');
                toggleGuard(userId, fbDtsg, true);
            });

            disableButton.addEventListener('click', () => {
                setButtonsState(true);
                updateStatus('Disabling...');
                toggleGuard(userId, fbDtsg, false);
            });
        });
    });

    // Gửi yêu cầu bật/tắt bảo vệ
    function toggleGuard(userId, fbDtsg, toggle) {
        chrome.runtime.sendMessage({
            type: 'TOGGLE_GUARD',
            userId,
            fbDtsg,
            toggle
        }, (response) => {
            if (chrome.runtime.lastError || response.error) {
                updateStatus('Failed: ' + (chrome.runtime.lastError?.message || response.error), 'error');
                setButtonsState(false);
            } else {
                const successMsg = toggle ? 'Shield enabled' : 'Shield disabled';
                updateStatus(successMsg, 'success');
                setButtonsState(false);
            }
        });
    }
});

// Lấy cookie và HTML từ trang
function getPageInfo() {
    return {
        cookie: document.cookie,
        html: document.documentElement.innerHTML
    };
}

// Trích xuất fb_dtsg
function getFbdtsg(doc) {
    const regex = /"DTSGInitialData",\[],{"token":"(.+?)"/gm;
    const resp = regex.exec(doc.documentElement.innerHTML);
    return resp ? resp[1] : '';
}

// Trích xuất user ID
function getUserId(cookie) {
    const regex = /c_user=(\d+);/gm;
    const resp = regex.exec(cookie);
    return resp ? resp[1] : '';
}