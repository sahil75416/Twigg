import { useEffect, useMemo, useState } from 'react';
import { findDealsFromManualQuery, type DealOffer } from '../../shopping/dealFinder';
import {
    addTrackedOrder,
    extractOrderFromText,
    getShopperAlias,
    loadTrackedOrders,
    removeTrackedOrder,
    summarizeOrders,
    updateTrackedOrderStatus,
    type OrderStatus,
    type TrackedOrder,
} from '../../shopping/orderTracker';

interface Props {
    onClose: () => void;
    pageText?: string;
}

type Tab = 'orders' | 'import' | 'insights';

interface OrderInsight {
    bestOffer?: DealOffer;
    note?: string;
    loading?: boolean;
}

const STATUS_OPTIONS: OrderStatus[] = ['ordered', 'shipped', 'delivered', 'cancelled', 'returned'];

export default function PowerShopperModal({ onClose, pageText }: Props) {
    const [activeTab, setActiveTab] = useState<Tab>('orders');
    const [alias, setAlias] = useState('');
    const [orders, setOrders] = useState<TrackedOrder[]>([]);
    const [importText, setImportText] = useState('');
    const [error, setError] = useState('');
    const [isWorking, setIsWorking] = useState(false);
    const [insights, setInsights] = useState<Record<string, OrderInsight>>({});

    useEffect(() => {
        Promise.all([getShopperAlias(), loadTrackedOrders()])
            .then(([nextAlias, nextOrders]) => {
                setAlias(nextAlias);
                setOrders(nextOrders);
            })
            .catch(() => {
                setError('Failed to load shopper data.');
            });
    }, []);

    const summary = useMemo(() => summarizeOrders(orders), [orders]);

    const handleCopyAlias = async () => {
        try {
            await navigator.clipboard.writeText(alias);
        } catch {
            // no-op
        }
    };

    const handleImportText = async () => {
        setError('');
        setIsWorking(true);
        try {
            const extracted = await extractOrderFromText(importText, 'email');
            const updated = await addTrackedOrder(extracted);
            setOrders(updated);
            setImportText('');
            setActiveTab('orders');
        } catch (e) {
            setError((e as Error).message || 'Import failed.');
        } finally {
            setIsWorking(false);
        }
    };

    const handleImportCurrentPage = async () => {
        if (!pageText?.trim()) {
            setError('No current page text available for import.');
            return;
        }
        setError('');
        setIsWorking(true);
        try {
            const extracted = await extractOrderFromText(pageText, 'page');
            const updated = await addTrackedOrder(extracted);
            setOrders(updated);
            setActiveTab('orders');
        } catch (e) {
            setError((e as Error).message || 'Import failed.');
        } finally {
            setIsWorking(false);
        }
    };

    const handleStatusChange = async (orderId: string, status: OrderStatus) => {
        const updated = await updateTrackedOrderStatus(orderId, status);
        setOrders(updated);
    };

    const handleDeleteOrder = async (orderId: string) => {
        const updated = await removeTrackedOrder(orderId);
        setOrders(updated);
    };

    const handleLoadInsight = async (order: TrackedOrder) => {
        setInsights((prev) => ({ ...prev, [order.id]: { ...(prev[order.id] || {}), loading: true } }));
        try {
            const query = `${order.item} ${order.merchant}`.trim();
            const result = await findDealsFromManualQuery(query);
            setInsights((prev) => ({
                ...prev,
                [order.id]: {
                    loading: false,
                    bestOffer: result.bestOffer,
                    note: result.notes[0],
                },
            }));
        } catch (e) {
            setInsights((prev) => ({
                ...prev,
                [order.id]: {
                    loading: false,
                    note: (e as Error).message || 'Insight failed.',
                },
            }));
        }
    };

    return (
        <div className="settings-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="settings-panel shopper-panel">
                <div className="settings-header">
                    <h2 className="settings-title">Power Shopper</h2>
                    <button className="icon-btn" onClick={onClose}>X</button>
                </div>

                <div className="shopper-alias-card">
                    <div className="shopper-alias-label">Your Twigg Shopper Inbox</div>
                    <div className="shopper-alias-value">{alias || 'Generating...'}</div>
                    <button className="deal-mode-btn" onClick={handleCopyAlias}>Copy Alias</button>
                    <div className="shopper-alias-note">
                        Use this alias while shopping to keep purchase receipts centralized.
                    </div>
                </div>

                <div className="deal-mode-row">
                    <button className={`deal-mode-btn ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>
                        Orders
                    </button>
                    <button className={`deal-mode-btn ${activeTab === 'import' ? 'active' : ''}`} onClick={() => setActiveTab('import')}>
                        Import
                    </button>
                    <button className={`deal-mode-btn ${activeTab === 'insights' ? 'active' : ''}`} onClick={() => setActiveTab('insights')}>
                        AI Insights
                    </button>
                </div>

                {error && <div className="deal-error">{error}</div>}

                {activeTab === 'orders' && (
                    <div className="shopper-section">
                        <div className="shopper-summary-grid">
                            <div className="shopper-summary-card">
                                <div className="shopper-summary-label">Total Orders</div>
                                <div className="shopper-summary-value">{summary.totalOrders}</div>
                            </div>
                            <div className="shopper-summary-card">
                                <div className="shopper-summary-label">Known Spend</div>
                                <div className="shopper-summary-value">{summary.totalSpendKnown.toFixed(2)}</div>
                            </div>
                            <div className="shopper-summary-card">
                                <div className="shopper-summary-label">Pending</div>
                                <div className="shopper-summary-value">{summary.pendingDeliveries}</div>
                            </div>
                        </div>

                        <div className="deal-list">
                            {orders.length === 0 && <div className="deal-note">No orders tracked yet.</div>}
                            {orders.map((order) => (
                                <div key={order.id} className="shopper-order-card">
                                    <div className="deal-item-title">{order.item}</div>
                                    <div className="deal-meta">
                                        <span>{order.merchant}</span>
                                        <span>{order.totalText || 'N/A'}</span>
                                    </div>
                                    <div className="shopper-order-actions">
                                        <select
                                            className="settings-select"
                                            value={order.status}
                                            onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)}
                                        >
                                            {STATUS_OPTIONS.map((status) => (
                                                <option key={status} value={status}>{status}</option>
                                            ))}
                                        </select>
                                        <button className="deal-mode-btn" onClick={() => handleDeleteOrder(order.id)}>
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'import' && (
                    <div className="shopper-section">
                        <div className="settings-group">
                            <label className="settings-label">Paste Receipt / Order Email Text</label>
                            <textarea
                                className="settings-input shopper-textarea"
                                value={importText}
                                onChange={(e) => setImportText(e.target.value)}
                                placeholder="Paste your order receipt email content here..."
                            />
                        </div>
                        <div className="shopper-import-actions">
                            <button
                                className="settings-save-btn"
                                disabled={isWorking || !importText.trim()}
                                onClick={handleImportText}
                            >
                                {isWorking ? 'Importing...' : 'Import From Text'}
                            </button>
                            <button
                                className="deal-mode-btn"
                                disabled={isWorking}
                                onClick={handleImportCurrentPage}
                            >
                                Import From Current Page
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'insights' && (
                    <div className="shopper-section">
                        <div className="deal-list">
                            {orders.length === 0 && <div className="deal-note">No orders available for insight generation.</div>}
                            {orders.map((order) => {
                                const insight = insights[order.id];
                                return (
                                    <div key={order.id} className="shopper-order-card">
                                        <div className="deal-item-title">{order.item}</div>
                                        <div className="deal-meta">
                                            <span>{order.merchant}</span>
                                            <span>{order.totalText || 'N/A'}</span>
                                        </div>
                                        <button
                                            className="deal-mode-btn"
                                            onClick={() => { void handleLoadInsight(order); }}
                                            disabled={Boolean(insight?.loading)}
                                        >
                                            {insight?.loading ? 'Analyzing...' : 'Find Better Deal'}
                                        </button>
                                        {insight?.bestOffer && (
                                            <a className="deal-item" href={insight.bestOffer.url} target="_blank" rel="noreferrer">
                                                <div className="deal-item-title">{insight.bestOffer.title}</div>
                                                <div className="deal-meta">
                                                    <span>{insight.bestOffer.domain}</span>
                                                    <span>{insight.bestOffer.priceText || 'N/A'}</span>
                                                </div>
                                            </a>
                                        )}
                                        {insight?.note && <div className="deal-note">{insight.note}</div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
