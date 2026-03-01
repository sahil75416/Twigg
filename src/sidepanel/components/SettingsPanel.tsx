import { useEffect, useState } from 'react';
import { getModel, setModel } from '../../ai/llm';
import { loadUserProfile, saveUserProfile, type UserProfile } from '../../ai/profile';

interface Props {
    onClose: () => void;
    onProfileUpdated?: (profile: UserProfile) => void;
}

const MODELS = [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Recommended)' },
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite (Fastest)' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
];

const EMPTY_PROFILE: UserProfile = {
    fullName: '',
    email: '',
    phone: '',
    address: '',
    company: '',
    role: '',
    writingTone: 'professional',
};

export default function SettingsPanel({ onClose, onProfileUpdated }: Props) {
    const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash');
    const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
    const [saved, setSaved] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        Promise.all([getModel(), loadUserProfile()])
            .then(([model, loadedProfile]) => {
                setSelectedModel(model);
                setProfile(loadedProfile);
            })
            .finally(() => setIsLoading(false));
    }, []);

    const handleSave = async () => {
        const savedProfile = await saveUserProfile(profile);
        await setModel(selectedModel);
        onProfileUpdated?.(savedProfile);
        setSaved(true);
        setTimeout(() => {
            setSaved(false);
            onClose();
        }, 800);
    };

    const updateProfile = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
        setProfile((prev) => ({ ...prev, [key]: value }));
    };

    return (
        <div className="settings-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="settings-panel">
                <div className="settings-header">
                    <h2 className="settings-title">Settings</h2>
                    <button className="icon-btn" onClick={onClose}>X</button>
                </div>

                <div className="settings-group">
                    <label className="settings-label">AI Model</label>
                    <select
                        className="settings-select"
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        disabled={isLoading}
                    >
                        {MODELS.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                </div>

                <div className="settings-group">
                    <label className="settings-label">Full Name</label>
                    <input
                        className="settings-input"
                        value={profile.fullName}
                        onChange={(e) => updateProfile('fullName', e.target.value)}
                        placeholder="Jane Doe"
                        disabled={isLoading}
                    />
                </div>

                <div className="settings-group">
                    <label className="settings-label">Email</label>
                    <input
                        className="settings-input"
                        value={profile.email}
                        onChange={(e) => updateProfile('email', e.target.value)}
                        placeholder="jane@company.com"
                        disabled={isLoading}
                    />
                </div>

                <div className="settings-group">
                    <label className="settings-label">Phone</label>
                    <input
                        className="settings-input"
                        value={profile.phone}
                        onChange={(e) => updateProfile('phone', e.target.value)}
                        placeholder="+1 555 000 0000"
                        disabled={isLoading}
                    />
                </div>

                <div className="settings-group">
                    <label className="settings-label">Address</label>
                    <input
                        className="settings-input"
                        value={profile.address}
                        onChange={(e) => updateProfile('address', e.target.value)}
                        placeholder="Street, City, ZIP"
                        disabled={isLoading}
                    />
                </div>

                <div className="settings-group">
                    <label className="settings-label">Company</label>
                    <input
                        className="settings-input"
                        value={profile.company}
                        onChange={(e) => updateProfile('company', e.target.value)}
                        placeholder="Company name"
                        disabled={isLoading}
                    />
                </div>

                <div className="settings-group">
                    <label className="settings-label">Role</label>
                    <input
                        className="settings-input"
                        value={profile.role}
                        onChange={(e) => updateProfile('role', e.target.value)}
                        placeholder="Your role"
                        disabled={isLoading}
                    />
                </div>

                <div className="settings-group">
                    <label className="settings-label">Writing Tone</label>
                    <select
                        className="settings-select"
                        value={profile.writingTone}
                        onChange={(e) => updateProfile('writingTone', e.target.value as UserProfile['writingTone'])}
                        disabled={isLoading}
                    >
                        <option value="professional">Professional</option>
                        <option value="friendly">Friendly</option>
                        <option value="concise">Concise</option>
                    </select>
                </div>

                <div className="puter-badge">
                    <span className="puter-badge-icon">AI</span>
                    Profile is saved locally and synced with Puter when available.
                </div>

                <button className="settings-save-btn" onClick={handleSave} disabled={isLoading}>
                    {saved ? 'Saved' : 'Save Settings'}
                </button>
            </div>
        </div>
    );
}
