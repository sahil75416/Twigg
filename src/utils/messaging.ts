import type { ActionResultResponse, ActionStep, ExtensionMessage, ExtractPageResponse } from '../types';

const MESSAGE_RETRY_COUNT = 1;
const MESSAGE_RETRY_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRestrictedUrl(url?: string): boolean {
    if (!url) return false;
    const normalized = url.toLowerCase();
    return (
        normalized.startsWith('chrome://') ||
        normalized.startsWith('edge://') ||
        normalized.startsWith('about:') ||
        normalized.startsWith('chrome-extension://')
    );
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found.');
    return tab;
}

async function sendOnce<T>(tabId: number, message: ExtensionMessage): Promise<T> {
    try {
        const response = await chrome.tabs.sendMessage(tabId, message);
        if (response === undefined || response === null) {
            throw new Error('Empty response from content script.');
        }
        return response as T;
    } catch (error) {
        const messageText = (error as Error).message || '';
        if (messageText.includes('Could not establish connection')) {
            throw new Error('Content script is unavailable on this page.');
        }
        throw error;
    }
}

export async function sendToContentScript<T = unknown>(message: ExtensionMessage): Promise<T> {
    const tab = await getActiveTab();

    if (isRestrictedUrl(tab.url)) {
        throw new Error('Twigg cannot run on this browser-internal page.');
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= MESSAGE_RETRY_COUNT; attempt++) {
        try {
            return await sendOnce<T>(tab.id as number, message);
        } catch (error) {
            lastError = error;
            if (attempt < MESSAGE_RETRY_COUNT) {
                await sleep(MESSAGE_RETRY_DELAY_MS);
            }
        }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to communicate with page context.');
}

export async function requestPageContext(): Promise<ExtractPageResponse> {
    return sendToContentScript<ExtractPageResponse>({ type: 'EXTRACT_PAGE' });
}

export async function requestSelection(): Promise<string> {
    const result = await sendToContentScript<{ text: string }>({ type: 'GET_SELECTION' });
    return result.text || '';
}

export async function executeActions(steps: ActionStep[]): Promise<ActionResultResponse> {
    return sendToContentScript<ActionResultResponse>({
        type: 'EXECUTE_ACTION',
        payload: { steps },
    });
}

export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
