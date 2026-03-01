// ── Twigg DOM Extraction Engine ──
import type { PageContext, Heading, ExtractedForm, FormField, ExtractedTable, InteractiveElement, PageType } from '../types';

const IGNORED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'META', 'LINK', 'BR', 'HR']);
const NOISE_TAGS = new Set(['NAV', 'FOOTER', 'ASIDE', 'HEADER']);

/**
 * Extract clean visible text from the page, ignoring scripts/styles/nav.
 */
export function extractVisibleText(): string {
    const body = document.body;
    if (!body) return '';

    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            if (IGNORED_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
            if (NOISE_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
            if (parent.offsetParent === null && parent.tagName !== 'BODY') return NodeFilter.FILTER_REJECT;
            const text = node.textContent?.trim();
            if (!text) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        },
    });

    const chunks: string[] = [];
    while (walker.nextNode()) {
        const text = walker.currentNode.textContent?.trim();
        if (text && text.length > 1) chunks.push(text);
    }

    return chunks.join('\n').slice(0, 15000); // Cap at 15k chars for LLM context
}

/**
 * Extract heading structure (h1–h6).
 */
export function extractHeadings(): Heading[] {
    const headings: Heading[] = [];
    document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
        const text = el.textContent?.trim();
        if (text) {
            headings.push({ level: parseInt(el.tagName[1]), text });
        }
    });
    return headings;
}

/**
 * Build a unique CSS selector for an element.
 */
function buildSelector(el: Element): string {
    if (el.id) return `#${CSS.escape(el.id)}`;

    const name = el.getAttribute('name');
    if (name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;

    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
    if (testId) return `${el.tagName.toLowerCase()}[data-testid="${CSS.escape(testId)}"]`;

    const tag = el.tagName.toLowerCase();
    const parent = el.parentElement;
    if (!parent) return tag;

    const parentSelector = buildSelector(parent);
    const sameTagSiblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
    if (sameTagSiblings.length === 1) {
        return `${parentSelector} > ${tag}`;
    }

    const index = sameTagSiblings.indexOf(el) + 1;
    return `${parentSelector} > ${tag}:nth-of-type(${index})`;
}

/**
 * Get label text for a form field.
 */
function getFieldLabel(field: Element): string {
    // Check for associated <label>
    const id = field.getAttribute('id');
    if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label?.textContent?.trim()) return label.textContent.trim();
    }
    // Check parent label
    const parentLabel = field.closest('label');
    if (parentLabel?.textContent?.trim()) return parentLabel.textContent.trim();
    // Check aria-label
    const ariaLabel = field.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    // Check placeholder
    const placeholder = field.getAttribute('placeholder');
    if (placeholder) return placeholder;
    // Fallback to name
    return field.getAttribute('name') || field.getAttribute('type') || 'unknown';
}

/**
 * Extract all forms and their fields.
 */
export function extractForms(): ExtractedForm[] {
    const forms: ExtractedForm[] = [];
    document.querySelectorAll('form').forEach((form, i) => {
        const fields: FormField[] = [];
        form.querySelectorAll('input, select, textarea').forEach((field) => {
            const el = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
            if (el.type === 'hidden' || el.type === 'submit') return;
            const fieldData: FormField = {
                tag: el.tagName.toLowerCase(),
                type: el.type || 'text',
                name: el.name || '',
                label: getFieldLabel(el),
                placeholder: el.getAttribute('placeholder') || '',
                value: el.value || '',
                selector: buildSelector(el),
            };
            if (el.tagName === 'SELECT') {
                fieldData.options = Array.from((el as HTMLSelectElement).options).map((o) => o.text);
            }
            fields.push(fieldData);
        });
        if (fields.length > 0) {
            forms.push({
                id: form.id || `form-${i}`,
                action: form.action || '',
                fields,
            });
        }
    });
    return forms;
}

/**
 * Extract table data.
 */
export function extractTables(): ExtractedTable[] {
    const tables: ExtractedTable[] = [];
    document.querySelectorAll('table').forEach((table, index) => {
        const headers: string[] = [];
        table.querySelectorAll('th').forEach((th) => {
            headers.push(th.textContent?.trim() || '');
        });

        const rows: string[][] = [];
        table.querySelectorAll('tbody tr, tr').forEach((tr) => {
            const cells: string[] = [];
            tr.querySelectorAll('td').forEach((td) => {
                cells.push(td.textContent?.trim() || '');
            });
            if (cells.length > 0) rows.push(cells);
        });

        if (rows.length > 0 || headers.length > 0) {
            tables.push({ index, headers, rows, selector: buildSelector(table) });
        }
    });
    return tables;
}

/**
 * Extract interactive elements.
 */
export function extractInteractiveElements(): InteractiveElement[] {
    const elements: InteractiveElement[] = [];
    document.querySelectorAll('button, a[href], input[type="submit"], input[type="button"]').forEach((el) => {
        const text = el.textContent?.trim() || el.getAttribute('aria-label') || el.getAttribute('title') || '';
        if (text) {
            elements.push({
                tag: el.tagName.toLowerCase(),
                type: el.getAttribute('type') || '',
                text: text.slice(0, 100),
                selector: buildSelector(el),
            });
        }
    });
    return elements.slice(0, 50); // Limit to 50 elements
}

/**
 * Detect page type based on content.
 */
export function detectPageType(): PageType {
    const url = window.location.href.toLowerCase();
    const forms = document.querySelectorAll('form');
    const tables = document.querySelectorAll('table');

    if (url.includes('mail') || url.includes('inbox') || url.includes('compose')) return 'email';
    if (url.includes('search') || document.querySelector('input[type="search"]')) return 'search';
    if (forms.length > 0 && forms[0].querySelectorAll('input, select, textarea').length >= 3) return 'form';
    if (tables.length > 0 && tables[0].querySelectorAll('tr').length >= 3) return 'table';
    if (document.querySelector('article') || document.querySelectorAll('p').length >= 3) return 'article';
    return 'general';
}

/**
 * Get the currently selected text on the page.
 */
export function getSelectedText(): string {
    return window.getSelection()?.toString()?.trim() || '';
}

/**
 * Main extraction function — gathers all page context.
 */
export function extractPageContext(): PageContext {
    return {
        url: window.location.href,
        title: document.title,
        visibleText: extractVisibleText(),
        headings: extractHeadings(),
        forms: extractForms(),
        tables: extractTables(),
        interactiveElements: extractInteractiveElements(),
        selectedText: getSelectedText(),
        pageType: detectPageType(),
    };
}
