const DEFAULT_MODEL = 'gemini-2.0-flash';
const CHAT_RETRY_COUNT = 1;
const RETRY_DELAY_MS = 500;

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeChatResponse(response: unknown): string {
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object') {
        const maybeMessage = response as { message?: { content?: string }; text?: string; content?: string };
        if (typeof maybeMessage.message?.content === 'string') return maybeMessage.message.content;
        if (typeof maybeMessage.text === 'string') return maybeMessage.text;
        if (typeof maybeMessage.content === 'string') return maybeMessage.content;
    }
    return JSON.stringify(response);
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= CHAT_RETRY_COUNT; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < CHAT_RETRY_COUNT) {
                await sleep(RETRY_DELAY_MS);
            }
        }
    }
    throw lastError instanceof Error ? lastError : new Error('LLM request failed');
}

export async function getModel(): Promise<string> {
    const { model } = await chrome.storage.local.get('model');
    return model || DEFAULT_MODEL;
}

export async function setModel(model: string): Promise<void> {
    await chrome.storage.local.set({ model });
}

// Backward compatibility with older settings UI.
export async function getApiKey(): Promise<string> {
    return 'puter';
}

export async function setApiKey(_key: string): Promise<void> {
    return;
}

export function isPuterAvailable(): boolean {
    return typeof puter !== 'undefined';
}

export function isPuterReady(): boolean {
    if (!isPuterAvailable()) return false;
    try {
        return Boolean(puter.auth?.isSignedIn?.());
    } catch {
        return false;
    }
}

export async function ensurePuterAuth(): Promise<boolean> {
    if (!isPuterAvailable()) return false;
    try {
        if (!puter.auth?.isSignedIn?.()) {
            await puter.auth?.signIn?.();
        }
        return Boolean(puter.auth?.isSignedIn?.());
    } catch {
        return false;
    }
}

export async function chatCompletion(messages: LLMMessage[]): Promise<string> {
    if (!isPuterAvailable()) {
        throw new Error('Puter.js is not loaded. Reload the extension and try again.');
    }

    const model = await getModel();
    const response = await withRetry(() => puter.ai.chat(messages, { model }));
    return normalizeChatResponse(response);
}

export async function* streamChatCompletion(
    messages: LLMMessage[]
): AsyncGenerator<string, void, undefined> {
    if (!isPuterAvailable()) {
        throw new Error('Puter.js is not loaded. Reload the extension and try again.');
    }

    const model = await getModel();

    try {
        const stream = await withRetry(() => puter.ai.chat(messages, { model, stream: true }));
        let sawChunk = false;

        for await (const part of stream as AsyncIterable<{ text?: string; content?: string }>) {
            const text = part?.text || part?.content;
            if (text) {
                sawChunk = true;
                yield text;
            }
        }

        if (!sawChunk) {
            const fallback = await chatCompletion(messages);
            if (fallback) yield fallback;
        }
    } catch {
        // Fallback to non-streaming mode when streaming is unavailable.
        const fallback = await chatCompletion(messages);
        if (fallback) yield fallback;
    }
}
