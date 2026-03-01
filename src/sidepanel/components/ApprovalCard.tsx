import type { ActionPlan } from '../../types';

interface Props {
    plan: ActionPlan;
    onApprove: () => void;
    onReject: () => void;
}

const STATUS_TOKEN: Record<string, string> = {
    pending: 'PEND',
    executing: 'RUN',
    done: 'DONE',
    failed: 'FAIL',
    rejected: 'STOP',
};

export default function ApprovalCard({ plan, onApprove, onReject }: Props) {
    const isPending = plan.status === 'pending';
    const isExecuting = plan.status === 'executing';
    const isDone = plan.status === 'done';
    const isFailed = plan.status === 'failed';
    const isRejected = plan.status === 'rejected';

    return (
        <div className="approval-card">
            <div className="approval-header">
                <span className="approval-icon">{STATUS_TOKEN[plan.status] || 'PEND'}</span>
                <span className="approval-title">
                    {isPending && 'Approval Required'}
                    {isExecuting && 'Executing'}
                    {isDone && 'Completed'}
                    {isFailed && 'Failed'}
                    {isRejected && 'Cancelled'}
                </span>
                {isDone && <span className="status-badge status-badge-success">Success</span>}
                {isFailed && <span className="status-badge status-badge-error">Failed</span>}
                {isRejected && <span className="status-badge status-badge-error">Rejected</span>}
            </div>

            <div className="approval-desc">{plan.description}</div>

            <ul className="approval-steps">
                {plan.steps.map((step, index) => (
                    <li
                        key={index}
                        className={`approval-step ${step.status === 'done' ? 'step-done' : step.status === 'failed' ? 'step-failed' : ''}`}
                    >
                        <span className="step-icon">{STATUS_TOKEN[step.status || 'pending']}</span>
                        <span>{step.label}</span>
                    </li>
                ))}
            </ul>

            {isPending && (
                <div className="approval-actions">
                    <button className="btn btn-approve" onClick={onApprove}>Approve</button>
                    <button className="btn btn-reject" onClick={onReject}>Reject</button>
                </div>
            )}
        </div>
    );
}
