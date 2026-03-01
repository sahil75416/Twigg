import { useState } from 'react';
import { ensurePuterAuth, setModel } from '../../ai/llm';

interface Props {
    onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleStart = async () => {
        setLoading(true);
        setError('');

        try {
            const authenticated = await ensurePuterAuth();
            if (!authenticated) {
                throw new Error('Sign in was not completed.');
            }

            await setModel('gemini-2.0-flash');
            await chrome.storage.local.set({ onboarded: true });
            onComplete();
        } catch {
            setError('Puter sign in failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="onboarding">
            <div className="onboarding-logo-wrapper">T</div>
            <h1 className="onboarding-title">Twigg</h1>
            <p className="onboarding-tagline">
                Your AI browser copilot. Understand pages, take actions, and stay in control.
            </p>

            <div className="onboarding-form">
                <div className="puter-badge" style={{ marginBottom: '16px' }}>
                    <span className="puter-badge-icon">AI</span>
                    Powered by Puter
                </div>

                {error && (
                    <div style={{ color: '#fca5a5', fontSize: '12px', marginBottom: '12px' }}>
                        {error}
                    </div>
                )}

                <button className="onboarding-btn" onClick={handleStart} disabled={loading}>
                    {loading ? 'Connecting...' : 'Connect & Get Started'}
                </button>

                <p style={{ fontSize: '11px', color: '#5a5a70', marginTop: '12px', lineHeight: '1.5' }}>
                    One-time Puter sign in is required.
                    <br />
                    No API key entry needed.
                </p>
            </div>
        </div>
    );
}
