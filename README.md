# WireWave (Mobile - React Native / Expo)

A modern mobile chat client built with React Native + Expo, featuring token-based authentication, responsive split-pane chat layout (contact list + conversation), message grouping by day, and persistent session management.

## Features

- Email + password authentication (JWT token persisted with AsyncStorage)
- Auto token injection via Axios interceptor
- Contact list derived from message history (dynamic, no separate contact table yet)
- Responsive layout:
  - Wide screens: two-pane (contacts + chat)
  - Narrow screens: toggleable drawer-like contacts panel
- Message grouping by date & auto-scroll to latest
- Lightweight dark UI theme
- Session persistence with ability to force-clear (config flag)
- Clean project structure ready for extension (profiles, presence, real-time sockets)

## Tech Stack

- React Native (Expo SDK 54)
- React Navigation (stack)
- React Context for auth state
- AsyncStorage for persistence
- Axios for API calls
- React Native Paper (basic components)
- JavaScript (can be migrated to TypeScript later)

## Project Structure (key paths)

```
.
└── src
    ├── AuthContext.js        # Auth state + token persistence
    ├── api.js                # Axios instance + auth header
    ├── screens/
    │   ├── LoginScreen.js
    │   ├── RegisterScreen.js
    │   └── ChatScreen.js     # Responsive split-pane chat
    └── components/
        ├── ContactList.js
        ├── ChatWindow.js
        └── MessageBubble.js
```

## Getting Started

1. Install dependencies:
   npm install
2. Start development:
   npm run start
3. Launch platform:
   - Android: npm run android
   - iOS (macOS): npm run ios
   - Web (basic): npm run web

## Environment / Configuration

Currently hard-coded base URL:

```
src/api.js -> baseURL: https://wirewaveapi.onrender.com
```

If you add environments:

```
# .env (example - remember to ignore in git)
API_URL=https://your-api
```

Then modify api.js to read from process.env.

## Authentication Flow

1. LoginScreen posts /login with { email, password }.
2. On success, token + email stored:
   - AsyncStorage: userToken, userEmail
   - global.authToken (used by Axios request interceptor)
3. AuthContext exposes:
   - userToken, userEmail
   - login(token, email)
   - logout()
4. Navigation conditionally renders auth stack vs chat stack.

To force a "fresh session" every launch:

```
src/AuthContext.js -> set CLEAR_SESSION_ON_START = true
```

## Message Handling

- ChatScreen polls /messages every 4s (simple polling; replace with WebSocket later).
- ContactList derives latest message + ordering from the aggregated message array.
- ChatWindow groups messages by date (local function groupByDate).

## Extending (Suggestions)

| Feature           | Approach                                                 |
| ----------------- | -------------------------------------------------------- |
| Real-time         | Add Socket.IO or WebSocket, push new messages into state |
| Read receipts     | Add read flag + endpoint to mark on view                 |
| Typing indicators | Emit "typing" events via socket; track per contact       |
| Profiles          | Add /profile endpoints + avatar display per contact      |
| Media             | Use expo-image-picker + upload to API or storage service |

## Styling

- Dark palette (grays + brand #3a7afe)
- Customize in component styles; consider a theme module if expanding.

## Error Handling & Debugging

Common issues:

1. Module not found: @react-navigation/native-stack
   - Resolved by switching to @react-navigation/stack (already done).
2. Session persisting unexpectedly
   - Ensure CLEAR_SESSION_ON_START = false (current) or set true to always reset.
3. 500 errors from /messages
   - Check backend token acceptance; verify token is set (print global.authToken).

Add temporary logging:

```
console.log("Token:", global.authToken);
```

## API Assumptions

Endpoints expected:

- POST /login -> { token, email? }
- POST /register -> on success 200/201
- GET /messages -> [{ id, sender_email, receiver_email, content, sent_at }]
- POST /messages -> { receiver_email, content }

Adjust mapping if backend fields differ.

## Testing Scenarios

- Login/logout cycle (token persists after reload)
- First run with no messages (empty contact list state)
- Narrow width device (contacts overlay toggle)
- Sending message appears instantly after poll refresh

## Roadmap (Potential)

- Replace polling with sockets
- Add optimistic UI (append message before server acknowledgment)
- Unified design tokens & theme provider
- Offline queue / resend
- Encryption (E2E) layer
- Push notifications (Expo Notifications)

## Scripts

- start: Expo dev server
- android / ios / web: Platform-specific launch

## Conventions

- Keep network logic in src/api.js
- Avoid placing logic in UI components that belongs in hooks/state managers
- Favor pure components for presentation (MessageBubble, ChatWindow)

## Migration to TypeScript (Optional)

1. Add dev deps: types packages + tsconfig
2. Rename files incrementally (.tsx)
3. Type context & API responses first

## Troubleshooting Quick Table

| Problem                | Fix                                                          |
| ---------------------- | ------------------------------------------------------------ |
| Token not applied      | Ensure login() called with token; check global.authToken     |
| Duplicate styles error | Caused by merging retries; ensure single StyleSheet export   |
| Navigation blank       | userToken null; check AsyncStorage or CLEAR_SESSION_ON_START |

## Contribution

1. Fork repo
2. Create feature branch
3. Keep PRs focused
4. Provide screenshot/gif for UI changes

## License

0BSD (per package.json). Modify if necessary for distribution.

## Security Notes

- Do not log raw tokens in production
- Add rate-limiting & validation server-side
- Consider rotating tokens / refresh strategy

## Acknowledgements

- React Native / Expo team
- React Navigation
- Inspiration from the web version of WireWave layout

Happy building!
