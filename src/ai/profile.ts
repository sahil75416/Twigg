export interface UserProfile {
    fullName: string;
    email: string;
    phone: string;
    address: string;
    company: string;
    role: string;
    writingTone: 'professional' | 'friendly' | 'concise';
}

const PROFILE_STORAGE_KEY = 'twigg_profile_v1';

const DEFAULT_PROFILE: UserProfile = {
    fullName: '',
    email: '',
    phone: '',
    address: '',
    company: '',
    role: '',
    writingTone: 'professional',
};

function sanitizeProfile(input: Partial<UserProfile> | null | undefined): UserProfile {
    return {
        fullName: input?.fullName?.trim() || '',
        email: input?.email?.trim() || '',
        phone: input?.phone?.trim() || '',
        address: input?.address?.trim() || '',
        company: input?.company?.trim() || '',
        role: input?.role?.trim() || '',
        writingTone:
            input?.writingTone === 'friendly' || input?.writingTone === 'concise'
                ? input.writingTone
                : 'professional',
    };
}

async function loadProfileFromLocal(): Promise<UserProfile> {
    const result = await chrome.storage.local.get(PROFILE_STORAGE_KEY);
    return sanitizeProfile((result[PROFILE_STORAGE_KEY] as Partial<UserProfile> | undefined) || DEFAULT_PROFILE);
}

async function saveProfileToLocal(profile: UserProfile): Promise<void> {
    await chrome.storage.local.set({ [PROFILE_STORAGE_KEY]: profile });
}

export async function loadUserProfile(): Promise<UserProfile> {
    try {
        if (typeof puter !== 'undefined' && puter.kv?.get) {
            const kvProfile = await puter.kv.get(PROFILE_STORAGE_KEY);
            if (kvProfile && typeof kvProfile === 'object') {
                const profile = sanitizeProfile(kvProfile as Partial<UserProfile>);
                await saveProfileToLocal(profile);
                return profile;
            }
        }
    } catch {
        // Fallback to local storage.
    }

    return loadProfileFromLocal();
}

export async function saveUserProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
    const clean = sanitizeProfile(profile);
    await saveProfileToLocal(clean);

    try {
        if (typeof puter !== 'undefined' && puter.kv?.set) {
            await puter.kv.set(PROFILE_STORAGE_KEY, clean);
        }
    } catch {
        // Local profile has already been saved.
    }

    return clean;
}

export function formatProfileForPrompt(profile: UserProfile): string {
    const hasAnyValue = Object.values(profile).some((value) => Boolean(value));
    if (!hasAnyValue) return 'No profile provided.';

    return JSON.stringify(
        {
            fullName: profile.fullName,
            email: profile.email,
            phone: profile.phone,
            address: profile.address,
            company: profile.company,
            role: profile.role,
            writingTone: profile.writingTone,
        },
        null,
        2
    );
}
