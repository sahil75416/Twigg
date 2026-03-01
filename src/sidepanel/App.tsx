import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionPlan, ChatMessage, PageContext } from '../types';
import { classifyIntent, getPromptKey } from '../ai/intents';
import { parseAndValidateActionPlan } from '../ai/actionPlan';
import {
    buildActionPrompt,
    buildContextPrompt,
    EXPLAIN_PROMPT,
    QA_PROMPT,
    REWRITE_PROMPT,
    SUMMARIZE_PROMPT,
} from '../ai/prompts';
import { ensurePuterAuth, isPuterReady, chatCompletion, streamChatCompletion } from '../ai/llm';
import { formatProfileForPrompt, loadUserProfile, type UserProfile } from '../ai/profile';
import {
    clearChatHistory,
    exportChatAsMarkdown,
    loadChatHistory,
    saveChatHistory,
} from '../utils/chatStorage';
import { executeActions, generateId, requestPageContext } from '../utils/messaging';
import ApprovalCard from './components/ApprovalCard';
import ChatInput from './components/ChatInput';
import ChatMessageComponent from './components/ChatMessage';
import OnboardingScreen from './components/OnboardingScreen';
import QuickActions from './components/QuickActions';
import SettingsPanel from './components/SettingsPanel';
import ToastContainer, { showToast } from './components/Toast';
import WelcomeMessage from './components/WelcomeMessage';
import DealFinderModal from './components/DealFinderModal';
import PowerShopperModal from './components/PowerShopperModal';

const PROMPT_MAP: Record<string, string> = {
    SUMMARIZE: SUMMARIZE_PROMPT,
    EXPLAIN: EXPLAIN_PROMPT,
    REWRITE: REWRITE_PROMPT,
    QA: QA_PROMPT,
};

const EMPTY_PROFILE: UserProfile = {
    fullName: '',
    email: '',
    phone: '',
    address: '',
    company: '',
    role: '',
    writingTone: 'professional',
};

function Icon({ type }: { type: 'export' | 'clear' | 'refresh' | 'settings' | 'online' | 'offline' | 'deals' | 'shopper' }) {
    const paths: Record<string, string> = {
        export: 'M12 3v10m0 0l4-4m-4 4l-4-4M5 21h14',
        clear: 'M6 7h12M9 7V5h6v2m-7 4v6m4-6v6m4-6v6M8 7l1 12h6l1-12',
        refresh: 'M20 12a8 8 0 10-2.34 5.66M20 12V7m0 5h-5',
        settings: 'M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 1 1-1.4 1.4l-.1-.1a1 1 0 0 0-1.1-.2a1 1 0 0 0-.6.9V19a1 1 0 1 1-2 0v-.1a1 1 0 0 0-.6-.9a1 1 0 0 0-1.1.2l-.1.1a1 1 0 1 1-1.4-1.4l.1-.1a1 1 0 0 0 .2-1.1a1 1 0 0 0-.9-.6H5a1 1 0 1 1 0-2h.1a1 1 0 0 0 .9-.6a1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 1 1 1.4-1.4l.1.1a1 1 0 0 0 1.1.2a1 1 0 0 0 .6-.9V5a1 1 0 1 1 2 0v.1a1 1 0 0 0 .6.9a1 1 0 0 0 1.1-.2l.1-.1a1 1 0 1 1 1.4 1.4l-.1.1a1 1 0 0 0-.2 1.1a1 1 0 0 0 .9.6H19a1 1 0 1 1 0 2h-.1a1 1 0 0 0-.9.6Z',
        deals: 'M3 7h18l-2 10H5L3 7zm4 0l2-3h6l2 3',
        shopper: 'M4 8h16M6 8v10h12V8M9 8V6h6v2M10 12h4',
        online: 'M12 20h.01M4.9 9a11 11 0 0 1 14.2 0M8.5 12.5a5.5 5.5 0 0 1 7 0',
        offline: 'M3 3l18 18M9.2 9.2a5.5 5.5 0 0 1 5.6 1.2M4.9 9a11 11 0 0 1 9.2-2.4',
    };

    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="icon-svg">
            <path d={paths[type]} />
        </svg>
    );
}

function buildGroundedContext(pageContext: PageContext | null): string {
    if (!pageContext) return 'No page context available.';

    const headings = pageContext.headings
        .slice(0, 12)
        .map((h) => `${'#'.repeat(Math.max(1, Math.min(h.level, 6)))} ${h.text}`)
        .join('\n');

    const selected = pageContext.selectedText?.trim()
        ? `Selected text:\n${pageContext.selectedText.trim()}`
        : 'Selected text: None';

    const mainText = pageContext.visibleText?.slice(0, 12000) || '';

    return [
        `Title: ${pageContext.title || 'Untitled'}`,
        `URL: ${pageContext.url}`,
        `Page type: ${pageContext.pageType}`,
        selected,
        headings ? `Headings:\n${headings}` : 'Headings: None',
        `Main content:\n${mainText || 'No visible text extracted.'}`,
    ].join('\n\n');
}

function buildSelectorAllowList(pageContext: PageContext | null): Set<string> {
    const allowed = new Set<string>();
    if (!pageContext) return allowed;

    for (const form of pageContext.forms) {
        for (const field of form.fields) {
            if (field.selector) allowed.add(field.selector);
        }
    }

    for (const el of pageContext.interactiveElements) {
        if (el.selector) allowed.add(el.selector);
    }

    return allowed;
}

function ensureGroundedPrefix(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return 'From this page: I could not produce an answer.';
    return trimmed.startsWith('From this page:') ? trimmed : `From this page: ${trimmed}`;
}

export default function App() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showDealFinder, setShowDealFinder] = useState(false);
    const [showPowerShopper, setShowPowerShopper] = useState(false);
    const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);
    const [pageContext, setPageContext] = useState<PageContext | null>(null);
    const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
    const [isPuterConnected, setIsPuterConnected] = useState(false);

    const chatEndRef = useRef<HTMLDivElement>(null);
    const messagesRef = useRef<ChatMessage[]>([]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        chrome.storage.local.get('onboarded').then((data) => setIsOnboarded(Boolean(data.onboarded)));
        loadChatHistory().then((saved) => {
            if (saved.length) setMessages(saved);
        });
        loadUserProfile().then(setProfile).catch(() => {
            setProfile(EMPTY_PROFILE);
        });
    }, []);

    useEffect(() => {
        const syncConnection = () => setIsPuterConnected(isPuterReady());
        syncConnection();
        const id = window.setInterval(syncConnection, 3000);
        return () => window.clearInterval(id);
    }, []);

    useEffect(() => {
        if (messages.length > 0 && !messages.some((m) => m.isStreaming)) {
            void saveChatHistory(messages);
        }
    }, [messages]);

    const refreshContext = useCallback(async () => {
        try {
            const result = await requestPageContext();
            if (result.success && result.context) setPageContext(result.context);
        } catch {
            // No-op on unsupported pages.
        }
    }, []);

    useEffect(() => {
        if (isOnboarded) void refreshContext();
    }, [isOnboarded, refreshContext]);

    useEffect(() => {
        const listener = (message: { type?: string }) => {
            if (message.type === 'TAB_CHANGED' || message.type === 'PAGE_LOADED') {
                void refreshContext();
            }
        };
        chrome.runtime.onMessage.addListener(listener);
        return () => chrome.runtime.onMessage.removeListener(listener);
    }, [refreshContext]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const addAssistantMessage = useCallback((content: string, actionPlan?: ActionPlan) => {
        setMessages((prev) => [
            ...prev,
            {
                id: generateId(),
                role: 'assistant',
                content,
                timestamp: Date.now(),
                actionPlan,
            },
        ]);
    }, []);

    const handleSendMessage = useCallback(async (text: string) => {
        const cleanText = text.trim();
        if (!cleanText || isLoading) return;

        const userMessage: ChatMessage = {
            id: generateId(),
            role: 'user',
            content: cleanText,
            timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setIsLoading(true);

        try {
            if (!isPuterReady()) {
                const signedIn = await ensurePuterAuth();
                if (!signedIn) throw new Error('Puter sign in is required before chatting.');
            }

            const classified = classifyIntent(cleanText);
            const promptKey = getPromptKey(classified);
            const groundedContext = buildGroundedContext(pageContext);
            const profilePrompt = formatProfileForPrompt(profile);

            if (classified.intent === 'ACTION' && !pageContext) {
                addAssistantMessage('From this page: I cannot run actions because page context is unavailable. Refresh and try again.');
                return;
            }

            if (classified.intent === 'ACTION' && pageContext) {
                const actionMessages = buildActionPrompt(
                    groundedContext,
                    JSON.stringify(pageContext.forms, null, 2),
                    JSON.stringify(pageContext.interactiveElements.slice(0, 40), null, 2),
                    JSON.stringify(pageContext.tables.slice(0, 10), null, 2),
                    profilePrompt,
                    cleanText
                );

                const rawPlan = await chatCompletion(actionMessages);
                const validation = parseAndValidateActionPlan(rawPlan, {
                    allowedSelectors: buildSelectorAllowList(pageContext),
                    tableCount: pageContext.tables.length,
                });

                if (validation.plan && validation.plan.steps.length > 0) {
                    addAssistantMessage(validation.plan.description, validation.plan);
                    showToast('Action plan ready. Review before running.', 'info');
                } else {
                    const validationMessage = validation.errors.length
                        ? validation.errors.join(' ')
                        : 'The action plan did not contain executable steps.';
                    addAssistantMessage(`From this page: ${validationMessage}`);
                }

                return;
            }

            const systemPrompt = PROMPT_MAP[promptKey] || QA_PROMPT;
            const queryWithProfile =
                profile.writingTone && classified.intent === 'TRANSFORM'
                    ? `${cleanText}\n\nPreferred writing tone: ${profile.writingTone}`
                    : cleanText;

            const promptMessages = buildContextPrompt(systemPrompt, groundedContext, queryWithProfile);
            const assistantId = generateId();

            setMessages((prev) => [
                ...prev,
                {
                    id: assistantId,
                    role: 'assistant',
                    content: '',
                    timestamp: Date.now(),
                    isStreaming: true,
                },
            ]);

            let finalText = '';
            for await (const chunk of streamChatCompletion(promptMessages)) {
                finalText += chunk;
                setMessages((prev) =>
                    prev.map((m) => (m.id === assistantId ? { ...m, content: finalText } : m))
                );
            }

            const normalized = ensureGroundedPrefix(finalText);
            setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: normalized, isStreaming: false } : m))
            );
        } catch (error) {
            addAssistantMessage(`From this page: ${(error as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, [addAssistantMessage, isLoading, pageContext, profile]);

    const handleApprove = useCallback(async (messageId: string) => {
        setMessages((prev) =>
            prev.map((m) =>
                m.id === messageId && m.actionPlan
                    ? { ...m, actionPlan: { ...m.actionPlan, status: 'executing' } }
                    : m
            )
        );

        const target = messagesRef.current.find((m) => m.id === messageId);
        if (!target?.actionPlan?.steps?.length) return;

        try {
            const result = await executeActions(target.actionPlan.steps);
            setMessages((prev) =>
                prev.map((m) => {
                    if (m.id !== messageId || !m.actionPlan) return m;

                    const nextSteps = m.actionPlan.steps.map((step, i) => ({
                        ...step,
                        status: result.results?.[i]?.success ? ('done' as const) : ('failed' as const),
                    }));

                    return {
                        ...m,
                        actionPlan: {
                            ...m.actionPlan,
                            status: result.success ? ('done' as const) : ('failed' as const),
                            steps: nextSteps,
                        },
                    };
                })
            );

            showToast(result.success ? 'Actions completed.' : 'Some actions failed.', result.success ? 'success' : 'error');
        } catch (error) {
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === messageId && m.actionPlan
                        ? { ...m, actionPlan: { ...m.actionPlan, status: 'failed' } }
                        : m
                )
            );
            showToast(`Execution failed: ${(error as Error).message}`, 'error');
        }
    }, []);

    const handleReject = useCallback((messageId: string) => {
        setMessages((prev) =>
            prev.map((m) =>
                m.id === messageId && m.actionPlan
                    ? { ...m, actionPlan: { ...m.actionPlan, status: 'rejected' } }
                    : m
            )
        );
        addAssistantMessage('From this page: Action cancelled.');
    }, [addAssistantMessage]);

    const handleQuickAction = useCallback((action: string) => {
        const actionMap: Record<string, string> = {
            summarize: 'Summarize this page in five bullets.',
            explain: 'Explain this page in simple terms.',
            rewrite: `Rewrite this selected text:\n\n"${pageContext?.selectedText || ''}"`,
            extract: 'Extract this table into JSON.',
            fill: 'Fill this form using my saved profile details.',
            draft_email: 'Draft a professional reply based on this page.',
            compare: 'List the most important points on this page.',
        };
        const command = actionMap[action];
        if (command) void handleSendMessage(command);
    }, [handleSendMessage, pageContext?.selectedText]);

    const handleClearChat = useCallback(async () => {
        setMessages([]);
        await clearChatHistory();
        showToast('Chat cleared.', 'info');
    }, []);

    const handleExportChat = useCallback(() => {
        const markdown = exportChatAsMarkdown(messages);
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `twigg-chat-${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Chat exported.', 'success');
    }, [messages]);

    const handleOnboardingComplete = useCallback(() => {
        setIsOnboarded(true);
        void refreshContext();
        void loadUserProfile().then(setProfile);
    }, [refreshContext]);

    if (isOnboarded === null) return null;
    if (!isOnboarded) return <OnboardingScreen onComplete={handleOnboardingComplete} />;

    return (
        <div className="sidebar">
            <ToastContainer />

            <header className="header">
                <div className="header-brand">
                    <div className="header-logo">T</div>
                    <span className="header-title">Twigg</span>
                    <span className="header-version">v0.3</span>
                    <span className={`connection-badge ${isPuterConnected ? 'online' : 'offline'}`}>
                        <Icon type={isPuterConnected ? 'online' : 'offline'} />
                        {isPuterConnected ? 'Connected' : 'Disconnected'}
                    </span>
                </div>

                <div className="header-actions">
                    {messages.length > 0 && (
                        <>
                            <button className="icon-btn" onClick={handleExportChat} title="Export chat">
                                <Icon type="export" />
                            </button>
                            <button className="icon-btn" onClick={handleClearChat} title="Clear chat">
                                <Icon type="clear" />
                            </button>
                        </>
                    )}
                    <button className="icon-btn" onClick={() => { void refreshContext(); }} title="Refresh context">
                        <Icon type="refresh" />
                    </button>
                    <button className="icon-btn" onClick={() => setShowDealFinder(true)} title="Find best price">
                        <Icon type="deals" />
                    </button>
                    <button className="icon-btn" onClick={() => setShowPowerShopper(true)} title="Power shopper hub">
                        <Icon type="shopper" />
                    </button>
                    <button className="icon-btn" onClick={() => setShowSettings(true)} title="Settings">
                        <Icon type="settings" />
                    </button>
                </div>
            </header>

            {pageContext && (
                <div className="page-info">
                    <div className="page-info-title">{pageContext.title || 'Untitled page'}</div>
                    <div className="page-info-meta">
                        <span className="page-type-badge">{pageContext.pageType}</span>
                        <span className="page-info-url">{pageContext.url}</span>
                    </div>
                </div>
            )}

            <QuickActions
                onAction={handleQuickAction}
                hasSelection={Boolean(pageContext?.selectedText)}
                hasTables={Boolean(pageContext?.tables?.length)}
                hasForms={Boolean(pageContext?.forms?.length)}
                pageType={pageContext?.pageType || 'general'}
            />

            <div className="chat-area">
                {messages.length === 0 && (
                    <WelcomeMessage pageType={pageContext?.pageType} pageTitle={pageContext?.title} />
                )}

                {messages.map((msg) => (
                    <div key={msg.id}>
                        <ChatMessageComponent message={msg} />
                        {msg.actionPlan && (
                            <ApprovalCard
                                plan={msg.actionPlan}
                                onApprove={() => { void handleApprove(msg.id); }}
                                onReject={() => handleReject(msg.id)}
                            />
                        )}
                    </div>
                ))}

                {isLoading && !messages.some((m) => m.isStreaming) && (
                    <div className="typing-indicator">
                        <div className="typing-dot" />
                        <div className="typing-dot" />
                        <div className="typing-dot" />
                    </div>
                )}

                <div ref={chatEndRef} />
            </div>

            <ChatInput onSend={(value) => { void handleSendMessage(value); }} disabled={isLoading} />

            {showSettings && (
                <SettingsPanel
                    onClose={() => setShowSettings(false)}
                    onProfileUpdated={(nextProfile) => setProfile(nextProfile)}
                />
            )}
            {showDealFinder && <DealFinderModal onClose={() => setShowDealFinder(false)} />}
            {showPowerShopper && (
                <PowerShopperModal
                    onClose={() => setShowPowerShopper(false)}
                    pageText={pageContext?.visibleText}
                />
            )}
        </div>
    );
}
