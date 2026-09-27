# TagBack — Mock Data Layer & API Contract Plan

> Frontend-only dev plan. No live DB. In-memory + localStorage mock layer for React/Vite.

---

## 1. Data Contracts (JSDoc)

```js
/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} email
 * @property {'light'|'dark'|'system'} themePref
 */

/**
 * @typedef {Object} Item
 * @property {string} tagId
 * @property {string} name
 * @property {string} category
 * @property {boolean} isLostMode
 * @property {string|null} lostSince        - ISO timestamp, null if not lost
 * @property {string} rewardText
 * @property {'safe'|'lost'|'found_reported'|'recovered'} status
 */

/**
 * @typedef {Object} Chat
 * @property {string} id
 * @property {string} tagId
 * @property {string} finderSessionToken
 * @property {string} lastMessageAt         - ISO timestamp
 * @property {string} lastMessageText
 * @property {'owner'|'finder'|'none'} unreadFor
 * @property {boolean} blocked
 */

/**
 * @typedef {Object} Message
 * @property {string} id
 * @property {string} chatId
 * @property {'owner'|'finder'} senderRole
 * @property {string} text
 * @property {string} timestamp             - ISO timestamp
 */

/**
 * @typedef {Object} Notification
 * @property {string} id
 * @property {'report'|'message'} type
 * @property {string} tagId
 * @property {boolean} read
 * @property {string} createdAt             - ISO timestamp
 */
```

---

## 2. Seed Data Object

```js
export const seedData = {
  user: {
    id: "user_001",
    email: "jane.doe@example.com",
    themePref: "dark",
  },

  items: [
    {
      tagId: "tag_001",
      name: "Leather Backpack",
      category: "Bags",
      isLostMode: false,
      lostSince: null,
      rewardText: "",
      status: "safe",
    },
    {
      tagId: "tag_002",
      name: "Silver MacBook Pro",
      category: "Electronics",
      isLostMode: true,
      lostSince: "2026-09-01T08:15:00.000Z",
      rewardText: "₱2,000 reward, no questions asked",
      status: "lost",
    },
    {
      tagId: "tag_003",
      name: "House Keys (Blue Lanyard)",
      category: "Keys",
      isLostMode: false,
      lostSince: "2026-08-28T14:02:00.000Z",
      rewardText: "Coffee's on me 🙏",
      status: "found_reported",
    },
  ],

  chats: [
    {
      id: "chat_001",
      tagId: "tag_003",
      finderSessionToken: "finder_sess_7f3a9c",
      lastMessageAt: "2026-08-28T15:40:00.000Z",
      lastMessageText: "Great, I'll swing by around 6pm today.",
      unreadFor: "owner",
      blocked: false,
    },
  ],

  messages: [
    {
      id: "msg_001",
      chatId: "chat_001",
      senderRole: "finder",
      text: "Hi! I found keys on a blue lanyard near the campus library. Are these yours?",
      timestamp: "2026-08-28T14:05:00.000Z",
    },
    {
      id: "msg_002",
      chatId: "chat_001",
      senderRole: "owner",
      text: "Yes! Thank you so much for reaching out. Is there a small silver charm on it shaped like a cat?",
      timestamp: "2026-08-28T14:12:00.000Z",
    },
    {
      id: "msg_003",
      chatId: "chat_001",
      senderRole: "finder",
      text: "Yep, exactly! I can meet near the library entrance whenever works for you.",
      timestamp: "2026-08-28T14:20:00.000Z",
    },
    {
      id: "msg_004",
      chatId: "chat_001",
      senderRole: "owner",
      text: "Great, I'll swing by around 6pm today.",
      timestamp: "2026-08-28T15:40:00.000Z",
    },
  ],

  notifications: [
    {
      id: "notif_001",
      type: "report",
      tagId: "tag_003",
      read: false,
      createdAt: "2026-08-28T14:05:00.000Z",
    },
    {
      id: "notif_002",
      type: "message",
      tagId: "tag_003",
      read: false,
      createdAt: "2026-08-28T14:20:00.000Z",
    },
  ],
};
```

---

## 3. Mock API Service Layer — `lib/api.js`

Design goals:
- Promise-based, `setTimeout` latency (300–800ms) to force real loading states.
- Single source of truth persisted to `localStorage`, hydrated from `seedData` on first run.
- Pure functions in, mutated store out — components never touch storage directly.

```js
import { seedData } from "./seedData";

const STORAGE_KEY = "tagback_mock_db_v1";

function randomDelay() {
  return 300 + Math.random() * 500; // 300ms - 800ms
}

function loadDb() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seedData));
  return structuredClone(seedData);
}

function saveDb(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function withLatency(fn) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(fn());
      } catch (err) {
        reject(err);
      }
    }, randomDelay());
  });
}

// ---- Reads ----

export function getOwnerItems() {
  return withLatency(() => {
    const db = loadDb();
    return db.items;
  });
}

export function getChatMessages(chatId) {
  return withLatency(() => {
    const db = loadDb();
    return db.messages.filter((m) => m.chatId === chatId);
  });
}

export function getOwnerChats() {
  return withLatency(() => loadDb().chats);
}

export function getNotifications() {
  return withLatency(() => loadDb().notifications);
}

// ---- Writes ----

export function sendMessage(chatId, role, text) {
  return withLatency(() => {
    const db = loadDb();
    const message = {
      id: `msg_${Date.now()}`,
      chatId,
      senderRole: role,
      text,
      timestamp: new Date().toISOString(),
    };
    db.messages.push(message);

    const chat = db.chats.find((c) => c.id === chatId);
    if (chat) {
      chat.lastMessageAt = message.timestamp;
      chat.lastMessageText = text;
      chat.unreadFor = role === "owner" ? "finder" : "owner";
    }

    saveDb(db);
    return message;
  });
}

export function toggleLostMode(tagId, isLost) {
  return withLatency(() => {
    const db = loadDb();
    const item = db.items.find((i) => i.tagId === tagId);
    if (!item) throw new Error(`Item not found: ${tagId}`);

    item.isLostMode = isLost;
    item.lostSince = isLost ? new Date().toISOString() : null;
    item.status = isLost ? "lost" : "safe";

    saveDb(db);
    return item;
  });
}

export function markNotificationRead(notifId) {
  return withLatency(() => {
    const db = loadDb();
    const notif = db.notifications.find((n) => n.id === notifId);
    if (notif) notif.read = true;
    saveDb(db);
    return notif;
  });
}

// ---- Dev utility ----

export function resetMockDb() {
  localStorage.removeItem(STORAGE_KEY);
}
```

### Persistence notes

- First call to any `get*`/mutation lazily seeds `localStorage` from `seedData`.
- All mutations (`sendMessage`, `toggleLostMode`, `markNotificationRead`) read-modify-write the whole DB object — fine at this scale, avoids partial-write bugs.
- `resetMockDb()` exposed for dev console use when seed data needs to be re-applied (e.g. after schema changes).
- Swap-out path to real backend later: keep function signatures identical, replace bodies with `fetch` calls — components stay untouched.
