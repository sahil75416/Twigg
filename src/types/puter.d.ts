declare interface PuterChatOptions {
    model?: string;
    stream?: boolean;
}

declare interface PuterAuth {
    signIn?: () => Promise<unknown>;
    isSignedIn?: () => boolean;
}

declare interface PuterKV {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<unknown>;
}

declare interface PuterGlobal {
    ai: {
        chat: (
            messages: string | { role: string; content: string }[],
            options?: PuterChatOptions
        ) => Promise<unknown>;
    };
    auth?: PuterAuth;
    kv?: PuterKV;
}

declare const puter: PuterGlobal;
