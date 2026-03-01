// ── Twigg Intent Classifier ──
import type { ClassifiedIntent, Intent, SubIntent } from '../types';

// Keyword patterns for fast local classification (avoids LLM call)
const INTENT_PATTERNS: { intent: Intent; subIntent: SubIntent; keywords: RegExp }[] = [
    { intent: 'INFORMATION', subIntent: 'summarize', keywords: /\b(summarize|summary|summarise|tl;?dr|key points|overview)\b/i },
    { intent: 'INFORMATION', subIntent: 'explain', keywords: /\b(explain|what does|what is|what are|how does|mean|meaning|eli5|simple terms)\b/i },
    { intent: 'TRANSFORM', subIntent: 'rewrite', keywords: /\b(rewrite|rephrase|reword|improve|polish|make it|convert to|translate)\b/i },
    { intent: 'ACTION', subIntent: 'fill_form', keywords: /\b(fill|complete|submit|enter|type in|autofill|fill out|fill in)\b/i },
    { intent: 'ACTION', subIntent: 'extract_data', keywords: /\b(extract|scrape|copy|export|table|data|csv|json|download data)\b/i },
    { intent: 'ACTION', subIntent: 'click', keywords: /\b(click|press|tap|open|navigate to|go to)\b/i },
    { intent: 'ACTION', subIntent: 'draft', keywords: /\b(draft|write|compose|reply|respond|email)\b/i },
];

/**
 * Classify user intent using keyword matching.
 * Falls back to 'qa' (general question) if no pattern matches.
 */
export function classifyIntent(message: string): ClassifiedIntent {
    const trimmed = message.trim().toLowerCase();

    for (const pattern of INTENT_PATTERNS) {
        if (pattern.keywords.test(trimmed)) {
            return { intent: pattern.intent, subIntent: pattern.subIntent };
        }
    }

    // Default: treat as a question about the page
    return { intent: 'INFORMATION', subIntent: 'qa' };
}

/**
 * Determine the system prompt key based on classified intent.
 */
export function getPromptKey(classified: ClassifiedIntent): string {
    switch (classified.subIntent) {
        case 'summarize': return 'SUMMARIZE';
        case 'explain': return 'EXPLAIN';
        case 'rewrite': return 'REWRITE';
        case 'fill_form':
        case 'extract_data':
        case 'click':
            return 'ACTION';
        case 'draft':
        case 'qa':
        default:
            return 'QA';
    }
}
