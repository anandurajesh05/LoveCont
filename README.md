# 💜 LoveCont – Anonymous Real-Time Chat Application

LoveCont is a modern, anonymous chat application that connects strangers for spontaneous conversations and allows them to convert meaningful interactions into lasting friendships.  
Designed with **privacy-first principles**, real-time performance, and a premium **Dark Glassmorphism UI**, LoveCont delivers a seamless and engaging social experience.

---

## 🌟 Product Overview

LoveCont enables users to:
- Chat anonymously with random strangers
- Maintain privacy with minimal profiles
- Build trusted connections through a mutual friend system
- Enjoy real-time messaging with rich media support

No permanent server-side chat storage ensures **user privacy by design**.

---
📸 Screenshots

🔐 Login Page
![Login](screenshots/login.png)



🏠 Home / Dashboard
![Home](screenshots/home.png)



---

💬 Chat Interface

## ✨ Core Features

### 🔀 Anonymous Matching (Stranger View)
- Global random user pairing
- Minimal profiles (Nickname, Age, Avatar)
- Skip current match instantly
- No identity exposure unless user chooses

---

### 🤝 Friend System
- Send friend requests to connected strangers
- Accept / Decline requests via modal
- Dedicated Friends Sidebar
- Unfriend functionality with real-time updates
- Persistent friend list using localStorage

---

### 💬 Real-Time Messaging & Media
- Low-latency messaging using Socket.io
- Message delivery indicators:
  - ✓ Sent
  - ✓✓ Delivered
  - 🔵 Seen
- Image & video file sharing
- Emoji picker for expressive chats

---

### 🎨 User Experience & UI
- Dark Glassmorphism UI
- Dynamic blur & translucent components
- Responsive 3-column layout:
  - Sidebar
  - Chat Area
  - Profile / Actions panel
- Avatar generation via DiceBear (Avataaars)
- Simple login & secure logout

---

## 🧠 Technical Architecture

### 🖥 Frontend
- React.js (Vite)
- Plain CSS with Glass UI utilities
- React Hooks for state management
- localStorage for persistence
- socket.io-client for real-time events

---

### ⚙ Backend
- Node.js
- Express.js
- Socket.io for WebSockets
- Room-based socket routing
- Multer for media uploads

---

### 💾 Data Storage Strategy
| Data Type | Storage |
|---------|--------|
| Active Users | In-memory (server) |
| Friends | localStorage (client) |
| Chat History | localStorage (client) |
| Media Files | Local file system |

---

## 🔐 Security & Privacy
- No database for chat logs
- Messages stored only on user device
- Friend connections require mutual consent
- Session-based socket lifecycle

---

## 🔄 User Flow

1. User logs in with Nickname, Age & Avatar
2. Enters dashboard
3. Finds a random stranger
4. Chats anonymously
5. Sends friend request
6. Mutual acceptance creates persistent friendship
7. Direct chat available across sessions

---
