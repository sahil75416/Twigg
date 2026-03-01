import { chatCompletion } from '../ai/llm';

export type OrderStatus = 'ordered' | 'shipped' | 'delivered' | 'cancelled' | 'returned';

export interface TrackedOrder {
    id: string;
    merchant: string;
    item: string;
    totalText: string;
    totalValue?: number;
    currency?: string;
    orderDate?: string;
    expectedDelivery?: string;
    status: OrderStatus;
    source: 'email' | 'page' | 'manual';
    createdAt: number;
}

export interface SpendingSummary {
    totalOrders: number;
    totalSpendKnown: number;
    pendingDeliveries: number;
    merchantBreakdown: Array<{ merchant: string; orderCount: number; spendKnown: number }>;
}

const ORDER_STORAGE_KEY = 'twigg_orders_v1';
const SHOPPER_ALIAS_KEY = 'twigg_shopper_alias_v1';

function normalizePrice(text: string): { value?: number; currency?: string; text: string } {
    const cleaned = text.trim();
    if (!cleaned) return { text: '' };

    const currencyPatterns = [
        { code: 'USD', regex: /(?:US\$|\$)\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i },
        { code: 'EUR', regex: /(?:EUR)\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i },
        { code: 'GBP', regex: /(?:GBP)\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i },
        { code: 'INR', regex: /(?:INR)\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i },
    ];

    for (const pattern of currencyPatterns) {
        const match = cleaned.match(pattern.regex);
        if (!match) continue;
        const value = Number.parseFloat(match[1].replace(/,/g, ''));
        if (!Number.isFinite(value)) continue;
        return { value, currency: pattern.code, text: `${pattern.code} ${match[1]}` };
    }

    const generic = cleaned.match(/([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/);
    if (generic) {
        const value = Number.parseFloat(generic[1].replace(/,/g, ''));
        if (Number.isFinite(value)) {
            return { value, text: generic[1] };
        }
    }

    return { text: cleaned };
}

function sanitizeOrder(input: Partial<TrackedOrder>): TrackedOrder {
    const merchant = (input.merchant || 'Unknown Merchant').trim().slice(0, 80);
    const item = (input.item || 'Unknown Item').trim().slice(0, 140);
    const totalText = (input.totalText || '').trim().slice(0, 40);
    const normalizedPrice = normalizePrice(totalText);

    return {
        id: input.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        merchant,
        item,
        totalText: normalizedPrice.text || totalText || 'N/A',
        totalValue: typeof input.totalValue === 'number' ? input.totalValue : normalizedPrice.value,
        currency: input.currency || normalizedPrice.currency,
        orderDate: input.orderDate?.trim() || undefined,
        expectedDelivery: input.expectedDelivery?.trim() || undefined,
        status: input.status || 'ordered',
        source: input.source || 'manual',
        createdAt: typeof input.createdAt === 'number' ? input.createdAt : Date.now(),
    };
}

async function loadOrdersFromLocal(): Promise<TrackedOrder[]> {
    const result = await chrome.storage.local.get(ORDER_STORAGE_KEY);
    const raw = (result[ORDER_STORAGE_KEY] as Partial<TrackedOrder>[] | undefined) || [];
    return raw.map((item) => sanitizeOrder(item));
}

async function saveOrdersToLocal(orders: TrackedOrder[]): Promise<void> {
    await chrome.storage.local.set({ [ORDER_STORAGE_KEY]: orders });
}

export async function loadTrackedOrders(): Promise<TrackedOrder[]> {
    try {
        if (typeof puter !== 'undefined' && puter.kv?.get) {
            const remote = await puter.kv.get(ORDER_STORAGE_KEY);
            if (Array.isArray(remote)) {
                const normalized = remote.map((item) => sanitizeOrder(item as Partial<TrackedOrder>));
                await saveOrdersToLocal(normalized);
                return normalized;
            }
        }
    } catch {
        // Fallback below.
    }
    return loadOrdersFromLocal();
}

export async function saveTrackedOrders(orders: TrackedOrder[]): Promise<void> {
    await saveOrdersToLocal(orders);
    try {
        if (typeof puter !== 'undefined' && puter.kv?.set) {
            await puter.kv.set(ORDER_STORAGE_KEY, orders);
        }
    } catch {
        // Local save already completed.
    }
}

export async function addTrackedOrder(order: Partial<TrackedOrder>): Promise<TrackedOrder[]> {
    const next = sanitizeOrder(order);
    const orders = await loadTrackedOrders();
    const updated = [next, ...orders].slice(0, 500);
    await saveTrackedOrders(updated);
    return updated;
}

export async function updateTrackedOrderStatus(orderId: string, status: OrderStatus): Promise<TrackedOrder[]> {
    const orders = await loadTrackedOrders();
    const updated = orders.map((order) => (order.id === orderId ? { ...order, status } : order));
    await saveTrackedOrders(updated);
    return updated;
}

export async function removeTrackedOrder(orderId: string): Promise<TrackedOrder[]> {
    const orders = await loadTrackedOrders();
    const updated = orders.filter((order) => order.id !== orderId);
    await saveTrackedOrders(updated);
    return updated;
}

export function summarizeOrders(orders: TrackedOrder[]): SpendingSummary {
    const totalSpendKnown = orders.reduce((sum, order) => sum + (order.totalValue || 0), 0);
    const pendingDeliveries = orders.filter((order) => order.status === 'ordered' || order.status === 'shipped').length;

    const byMerchant = new Map<string, { merchant: string; orderCount: number; spendKnown: number }>();
    for (const order of orders) {
        const key = order.merchant.toLowerCase();
        const existing = byMerchant.get(key) || { merchant: order.merchant, orderCount: 0, spendKnown: 0 };
        existing.orderCount += 1;
        existing.spendKnown += order.totalValue || 0;
        byMerchant.set(key, existing);
    }

    return {
        totalOrders: orders.length,
        totalSpendKnown,
        pendingDeliveries,
        merchantBreakdown: Array.from(byMerchant.values()).sort((a, b) => b.spendKnown - a.spendKnown),
    };
}

export async function getShopperAlias(): Promise<string> {
    const local = await chrome.storage.local.get(SHOPPER_ALIAS_KEY);
    const existing = local[SHOPPER_ALIAS_KEY] as string | undefined;
    if (existing) return existing;

    const alias = `shopper-${Math.random().toString(36).slice(2, 8)}@shop.twigg.ai`;
    await chrome.storage.local.set({ [SHOPPER_ALIAS_KEY]: alias });

    try {
        if (typeof puter !== 'undefined' && puter.kv?.set) {
            await puter.kv.set(SHOPPER_ALIAS_KEY, alias);
        }
    } catch {
        // Local alias already saved.
    }

    return alias;
}

function parseOrderFromLLMResponse(raw: string, source: TrackedOrder['source']): Partial<TrackedOrder> {
    const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        throw new Error('AI did not return valid JSON.');
    }

    const json = JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as Partial<TrackedOrder>;
    return {
        merchant: json.merchant,
        item: json.item,
        totalText: json.totalText,
        orderDate: json.orderDate,
        expectedDelivery: json.expectedDelivery,
        status: json.status || 'ordered',
        source,
    };
}

export async function extractOrderFromText(
    text: string,
    source: TrackedOrder['source']
): Promise<Partial<TrackedOrder>> {
    const snippet = text.trim().slice(0, 12000);
    if (!snippet) throw new Error('No text provided for order extraction.');

    const prompt = [
        'Extract order info from the text below.',
        'Return strict JSON only with keys:',
        '{ "merchant": string, "item": string, "totalText": string, "orderDate": string, "expectedDelivery": string, "status": "ordered|shipped|delivered|cancelled|returned" }',
        'If missing, use empty string.',
        `TEXT:\n${snippet}`,
    ].join('\n');

    try {
        const raw = await chatCompletion([
            { role: 'system', content: 'You extract structured shopping order details.' },
            { role: 'user', content: prompt },
        ]);
        return parseOrderFromLLMResponse(raw, source);
    } catch {
        // Fallback: heuristic extraction.
        const lines = snippet.split('\n').map((line) => line.trim()).filter(Boolean);
        const merchant = lines[0]?.slice(0, 80) || 'Unknown Merchant';
        const item = lines.find((line) => /item|product|order/i.test(line)) || lines[1] || 'Unknown Item';
        const totalLine = lines.find((line) => /total|amount|price|paid/i.test(line)) || '';
        return {
            merchant,
            item,
            totalText: totalLine,
            status: 'ordered',
            source,
        };
    }
}
