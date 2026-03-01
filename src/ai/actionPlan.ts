import type { ActionPlan, ActionStep } from '../types';

const MAX_STEPS = 8;
const SUPPORTED_ACTIONS = new Set<ActionStep['action']>(['fill_input', 'click', 'extract_table']);

export interface ActionPlanValidationContext {
    allowedSelectors: Set<string>;
    tableCount: number;
}

function extractJsonObject(raw: string): string {
    const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        throw new Error('Planner did not return valid JSON.');
    }
    return cleaned.slice(firstBrace, lastBrace + 1);
}

function normalizeStep(step: Partial<ActionStep>, index: number): ActionStep {
    return {
        action: (step.action || 'click') as ActionStep['action'],
        selector: (step.selector || '').trim(),
        value: typeof step.value === 'string' ? step.value : '',
        label: (step.label || `Step ${index + 1}`).trim(),
        status: 'pending',
    };
}

function validateStep(step: ActionStep, context: ActionPlanValidationContext): string | null {
    if (!SUPPORTED_ACTIONS.has(step.action)) {
        return `Unsupported action: ${step.action}`;
    }

    if (!step.selector) {
        return `Missing selector for "${step.label}"`;
    }

    if (step.action === 'extract_table') {
        const index = Number.parseInt(step.selector, 10);
        if (!Number.isFinite(index) || index < 0 || index >= context.tableCount) {
            return `Invalid table index "${step.selector}" for "${step.label}"`;
        }
        return null;
    }

    if (!context.allowedSelectors.has(step.selector)) {
        return `Selector not allowed for "${step.label}"`;
    }

    return null;
}

export function parseAndValidateActionPlan(
    rawPlan: string,
    context: ActionPlanValidationContext
): { plan: ActionPlan | null; errors: string[] } {
    try {
        const jsonText = extractJsonObject(rawPlan);
        const parsed = JSON.parse(jsonText) as Partial<ActionPlan>;
        const rawSteps = Array.isArray(parsed.steps) ? parsed.steps.slice(0, MAX_STEPS) : [];
        const steps = rawSteps.map((step, index) => normalizeStep(step as Partial<ActionStep>, index));
        const errors: string[] = [];

        for (const step of steps) {
            const err = validateStep(step, context);
            if (err) errors.push(err);
        }

        const plan: ActionPlan = {
            description: (parsed.description || '').trim() || 'Proposed browser actions',
            steps,
            status: 'pending',
        };

        return {
            plan: errors.length ? null : plan,
            errors,
        };
    } catch (error) {
        return {
            plan: null,
            errors: [(error as Error).message || 'Failed to parse action plan'],
        };
    }
}
