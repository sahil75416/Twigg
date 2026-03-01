import type { ActionStep } from '../types';

function setNativeValue(
    element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    value: string
): void {
    const prototype =
        element.tagName === 'SELECT'
            ? window.HTMLSelectElement.prototype
            : element.tagName === 'TEXTAREA'
                ? window.HTMLTextAreaElement.prototype
                : window.HTMLInputElement.prototype;

    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
}

function findElement(selector: string): Element | null {
    try {
        return document.querySelector(selector);
    } catch {
        return null;
    }
}

function fillInput(selector: string, value: string): { success: boolean; error?: string } {
    const target = findElement(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (!target) {
        return { success: false, error: `Element not found: ${selector}` };
    }

    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
        return { success: false, error: `Element is not an input/select: ${selector}` };
    }

    target.focus();
    setNativeValue(target, value);
    return { success: true };
}

function clickElement(selector: string): { success: boolean; error?: string } {
    const target = findElement(selector) as HTMLElement | null;
    if (!target) {
        return { success: false, error: `Element not found: ${selector}` };
    }

    target.focus();
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    target.click();
    return { success: true };
}

function extractTableAsJSON(tableIndex: number): Record<string, string>[] {
    const tables = document.querySelectorAll('table');
    const table = tables[tableIndex];
    if (!table) return [];

    const headers: string[] = [];
    table.querySelectorAll('th').forEach((th, idx) => {
        const text = th.textContent?.trim();
        headers.push(text || `col_${idx}`);
    });

    const rows: Record<string, string>[] = [];
    table.querySelectorAll('tbody tr, tr').forEach((tr) => {
        const cells = tr.querySelectorAll('td');
        if (!cells.length) return;
        const row: Record<string, string> = {};
        cells.forEach((td, i) => {
            const key = headers[i] || `col_${i}`;
            row[key] = td.textContent?.trim() || '';
        });
        rows.push(row);
    });

    return rows;
}

function extractTable(selector: string): { success: boolean; error?: string } {
    const tableIndex = Number.parseInt(selector, 10);
    if (!Number.isFinite(tableIndex) || tableIndex < 0) {
        return { success: false, error: `Invalid table index: ${selector}` };
    }

    const data = extractTableAsJSON(tableIndex);
    if (!data.length) {
        return { success: false, error: `No table data found for index ${tableIndex}` };
    }

    const output = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(output).catch(() => {
        // Ignore clipboard errors; extraction itself succeeded.
    });
    return { success: true };
}

function executeStep(step: ActionStep): { success: boolean; error?: string } {
    try {
        switch (step.action) {
            case 'fill_input':
                return fillInput(step.selector, step.value || '');
            case 'click':
                return clickElement(step.selector);
            case 'extract_table':
                return extractTable(step.selector);
            default:
                return { success: false, error: `Unsupported action: ${step.action}` };
        }
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export function executeActionPlan(
    steps: ActionStep[]
): { step: string; success: boolean; error?: string }[] {
    return steps.map((step) => ({
        step: step.label,
        ...executeStep(step),
    }));
}
