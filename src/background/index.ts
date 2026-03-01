// ── Twigg Background Service Worker ──

// Open the side panel when the extension icon is clicked
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err: Error) => console.error('[Twigg] Failed to set panel behavior:', err));

// Listen for tab changes and notify the sidebar to refresh context
chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.runtime.sendMessage({ type: 'TAB_CHANGED', payload: { tabId: activeInfo.tabId } }).catch(() => { });
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
        chrome.runtime.sendMessage({ type: 'PAGE_LOADED' }).catch(() => { });
    }
});

// Multi-tab context: get summaries of all open tabs
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'GET_ALL_TABS') {
        chrome.tabs.query({ currentWindow: true }).then((tabs) => {
            const tabSummaries = tabs.map((tab) => ({
                id: tab.id,
                title: tab.title || 'Untitled',
                url: tab.url || '',
                active: tab.active,
            }));
            sendResponse({ tabs: tabSummaries });
        });
        return true; // async response
    }
});

console.log('[Twigg] Background service worker initialized (v0.2.0)');
