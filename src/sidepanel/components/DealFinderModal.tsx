import { useEffect, useMemo, useState } from 'react';
import {
    findDealsFromImage,
    findDealsFromManualQuery,
    findDealsFromUrl,
    loadDealWatchlist,
    refreshWatchItem,
    removeDealWatchItem,
    trackDealResult,
    type DealSearchResult,
    type DealWatchItem,
} from '../../shopping/dealFinder';

interface Props {
    onClose: () => void;
}

type Mode = 'url' | 'image' | 'query';

function verdictLabel(verdict: DealSearchResult['verdict']): string {
    if (verdict === 'buy_now') return 'Buy now';
    if (verdict === 'wait') return 'Wait';
    return 'Watch';
}

export default function DealFinderModal({ onClose }: Props) {
    const [mode, setMode] = useState<Mode>('url');
    const [urlInput, setUrlInput] = useState('');
    const [queryInput, setQueryInput] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [targetPriceInput, setTargetPriceInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<DealSearchResult | null>(null);
    const [watchlist, setWatchlist] = useState<DealWatchItem[]>([]);

    useEffect(() => {
        loadDealWatchlist().then(setWatchlist).catch(() => {
            // no-op
        });
    }, []);

    const canSearch = useMemo(() => {
        if (isLoading) return false;
        if (mode === 'url') return Boolean(urlInput.trim());
        if (mode === 'query') return Boolean(queryInput.trim());
        return Boolean(imageFile);
    }, [isLoading, mode, urlInput, queryInput, imageFile]);

    const handleSearch = async () => {
        setError('');
        setResult(null);
        setIsLoading(true);

        try {
            let next: DealSearchResult;
            if (mode === 'url') {
                next = await findDealsFromUrl(urlInput);
            } else if (mode === 'query') {
                next = await findDealsFromManualQuery(queryInput);
            } else {
                if (!imageFile) throw new Error('Please upload an image first.');
                next = await findDealsFromImage(imageFile);
            }
            setResult(next);
        } catch (e) {
            setError((e as Error).message || 'Deal search failed.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleTrackCurrent = async () => {
        if (!result) return;
        const parsedTarget = Number.parseFloat(targetPriceInput);
        const target = Number.isFinite(parsedTarget) && parsedTarget > 0 ? parsedTarget : undefined;
        const updated = await trackDealResult(result, target);
        setWatchlist(updated);
    };

    const handleRemoveWatch = async (id: string) => {
        const updated = await removeDealWatchItem(id);
        setWatchlist(updated);
    };

    const handleRefreshWatch = async (id: string) => {
        setIsLoading(true);
        setError('');
        try {
            const refreshed = await refreshWatchItem(id);
            setWatchlist(refreshed.watchlist);
            if (refreshed.result) setResult(refreshed.result);
        } catch (e) {
            setError((e as Error).message || 'Failed to refresh tracked item.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="settings-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="settings-panel deal-finder-panel">
                <div className="settings-header">
                    <h2 className="settings-title">Deal Finder</h2>
                    <button className="icon-btn" onClick={onClose}>X</button>
                </div>

                <div className="deal-mode-row">
                    <button className={`deal-mode-btn ${mode === 'url' ? 'active' : ''}`} onClick={() => setMode('url')}>
                        Item URL
                    </button>
                    <button className={`deal-mode-btn ${mode === 'image' ? 'active' : ''}`} onClick={() => setMode('image')}>
                        Upload Image
                    </button>
                    <button className={`deal-mode-btn ${mode === 'query' ? 'active' : ''}`} onClick={() => setMode('query')}>
                        Manual Query
                    </button>
                </div>

                {mode === 'url' && (
                    <div className="settings-group">
                        <label className="settings-label">Product URL</label>
                        <input
                            className="settings-input"
                            placeholder="https://example.com/product"
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                        />
                    </div>
                )}

                {mode === 'query' && (
                    <div className="settings-group">
                        <label className="settings-label">Search Query</label>
                        <input
                            className="settings-input"
                            placeholder="black floral midi dress"
                            value={queryInput}
                            onChange={(e) => setQueryInput(e.target.value)}
                        />
                    </div>
                )}

                {mode === 'image' && (
                    <div className="settings-group">
                        <label className="settings-label">Upload Product Image</label>
                        <input
                            className="settings-input"
                            type="file"
                            accept="image/*"
                            onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                        />
                        {imageFile && <div className="deal-file-chip">{imageFile.name}</div>}
                    </div>
                )}

                <button className="settings-save-btn" disabled={!canSearch} onClick={handleSearch}>
                    {isLoading ? 'Searching web...' : 'Find Best Price + Similar'}
                </button>

                {error && <div className="deal-error">{error}</div>}

                {result && (
                    <div className="deal-results">
                        <div className="deal-query">Query: {result.query}</div>

                        <div className="deal-verdict-row">
                            <span className={`deal-verdict-badge verdict-${result.verdict}`}>{verdictLabel(result.verdict)}</span>
                            <span className={`deal-confidence-badge confidence-${result.confidence}`}>{result.confidence} confidence</span>
                        </div>
                        <div className="deal-note">{result.verdictReason}</div>

                        {(result.minPrice || result.averagePrice || result.maxPrice) && (
                            <div className="deal-price-band">
                                <span>Min: {result.minPrice?.toFixed(2) || 'N/A'}</span>
                                <span>Avg: {result.averagePrice?.toFixed(2) || 'N/A'}</span>
                                <span>Max: {result.maxPrice?.toFixed(2) || 'N/A'}</span>
                            </div>
                        )}

                        {result.bestOffer ? (
                            <div className="deal-best-card">
                                <div className="deal-best-label">Best Price Found</div>
                                <a href={result.bestOffer.url} target="_blank" rel="noreferrer" className="deal-link">
                                    {result.bestOffer.title}
                                </a>
                                <div className="deal-meta">
                                    <span>{result.bestOffer.domain}</span>
                                    <span>{result.bestOffer.priceText || 'Price unavailable'}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="deal-note">No confident price detected yet. Showing best matches.</div>
                        )}

                        {result.notes.map((note, i) => (
                            <div key={i} className="deal-note">{note}</div>
                        ))}

                        <div className="shopper-order-actions">
                            <input
                                className="settings-input"
                                placeholder="Target price (optional)"
                                value={targetPriceInput}
                                onChange={(e) => setTargetPriceInput(e.target.value)}
                            />
                            <button className="deal-mode-btn" onClick={() => { void handleTrackCurrent(); }}>
                                Track
                            </button>
                        </div>

                        <div className="deal-section-title">Top Price Matches</div>
                        <div className="deal-list">
                            {result.offers.slice(0, 8).map((offer, i) => (
                                <a key={`${offer.url}-${i}`} href={offer.url} target="_blank" rel="noreferrer" className="deal-item">
                                    <div className="deal-item-title">{offer.title}</div>
                                    <div className="deal-meta">
                                        <span>{offer.domain}</span>
                                        <span>{offer.priceText || 'N/A'}</span>
                                    </div>
                                </a>
                            ))}
                        </div>

                        <div className="deal-section-title">Similar Items</div>
                        <div className="deal-list">
                            {result.similar.slice(0, 8).map((offer, i) => (
                                <a key={`${offer.url}-${i}`} href={offer.url} target="_blank" rel="noreferrer" className="deal-item">
                                    <div className="deal-item-title">{offer.title}</div>
                                    <div className="deal-meta">
                                        <span>{offer.domain}</span>
                                        <span>{offer.priceText || 'N/A'}</span>
                                    </div>
                                </a>
                            ))}
                        </div>
                    </div>
                )}

                <div className="deal-section-title tracked-title">Tracked Deals</div>
                <div className="deal-list">
                    {watchlist.length === 0 && <div className="deal-note">No tracked deals yet.</div>}
                    {watchlist.slice(0, 10).map((item) => {
                        const hitTarget = Boolean(item.targetPrice && item.lastBestPrice && item.lastBestPrice <= item.targetPrice);
                        return (
                            <div className="deal-item" key={item.id}>
                                <div className="deal-item-title">{item.query}</div>
                                <div className="deal-meta">
                                    <span>{item.lastBestPriceText || 'N/A'}</span>
                                    <span>{item.confidence}</span>
                                </div>
                                {hitTarget && <div className="deal-target-hit">Target reached</div>}
                                <div className="shopper-order-actions">
                                    <button className="deal-mode-btn" onClick={() => { void handleRefreshWatch(item.id); }}>
                                        Refresh
                                    </button>
                                    {item.lastBestUrl && (
                                        <a className="deal-mode-btn" href={item.lastBestUrl} target="_blank" rel="noreferrer">
                                            Open
                                        </a>
                                    )}
                                    <button className="deal-mode-btn" onClick={() => { void handleRemoveWatch(item.id); }}>
                                        Remove
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
