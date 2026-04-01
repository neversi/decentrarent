# DecentraRent Mobile

Expo app for DecentraRent. Shares all business logic (stores, hooks, types) with the web frontend.

## Setup

### 1. Replace LAN IP in `app.json`

Find your machine's local IP (`ipconfig` on Windows, `ifconfig` on Mac/Linux) and update:

```json
"extra": {
  "apiUrl": "http://YOUR_LAN_IP:8080",
  "centrifugoUrl": "ws://YOUR_LAN_IP:8000/connection/websocket"
}
```

Your phone and computer must be on the **same WiFi network**.

### 2. Install dependencies

```bash
npm install
```

### 3. Add token icons

Download SOL.png, USDC.png, USDT.png and place them in `src/assets/tokens/`
(see `src/assets/tokens/README.txt` for links).

### 4. Start backend services

From the monorepo root:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### 5. Start Expo

```bash
npx expo start
```

Scan the QR code with **Expo Go** on your phone.

## What's shared from frontend (unchanged)
| File | Status |
|---|---|
| `features/auth/types.ts` | ✅ Copied exactly |
| `features/chat/types.ts` | ✅ Copied exactly |
| `features/chat/store.ts` | ✅ Copied exactly |
| `features/chat/hooks/useChat.ts` | ✅ Copied exactly |
| `features/chat/hooks/useConversations.ts` | ✅ Copied exactly |
| `features/properties/types.ts` | ✅ Copied exactly |
| `features/properties/api.ts` | ✅ Copied exactly |

## What was adapted
| File | Change |
|---|---|
| `features/auth/store.ts` | AsyncStorage instead of localStorage |
| `features/auth/hooks/useWalletAuth.ts` | Mobile Wallet Adapter instead of browser extension |
| `features/chat/hooks/useCentrifugo.ts` | Uses `lib/centrifugo.ts` for LAN-aware URL |
| `features/properties/utils.ts` | `require()` for token icons instead of string paths |
| `lib/api.ts` | Full URL from `app.json` extra instead of `/api` |
| `lib/centrifugo.ts` | WS URL from `app.json` extra instead of `localhost` |
