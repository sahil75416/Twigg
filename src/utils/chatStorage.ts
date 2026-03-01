// ── Chat History Persistence ──
import type { ChatMessage } from '../types';

const STORAGE_KEY = 'twigg_chat_history';
const MAX_MESSAGES = 100;

/**
 * Save chat messages to chrome.storage.local.
 */
export async function saveChatHistory(messages: ChatMessage[]): Promise<void> {
    // Remove streaming flag and limit stored messages
    const cleaned = messages.slice(-MAX_MESSAGES).map((m) => ({
        ...m,
        isStreaming: false,
    }));
    await chrome.storage.local.set({ [STORAGE_KEY]: cleaned });
}

/**
 * Load chat messages from chrome.storage.local.
 */
export async function loadChatHistory(): Promise<ChatMessage[]> {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return data[STORAGE_KEY] || [];
}

/**
 * Clear saved chat history.
 */
export async function clearChatHistory(): Promise<void> {
    await chrome.storage.local.remove(STORAGE_KEY);
}

/**
 * Export chat as markdown text.
 */
export function exportChatAsMarkdown(messages: ChatMessage[]): string {
    const lines = ['# Twigg Chat Export', `*Exported on ${new Date().toLocaleString()}*`, ''];
    for (const msg of messages) {
        const role = msg.role === 'user' ? '**You**' : '**Twigg**';
        lines.push(`### ${role}`, '', msg.content, '');
    }
    return lines.join('\n');
}

/**
 * Export chat as plain text.
 */
export function exportChatAsText(messages: ChatMessage[]): string {
    return messages.map((m) => `[${m.role === 'user' ? 'You' : 'Twigg'}]: ${m.content}`).join('\n\n');
}
