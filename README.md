Chat17 💬

A simple, modern, real-time chat application designed for fast and private room-based conversations.

Chat17 allows users to create or join chat rooms using a unique room code and communicate in real time across mobile and desktop devices.

✨ Features

- 💬 Real-time messaging
- 🔐 Room-based conversations
- 🔑 Create and join rooms using room codes
- 📱 Responsive mobile design
- 💻 Desktop-friendly interface
- ☀️ Light mode
- 🔄 Automatic reconnection and room rejoin
- 🔔 Unread message count
- 🆕 New-message indicator
- 👁️ Message seen/read tracking
- 🟢 Online user presence
- ↩️ Reply to messages
- 👆 Swipe-to-reply on mobile
- 🗑️ Delete your own messages
- ✏️ Personal/favourite room names
- ⋮ Room actions menu
- 🗑️ Delete rooms
- 📷 QR-based room sharing
- 📱 Mobile bottom navigation
- 👤 Profile section
- 🎨 Clean responsive UI
- 🔒 Account/logout confirmation
- 🔎 SEO metadata

📱 Mobile Experience

Chat17 is optimized for mobile devices with a dedicated mobile interface.

The mobile interface includes:

- Chat navigation
- Home navigation
- Profile navigation
- Profile-based theme switching
- Dark and light themes
- Swipe-to-reply
- Mobile-friendly message composer
- Responsive room actions
- QR room sharing

💻 Desktop Experience

The desktop interface provides a wider chat layout with room navigation and user controls.

It includes:

- Room/chat sidebar
- Chat conversation area
- Room actions
- Room code access
- Personal room naming
- Room deletion
- Theme controls
- Logout/account controls

🔄 Real-Time Communication

Chat17 uses real-time communication so messages can be delivered between connected users without manually refreshing the page.

The application also handles reconnection and attempts to restore the user's room session after a connection interruption.

🏠 Chat Rooms

Users can create or join rooms using a room code.

Typical flow:

1. Enter your name.
2. Create a new room or join an existing room.
3. Share the room code or QR code.
4. Start chatting in real time.

↩️ Message Replies

Users can reply to specific messages.

On mobile devices, Chat17 also supports a swipe-to-reply interaction inspired by modern messaging applications.

🔔 Unread Messages

Chat17 keeps track of unread messages and displays an unread count when new messages arrive.

A new-message indicator helps users identify where new messages begin in the conversation.

👁️ Seen Messages

Messages support read/seen tracking so users can identify when messages have been viewed.

🟢 Online Presence

The application displays online presence information for users connected to a chat room.

📷 QR Room Sharing

Rooms can be shared using QR codes, making it easier for another user to join without manually entering the complete room code.

🗂️ Project Structure

Chat17/
├── index.js
└── public/
    ├── index.html
    ├── app.js
    ├── style.css
    └── chat17-logo.png

📁 File Description

File| Description
"index.js"| Node.js server and Socket.IO backend
"public/index.html"| Main Chat17 user interface
"public/app.js"| Client-side chat functionality
"public/style.css"| UI design and responsive styling
"public/chat17-logo.png"| Chat17 application logo

🛠️ Technologies

Chat17 is built as a web application using:

- HTML
- CSS
- JavaScript
- Node.js
- Express
- Socket.IO

🚀 Running Locally

1. Clone the repository

git clone https://github.com/subash-1701/chat17.git

2. Open the project

cd Chat17

3. Install dependencies

npm install

4. Start the application

node index.js

5. Open in your browser

http://localhost:3000

🌐 Deployment

Chat17 can be deployed to a Node.js-compatible hosting platform.

After deployment, users can access the application through the deployed URL and create or join chat rooms.

🔒 Privacy

Chat17 is designed around room-based conversations. Users communicate through specific chat rooms rather than a traditional global chat feed.

🎯 Project Objective

The objective of Chat17 is to provide a simple real-time communication platform where users can quickly create or join a private chat room and communicate across devices through a clean and responsive interface.

🔮 Future Improvements

Possible future improvements include:

- Persistent database storage
- User authentication
- Media and file sharing
- Push notifications
- Message search
- Improved presence synchronization
- Additional customization options

📄 License

This project is available for educational and personal use.

---

Chat17 — Simple. Real-time. Connected. 💬
