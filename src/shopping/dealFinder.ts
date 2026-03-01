import { chatCompletion } from '../ai/llm';

export interface DealOffer {
    title: string;
    url: string;
    domain: string;
    priceText?: string;
    priceValue?: number;
    source: 'deal' | 'similar';
}

export type DealVerdict = 'buy_now' | 'watch' | 'wait';
export type DealConfidence = 'high' | 'medium' | 'low';

export interface DealSearchResult {
    query: string;
    bestOffer?: DealOffer;
    offers: DealOffer[];
    similar: DealOffer[];
    notes: string[];
    verdict: DealVerdict;
    verdictReason: string;
    confidence: DealConfidence;
    minPrice?: number;
    maxPrice?: number;
    averagePrice?: number;
}

export interface DealWatchItem {
    id: string;
    query: string;
    targetPrice?: number;
    lastBestPrice?: number;
    lastBestPriceText?: string;
    lastBestUrl?: string;
    lastBestTitle?: string;
    verdict: DealVerdict;
    confidence: DealConfidence;
    updatedAt: number;
}

const REQUEST_TIMEOUT_MS = 12000;
const DEAL_LIMIT = 10;
const SIMILAR_LIMIT = 8;
const WATCHLIST_KEY = 'twigg_deal_watchlist_v1';

function withTimeout<T>(promise: Promise<T>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('Request timed out.')), timeoutMs);
        promise
            .then((value) => {
                window.clearTimeout(timer);
                resolve(value);
            })
            .catch((error) => {
                window.clearTimeout(timer);
                reject(error);
            });
    });
}

function normalizeUrl(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) throw new Error('Empty URL.');
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    return `https://${trimmed}`;
}

function toProxyUrl(url: string): string {
    const normalized = normalizeUrl(url);
    return `https://r.jina.ai/http://${normalized.replace(/^https?:\/\//i, '')}`;
}

async function fetchText(url: string): Promise<string> {
    const res = await withTimeout(fetch(url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}

function decodeDuckDuckGoRedirect(url: string): string {
    try {
        const parsed = new URL(url);
        if (parsed.hostname.includes('duckduckgo.com') && parsed.pathname.startsWith('/l/')) {
            const target = parsed.searchParams.get('uddg');
            if (target) return decodeURIComponent(target);
        }
    } catch {
        return url;
    }
    return url;
}

function extractDomain(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}

function isLikelyProductDomain(domain: string): boolean {
    const allowed = [
        'amazon.',
        'walmart.',
        'target.',
        'ebay.',
        'etsy.',
        'bestbuy.',
        'macy',
        'nordstrom',
        'asos',
        'zara',
        'hm.',
        'nike.',
        'adidas.',
        'shop',
        'store',
        'flipkart',
        'myntra',
        'ajio',
    ];
    return allowed.some((part) => domain.includes(part));
}

function extractMarkdownLinks(markdown: string): Array<{ title: string; url: string }> {
    const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    const results: Array<{ title: string; url: string }> = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(markdown))) {
        const title = (match[1] || '').trim();
        const rawUrl = (match[2] || '').trim();
        const url = decodeDuckDuckGoRedirect(rawUrl);
        if (!title || !url) continue;
        if (url.includes('duckduckgo.com') || url.includes('i.duckduckgo.com')) continue;
        results.push({ title, url });
    }
    return results;
}

function parsePrice(text: string): { value: number; text: string } | null {
    const patterns = [
        { currency: '$', regex: /(?:US\$|\$)\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i },
        { currency: 'USD', regex: /([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)\s?(?:USD|dollars?)/i },
        { currency: 'EUR', regex: /(?:EUR)\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i },
        { currency: 'GBP', regex: /(?:GBP)\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i },
        { currency: 'INR', regex: /(?:INR)\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i },
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern.regex);
        if (!match) continue;
        const numeric = Number.parseFloat(match[1].replace(/,/g, ''));
        if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1000000) continue;
        return { value: numeric, text: `${pattern.currency} ${match[1]}` };
    }
    return null;
}

async function estimatePriceFromUrl(url: string): Promise<{ value?: number; text?: string }> {
    try {
        const body = await fetchText(toProxyUrl(url));
        const found = parsePrice(body.slice(0, 5000));
        if (!found) return {};
        return { value: found.value, text: found.text };
    } catch {
        return {};
    }
}

async function getSearchLinks(query: string): Promise<Array<{ title: string; url: string }>> {
    const ddgUrl = `http://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const text = await fetchText(toProxyUrl(ddgUrl));
    const links = extractMarkdownLinks(text);

    const uniqueByUrl = new Map<string, { title: string; url: string }>();
    for (const link of links) {
        if (!uniqueByUrl.has(link.url)) uniqueByUrl.set(link.url, link);
    }
    return Array.from(uniqueByUrl.values());
}

async function deriveQueryFromItemUrl(itemUrl: string): Promise<string> {
    const text = await fetchText(toProxyUrl(itemUrl));
    const titleMatch = text.match(/^Title:\s*(.+)$/im);
    const title = titleMatch?.[1]?.trim();
    if (title) {
        return title
            .replace(/\s*[-|:].+$/g, '')
            .replace(/\s{2,}/g, ' ')
            .slice(0, 90);
    }
    return itemUrl;
}

function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
        reader.readAsDataURL(file);
    });
}

async function imageToCompactDataUrl(file: File): Promise<string> {
    try {
        const bitmap = await createImageBitmap(file);
        const maxSide = 512;
        const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context unavailable.');

        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        return canvas.toDataURL('image/jpeg', 0.82);
    } catch {
        return fileToDataUrl(file);
    }
}

async function deriveQueryFromImage(file: File): Promise<string> {
    const dataUrl = await imageToCompactDataUrl(file);
    const prompt = [
        'Identify the main product in this image.',
        'Return only one short web-shopping query (max 8 words).',
        'If it looks like clothing, include type + key color/pattern.',
        `Image: ${dataUrl.slice(0, 120000)}`,
    ].join('\n');

    try {
        const raw = await withTimeout(
            chatCompletion([
                { role: 'system', content: 'You extract product search queries.' },
                { role: 'user', content: prompt },
            ]),
            16000
        );
        const cleaned = raw.replace(/^["'\s]+|["'\s]+$/g, '').split('\n')[0].trim();
        if (cleaned && cleaned.length >= 3) return cleaned.slice(0, 80);
    } catch {
        // Fallback below.
    }

    const baseName = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
    return baseName || 'dress fashion item';
}

async function enrichOffers(
    links: Array<{ title: string; url: string }>,
    source: 'deal' | 'similar',
    limit: number
): Promise<DealOffer[]> {
    const shortlist = links.slice(0, limit);
    const offers = await Promise.all(
        shortlist.map(async (link) => {
            const domain = extractDomain(link.url);
            const price = await estimatePriceFromUrl(link.url);
            return {
                title: link.title,
                url: link.url,
                domain,
                priceText: price.text,
                priceValue: price.value,
                source,
            } satisfies DealOffer;
        })
    );
    return offers;
}

function rankDeals(offers: DealOffer[]): DealOffer[] {
    return [...offers].sort((a, b) => {
        if (a.priceValue && b.priceValue) return a.priceValue - b.priceValue;
        if (a.priceValue && !b.priceValue) return -1;
        if (!a.priceValue && b.priceValue) return 1;
        return a.title.localeCompare(b.title);
    });
}

function computeConfidence(totalOffers: number, pricedOffers: number): DealConfidence {
    if (totalOffers === 0) return 'low';
    const ratio = pricedOffers / totalOffers;
    if (ratio >= 0.5 && totalOffers >= 4) return 'high';
    if (ratio >= 0.25) return 'medium';
    return 'low';
}

function computeVerdict(
    minPrice: number | undefined,
    averagePrice: number | undefined,
    confidence: DealConfidence
): { verdict: DealVerdict; reason: string } {
    if (!minPrice || !averagePrice) {
        return {
            verdict: 'watch',
            reason: 'Price visibility is limited. Track this item and wait for clearer price signals.',
        };
    }

    const ratio = minPrice / averagePrice;
    if (ratio <= 0.9) {
        return {
            verdict: 'buy_now',
            reason: 'Current best deal is significantly below the observed market average.',
        };
    }

    if (ratio <= 0.97 || confidence === 'low') {
        return {
            verdict: 'watch',
            reason: 'Deal is acceptable, but there may be better prices soon.',
        };
    }

    return {
        verdict: 'wait',
        reason: 'Current best price appears above typical range in this snapshot.',
    };
}

async function runSearch(query: string): Promise<DealSearchResult> {
    const notes: string[] = [];
    const rawDealLinks = await getSearchLinks(`${query} best price buy online`);
    const filteredDealLinks = rawDealLinks.filter((link) => isLikelyProductDomain(extractDomain(link.url)));
    const dealLinks = filteredDealLinks.length ? filteredDealLinks : rawDealLinks;

    if (!dealLinks.length) {
        return {
            query,
            offers: [],
            similar: [],
            notes: ['No deals found from web search.'],
            verdict: 'watch',
            verdictReason: 'No reliable product listings found yet.',
            confidence: 'low',
        };
    }

    const rawSimilarLinks = await getSearchLinks(`${query} similar alternatives`);
    const similarLinks = rawSimilarLinks.slice(0, SIMILAR_LIMIT);

    const [offersRaw, similarRaw] = await Promise.all([
        enrichOffers(dealLinks, 'deal', DEAL_LIMIT),
        enrichOffers(similarLinks, 'similar', SIMILAR_LIMIT),
    ]);

    const offers = rankDeals(offersRaw);
    const bestOffer = offers.find((offer) => Boolean(offer.priceValue));

    const pricedValues = offers
        .map((offer) => offer.priceValue)
        .filter((value): value is number => Number.isFinite(value as number));

    const minPrice = pricedValues.length ? Math.min(...pricedValues) : undefined;
    const maxPrice = pricedValues.length ? Math.max(...pricedValues) : undefined;
    const averagePrice = pricedValues.length
        ? pricedValues.reduce((sum, value) => sum + value, 0) / pricedValues.length
        : undefined;

    const confidence = computeConfidence(offers.length, pricedValues.length);
    const verdictData = computeVerdict(minPrice, averagePrice, confidence);

    if (!bestOffer) {
        notes.push('Could not confidently parse prices from result pages. Showing best matches instead.');
    }

    return {
        query,
        bestOffer,
        offers,
        similar: similarRaw,
        notes,
        verdict: verdictData.verdict,
        verdictReason: verdictData.reason,
        confidence,
        minPrice,
        maxPrice,
        averagePrice,
    };
}

async function loadWatchlistFromLocal(): Promise<DealWatchItem[]> {
    const result = await chrome.storage.local.get(WATCHLIST_KEY);
    return (result[WATCHLIST_KEY] as DealWatchItem[] | undefined) || [];
}

async function saveWatchlistToLocal(items: DealWatchItem[]): Promise<void> {
    await chrome.storage.local.set({ [WATCHLIST_KEY]: items });
}

export async function loadDealWatchlist(): Promise<DealWatchItem[]> {
    try {
        if (typeof puter !== 'undefined' && puter.kv?.get) {
            const remote = await puter.kv.get(WATCHLIST_KEY);
            if (Array.isArray(remote)) {
                const normalized = remote as DealWatchItem[];
                await saveWatchlistToLocal(normalized);
                return normalized;
            }
        }
    } catch {
        // Fallback below.
    }
    return loadWatchlistFromLocal();
}

async function saveDealWatchlist(items: DealWatchItem[]): Promise<void> {
    await saveWatchlistToLocal(items);
    try {
        if (typeof puter !== 'undefined' && puter.kv?.set) {
            await puter.kv.set(WATCHLIST_KEY, items);
        }
    } catch {
        // local save already completed
    }
}

export async function trackDealResult(result: DealSearchResult, targetPrice?: number): Promise<DealWatchItem[]> {
    const watchlist = await loadDealWatchlist();
    const existing = watchlist.find((item) => item.query.toLowerCase() === result.query.toLowerCase());
    const next: DealWatchItem = {
        id: existing?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        query: result.query,
        targetPrice,
        lastBestPrice: result.bestOffer?.priceValue,
        lastBestPriceText: result.bestOffer?.priceText,
        lastBestUrl: result.bestOffer?.url,
        lastBestTitle: result.bestOffer?.title,
        verdict: result.verdict,
        confidence: result.confidence,
        updatedAt: Date.now(),
    };

    const updated = [next, ...watchlist.filter((item) => item.id !== next.id)].slice(0, 200);
    await saveDealWatchlist(updated);
    return updated;
}

export async function removeDealWatchItem(id: string): Promise<DealWatchItem[]> {
    const watchlist = await loadDealWatchlist();
    const updated = watchlist.filter((item) => item.id !== id);
    await saveDealWatchlist(updated);
    return updated;
}

export async function refreshWatchItem(id: string): Promise<{ watchlist: DealWatchItem[]; result?: DealSearchResult }> {
    const watchlist = await loadDealWatchlist();
    const item = watchlist.find((entry) => entry.id === id);
    if (!item) return { watchlist };

    const latest = await runSearch(item.query);
    const updated = await trackDealResult(latest, item.targetPrice);
    return { watchlist: updated, result: latest };
}

export async function findDealsFromUrl(itemUrl: string): Promise<DealSearchResult> {
    const query = await deriveQueryFromItemUrl(itemUrl);
    return runSearch(query);
}

export async function findDealsFromImage(file: File): Promise<DealSearchResult> {
    const query = await deriveQueryFromImage(file);
    return runSearch(query);
}

export async function findDealsFromManualQuery(query: string): Promise<DealSearchResult> {
    const cleaned = query.trim();
    if (!cleaned) throw new Error('Please enter an item query.');
    return runSearch(cleaned);
}
