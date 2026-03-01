import type { PageType } from '../../types';

interface Props {
    onAction: (action: string) => void;
    hasSelection: boolean;
    hasTables: boolean;
    hasForms: boolean;
    pageType: PageType;
}

interface QuickAction {
    id: string;
    label: string;
    token: string;
    show?: (p: Props) => boolean;
}

const actions: QuickAction[] = [
    { id: 'summarize', label: 'Summarize', token: 'SUM' },
    { id: 'explain', label: 'Explain', token: 'EXP' },
    { id: 'rewrite', label: 'Rewrite', token: 'RW', show: (p) => p.hasSelection },
    { id: 'extract', label: 'Extract Data', token: 'DATA', show: (p) => p.hasTables },
    { id: 'fill', label: 'Fill Form', token: 'FORM', show: (p) => p.hasForms },
    { id: 'draft_email', label: 'Draft Reply', token: 'MAIL', show: (p) => p.pageType === 'email' },
    { id: 'compare', label: 'Key Points', token: 'KEY' },
];

export default function QuickActions(props: Props) {
    const visibleActions = actions.filter((a) => !a.show || a.show(props));

    return (
        <div className="quick-actions">
            {visibleActions.map((action) => (
                <button key={action.id} className="quick-action-pill" onClick={() => props.onAction(action.id)}>
                    <span className="pill-icon">{action.token}</span>
                    {action.label}
                </button>
            ))}
        </div>
    );
}
