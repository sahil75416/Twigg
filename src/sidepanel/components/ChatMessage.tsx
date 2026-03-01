import { useMemo, useState } from 'react';
import type { ChatMessage } from '../../types';
import { showToast } from './Toast';

interface Props {
    message: ChatMessage;
}

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderMarkdownLite(raw: string): string {
    const escaped = escapeHtml(raw);
    const withCodeBlocks = escaped.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
        return `<pre><code>${code}</code></pre>`;
    });

    const withInline = withCodeBlocks
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^# (.+)$/gm, '<h2>$1</h2>')
        .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
        .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br/>');

    return `<p>${withInline}</p>`;
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            showToast('Copied to clipboard.', 'success');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            showToast('Failed to copy.', 'error');
        }
    };

    return (
        <button className="copy-btn" onClick={handleCopy} title="Copy response">
            {copied ? 'OK' : 'CPY'}
        </button>
    );
}

export default function ChatMessageComponent({ message }: Props) {
    const isUser = message.role === 'user';
    const isError = message.content.startsWith('From this page:') && message.content.toLowerCase().includes('failed');

    const className = [
        'message',
        isUser ? 'message-user' : 'message-assistant',
        isError && !isUser ? 'message-error' : '',
    ]
        .filter(Boolean)
        .join(' ');

    const renderedAssistant = useMemo(() => renderMarkdownLite(message.content), [message.content]);

    return (
        <div className={`message-wrapper ${isUser ? 'message-wrapper-user' : ''}`}>
            <div className={className}>
                <div
                    className="message-content"
                    dangerouslySetInnerHTML={{
                        __html: isUser ? escapeHtml(message.content) : renderedAssistant,
                    }}
                />
                {message.isStreaming && <span className="streaming-cursor">|</span>}
            </div>
            {!isUser && !message.isStreaming && message.content && <CopyButton text={message.content} />}
        </div>
    );
}
