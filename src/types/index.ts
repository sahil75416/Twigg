// ── Shared types for Twigg extension ──

export interface PageContext {
    url: string;
    title: string;
    visibleText: string;
    headings: Heading[];
    forms: ExtractedForm[];
    tables: ExtractedTable[];
    interactiveElements: InteractiveElement[];
    selectedText: string;
    pageType: PageType;
}

export interface Heading {
    level: number;
    text: string;
}

export interface ExtractedForm {
    id: string;
    action: string;
    fields: FormField[];
}

export interface FormField {
    tag: string;
    type: string;
    name: string;
    label: string;
    placeholder: string;
    value: string;
    selector: string;
    options?: string[]; // for <select>
}

export interface ExtractedTable {
    index: number;
    headers: string[];
    rows: string[][];
    selector: string;
}

export interface InteractiveElement {
    tag: string;
    type: string;
    text: string;
    selector: string;
}

export type PageType = 'article' | 'form' | 'email' | 'search' | 'table' | 'general';

export type Intent = 'INFORMATION' | 'TRANSFORM' | 'ACTION';
export type SubIntent = 'summarize' | 'explain' | 'rewrite' | 'qa' | 'fill_form' | 'extract_data' | 'click' | 'draft';

export interface ClassifiedIntent {
    intent: Intent;
    subIntent: SubIntent;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    actionPlan?: ActionPlan;
    isStreaming?: boolean;
}

export interface ActionPlan {
    description: string;
    steps: ActionStep[];
    status: 'pending' | 'approved' | 'rejected' | 'executing' | 'done' | 'failed';
}

export interface ActionStep {
    action: 'fill_input' | 'click' | 'extract_table';
    selector: string;
    value?: string;
    label: string;
    status?: 'pending' | 'done' | 'failed';
}

// ── Chrome messaging types ──

export type MessageType =
    | 'EXTRACT_PAGE'
    | 'EXECUTE_ACTION'
    | 'GET_SELECTION'
    | 'ACTION_RESULT';

export interface ExtensionMessage {
    type: MessageType;
    payload?: unknown;
}

export interface ExtractPageResponse {
    success: boolean;
    context?: PageContext;
    error?: string;
}

export interface ActionResultResponse {
    success: boolean;
    results?: { step: string; success: boolean; error?: string }[];
    error?: string;
}
