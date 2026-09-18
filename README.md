# Chat17

Chat17 is a real-time web chat application that allows users to communicate instantly through a simple and modern interface.

## 🚀 Features

* 💬 Real-time messaging
* 👤 User-to-user chat
* ⌨️ Real-time typing indicator
* 🔗 Clickable links in messages
* 🗑️ Delete messages
* 📱 Responsive design for mobile and desktop
* ⚡ Fast real-time communication using Socket.IO
* 🎨 Modern chat interface
* 🌐 Browser-based application

## 🛠️ Technologies Used

### Frontend

* HTML5
* CSS3
* JavaScript

### Backend

* Node.js
* Express.js
* Socket.IO

## 📁 Project Structure

```text
Chat17/
├── public/
│   ├── images/
│   │   └── chat17-logo.png
│   ├── app.js
│   ├── index.html
│   ├── manifest.json
│   └── style.css
│
├── index.js
├── package.json
└── README.md
```

## 📦 Installation

### 1. Clone the project

```bash
git clone https://github.com/subash-1701/chat17.git
cd chat17
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the server

```bash
npm start
```

The application will start on:

```text
http://localhost:3000
```

Open the address in your browser.

## ⚙️ Development

You can also run the project using:

```bash
npm run dev
```

## 💬 How It Works

The basic message flow is:

```text
User A
   │
   │ Sends message
   ▼
Chat17 Server
   │
   │ Socket.IO
   ▼
User B
   │
   │ Receives message
   ▼
Chat Interface
```

When a user sends a message, the frontend sends it to the Node.js server through Socket.IO. The server then delivers the message to the appropriate connected user.

## ⌨️ Typing Indicator

When a user starts typing:

```text
User A
   │
   │ Typing...
   ▼
Chat17 Server
   │
   ▼
User B
   │
   ▼
"typing..." indicator
```

The typing status is transmitted in real time using Socket.IO.

## 🔗 Link Messages

URLs detected in messages can be displayed as clickable links.

Example:

```text
https://example.com
```

The user can click the link to open it.

## 🗑️ Message Deletion

Users can delete messages from the conversation. Deleted messages should also be removed from the chat state so they don't incorrectly appear when reopening the conversation.

## 📱 Responsive Design

Chat17 is designed to work across:

* 📱 Mobile phones
* 💻 Laptops
* 🖥️ Desktop computers
* 📲 Tablets

## 🔧 Requirements

Make sure you have installed:

* Node.js 18 or newer
* npm

Check your versions:

```bash
node -v
npm -v
```

## 📜 Available Commands

| Command       | Description                             |
| ------------- | --------------------------------------- |
| `npm install` | Install project dependencies            |
| `npm start`   | Start the server                        |
| `npm run dev` | Run the application in development mode |

## 🔐 Security

For production deployment, additional security measures should be added, such as:

* User authentication
* Input validation
* Rate limiting
* Secure WebSocket configuration
* HTTPS
* Proper session management

## 🌐 Production

Before deploying Chat17 to production:

1. Install dependencies.
2. Configure environment variables.
3. Configure the production server.
4. Enable HTTPS.
5. Add authentication and authorization.
6. Use a persistent database for messages and users.

## 📄 License

This project is licensed under the MIT License.

## 👨‍💻 Author

**Subash S**

---

⭐ If you like Chat17, consider giving the project a star on GitHub.
