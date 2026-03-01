---
description: Build and develop the Twigg browser extension
---

// turbo-all

## Development

1. Install dependencies:
```
npm install
```

2. Start dev server (with hot reload):
```
npm run dev
```

3. Load in Chrome:
   - Open `chrome://extensions`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked** → select the `dist/` folder

## Production Build

1. Build the extension:
```
npm run build
```

2. Reload in Chrome:
   - Go to `chrome://extensions`
   - Click the 🔄 refresh icon on the Twigg card

## Key Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config, permissions, keyboard shortcut |
| `src/ai/llm.ts` | LLM client (Puter.js — free, no API key) |
| `src/sidepanel/App.tsx` | Main sidebar app |
| `src/content/extractor.ts` | DOM extraction engine |
| `src/content/executor.ts` | Action execution engine |
| `src/sidepanel/styles/index.css` | Design system |

## Adding a New Model

1. Open `src/sidepanel/components/SettingsPanel.tsx`
2. Add entry to the `MODELS` array:
```tsx
{ value: 'model-id', label: 'Display Name' }
```
3. Rebuild: `npm run build`

## Keyboard Shortcut

- **Ctrl+Shift+Y** — Toggle sidebar (configurable in `manifest.json` → `commands`)
