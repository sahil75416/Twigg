// ── Twigg Content Script Entry ──
import { extractPageContext, getSelectedText } from './extractor';
import { executeActionPlan } from './executor';
import type { ExtensionMessage, ActionStep } from '../types';

// Listen for messages from the sidebar / background
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    switch (message.type) {
        case 'EXTRACT_PAGE': {
            try {
                const context = extractPageContext();
                sendResponse({ success: true, context });
            } catch (err) {
                sendResponse({ success: false, error: (err as Error).message });
            }
            break;
        }

        case 'GET_SELECTION': {
            sendResponse({ text: getSelectedText() });
            break;
        }

        case 'EXECUTE_ACTION': {
            try {
                const { steps } = message.payload as { steps: ActionStep[] };
                const results = executeActionPlan(steps);
                const allSuccess = results.every((r) => r.success);
                sendResponse({ success: allSuccess, results });
            } catch (err) {
                sendResponse({ success: false, error: (err as Error).message });
            }
            break;
        }

        default:
            sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
    }

    return true; // Keep channel open for async sendResponse
});

console.log('[Twigg] Content script loaded on', window.location.href);
