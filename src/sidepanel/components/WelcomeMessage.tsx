import type { PageType } from '../../types';

interface Props {
    pageType?: PageType;
    pageTitle?: string;
}

const TIPS: Record<PageType, { token: string; text: string }[]> = {
    article: [
        { token: 'SUM', text: '"Summarize this page"' },
        { token: 'Q', text: '"What are the key takeaways?"' },
        { token: 'EXP', text: '"Explain in simple terms"' },
    ],
    form: [
        { token: 'FORM', text: '"Fill this form with my details"' },
        { token: 'CHK', text: '"What fields are required?"' },
    ],
    email: [
        { token: 'MAIL', text: '"Draft a reply to this email"' },
        { token: 'SUM', text: '"Summarize this email thread"' },
    ],
    table: [
        { token: 'DATA', text: '"Extract this table as JSON"' },
        { token: 'ANL', text: '"What trends do you see?"' },
    ],
    search: [
        { token: 'CMP', text: '"Compare these search results"' },
        { token: 'SUM', text: '"Summarize the top results"' },
    ],
    general: [
        { token: 'Q', text: '"What is this page about?"' },
        { token: 'SUM', text: '"Summarize this page"' },
        { token: 'EXP', text: '"Explain in simple terms"' },
    ],
};

export default function WelcomeMessage({ pageType = 'general', pageTitle }: Props) {
    const tips = TIPS[pageType] || TIPS.general;

    return (
        <div className="welcome-message">
            <div className="welcome-icon">T</div>
            <h3 className="welcome-title">Welcome to Twigg</h3>
            {pageTitle && (
                <p className="welcome-page">
                    Viewing: <strong>{pageTitle}</strong>
                </p>
            )}
            <p className="welcome-subtitle">Try asking:</p>
            <div className="welcome-tips">
                {tips.map((tip, i) => (
                    <div key={i} className="welcome-tip">
                        <span className="welcome-token">{tip.token}</span>
                        <span>{tip.text}</span>
                    </div>
                ))}
            </div>
            <div className="welcome-shortcut">
                Shortcut: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Y</kbd>
            </div>
        </div>
    );
}
