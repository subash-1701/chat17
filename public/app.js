"use strict";

/* ==========================================
   CHAT17 - FIXED CLIENT
========================================== */

const socket = io({
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000
});


/* ==========================================
   SAFE STORAGE
========================================== */

function readStorage(key, fallback = []) {
    try {
        const value = localStorage.getItem(key);

        if (!value) return fallback;

        const parsed = JSON.parse(value);

        return Array.isArray(parsed)
            ? parsed
            : fallback;

    } catch (error) {
        console.warn("Storage error:", key, error);
        return fallback;
    }
}


let username =
    localStorage.getItem("chat_username") || "";

let rooms =
    readStorage("chat_rooms");

let chats =
    readStorage("chat_list");

let currentRoom =
    localStorage.getItem("chat_current_room") || "";

let currentChat = null;


/* ==========================================
   NORMALIZE OLD DATA
========================================== */

rooms = rooms
    .filter(room => room && room.code)
    .map(room => ({
        code: String(room.code).toUpperCase(),
        name: room.name || `Room ${room.code}`
    }));


chats = chats
    .filter(chat => chat && chat.roomCode)
    .map(chat => ({
        roomCode:
            String(chat.roomCode).toUpperCase(),

        name:
            chat.name || `Room ${chat.roomCode}`,

        lastMessage:
            chat.lastMessage || "",

        time:
            chat.time || "",

        unread:
            Number(chat.unread) || 0
    }));


localStorage.setItem(
    "chat_rooms",
    JSON.stringify(rooms)
);

localStorage.setItem(
    "chat_list",
    JSON.stringify(chats)
);


/* ==========================================
   ELEMENTS
========================================== */

const loginScreen =
    document.getElementById("loginScreen");

const app =
    document.getElementById("app");

const sidebar =
    document.getElementById("sidebar");

const messagePanel =
    document.getElementById("messagePanel");

const welcomePanel =
    document.getElementById("welcomePanel");

const conversation =
    document.getElementById("conversation");

const messages =
    document.getElementById("messages");

const chatList =
    document.getElementById("chatList");

const searchInput =
    document.getElementById("searchInput");


/* ==========================================
   START
========================================== */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        if (username) {
            showApp();
            updateUserUI();
            renderChats();
            reconnectPreviousRoom();
        }

    }
);


/* ==========================================
   LOGIN
========================================== */

const startBtn =
    document.getElementById("startBtn");

if (startBtn) {

    startBtn.addEventListener(
        "click",
        startLogin
    );

}


const loginName =
    document.getElementById("loginName");

if (loginName) {

    loginName.addEventListener(
        "keydown",
        event => {

            if (event.key === "Enter") {
                startLogin();
            }

        }
    );

}


function startLogin() {

    const input =
        document.getElementById("loginName");

    const error =
        document.getElementById("loginError");

    const name =
        input.value.trim();

    if (!name) {

        error.textContent =
            "Please enter your name.";

        return;

    }

    if (name.length > 30) {

        error.textContent =
            "Name must be 30 characters or less.";

        return;

    }

    username = name;

    localStorage.setItem(
        "chat_username",
        username
    );

    error.textContent = "";

    showApp();

    updateUserUI();

    renderChats();

    reconnectPreviousRoom();
}


/* ==========================================
   SHOW APP
========================================== */

function showApp() {

    if (loginScreen) {

        loginScreen.classList.add(
            "hidden"
        );

    }

    if (app) {

        app.classList.remove(
            "hidden"
        );

    }

}


/* ==========================================
   USER UI
========================================== */

function updateUserUI() {

    const letter =
        username
            ? username.charAt(0).toUpperCase()
            : "U";


    const sidebarUsername =
        document.getElementById(
            "sidebarUsername"
        );

    const sidebarAvatar =
        document.getElementById(
            "sidebarAvatar"
        );

    const profileName =
        document.getElementById(
            "profileName"
        );

    const profileAvatar =
        document.getElementById(
            "profileAvatar"
        );

    const profileChats =
        document.getElementById(
            "profileChats"
        );

    const profileRooms =
        document.getElementById(
            "profileRooms"
        );


    if (sidebarUsername)
        sidebarUsername.textContent =
            username || "User";

    if (sidebarAvatar)
        sidebarAvatar.textContent =
            letter;

    if (profileName)
        profileName.textContent =
            username || "User";

    if (profileAvatar)
        profileAvatar.textContent =
            letter;

    if (profileChats)
        profileChats.textContent =
            chats.length;

    if (profileRooms)
        profileRooms.textContent =
            rooms.length;

}


/* ==========================================
   SOCKET CONNECTION
========================================== */

socket.on("connect", () => {

    console.log(
        "Chat17 connected:",
        socket.id
    );


    if (currentRoom) {

        rejoinRoom(
            currentRoom
        );

    }

});


socket.on("disconnect", () => {

    console.log(
        "Chat17 disconnected"
    );


    if (currentRoom) {

        setStatus(
            "Reconnecting..."
        );

    }

});


socket.on(
    "connect_error",
    error => {

        console.error(
            "Socket error:",
            error.message
        );

    }
);


/* ==========================================
   CREATE ROOM BUTTON
========================================== */

const addChatBtn =
    document.getElementById(
        "addChatBtn"
    );

if (addChatBtn) {

    addChatBtn.addEventListener(
        "click",
        openModal
    );

}


const welcomeCreateBtn =
    document.getElementById(
        "welcomeCreateBtn"
    );

if (welcomeCreateBtn) {

    welcomeCreateBtn.addEventListener(
        "click",
        createRoom
    );

}


const homeCreateBtn =
    document.getElementById(
        "homeCreateBtn"
    );

if (homeCreateBtn) {

    homeCreateBtn.addEventListener(
        "click",
        createRoom
    );

}


const createModalBtn =
    document.getElementById(
        "createModalBtn"
    );

if (createModalBtn) {

    createModalBtn.addEventListener(
        "click",
        createRoom
    );

}


/* ==========================================
   CREATE ROOM
========================================== */

function createRoom() {

    if (!username) {

        alert(
            "Please enter your name first."
        );

        return;

    }


    if (!socket.connected) {

        alert(
            "Connecting to server. Please wait..."
        );

        return;

    }


    socket.emit(
        "create-room",
        username,
        result => {

            if (!result || !result.success) {

                alert(
                    result?.message ||
                    "Unable to create room."
                );

                return;

            }


            const room = {

                code:
                    String(
                        result.roomCode
                    ).toUpperCase(),

                name:
                    result.roomName ||
                    `Room ${result.roomCode}`

            };


            saveRoom(room);

            addChat(room);


            closeModal();


            showRoomCodePopup(
                room.code
            );


            openConversation(
                room.code,
                room.name
            );


            messages.innerHTML = "";


            if (
                Array.isArray(
                    result.messages
                )
            ) {

                result.messages.forEach(
                    addMessage
                );

            }

        }
    );

}


/* ==========================================
   SAVE ROOM
========================================== */

function saveRoom(room) {

    if (!room || !room.code) {
        return;
    }


    const code =
        String(
            room.code
        ).toUpperCase();


    const cleanRoom = {

        code,

        name:
            room.name ||
            `Room ${code}`

    };


    const index =
        rooms.findIndex(
            item =>
                item.code === code
        );


    if (index === -1) {

        rooms.unshift(
            cleanRoom
        );

    } else {

        rooms[index] = {

            ...rooms[index],
            ...cleanRoom

        };

    }


    localStorage.setItem(
        "chat_rooms",
        JSON.stringify(rooms)
    );


    updateUserUI();

}


/* ==========================================
   ADD CHAT
========================================== */

function addChat(room) {

    if (!room || !room.code) {
        return;
    }


    const code =
        String(
            room.code
        ).toUpperCase();


    const existing =
        chats.find(
            chat =>
                chat.roomCode === code
        );


    if (existing) {

        existing.name =
            room.name ||
            existing.name ||
            `Room ${code}`;

    } else {

        chats.unshift({

            roomCode:
                code,

            name:
                room.name ||
                `Room ${code}`,

            lastMessage:
                "",

            time:
                "",

            unread:
                0

        });

    }


    saveChats();

    renderChats();

    updateUserUI();

}


/* ==========================================
   JOIN ROOM
========================================== */

const joinModalBtn =
    document.getElementById(
        "joinModalBtn"
    );

if (joinModalBtn) {

    joinModalBtn.addEventListener(
        "click",
        showJoinBox
    );

}


const homeJoinBtn =
    document.getElementById(
        "homeJoinBtn"
    );

if (homeJoinBtn) {

    homeJoinBtn.addEventListener(
        "click",
        () => {

            openModal();

            showJoinBox();

        }
    );

}


function showJoinBox() {

    const box =
        document.getElementById(
            "joinBox"
        );

    const input =
        document.getElementById(
            "roomCodeInput"
        );


    if (box) {

        box.classList.remove(
            "hidden"
        );

    }


    if (input) {

        input.focus();

    }

}


/* ==========================================
   CONFIRM JOIN
========================================== */

const confirmJoinBtn =
    document.getElementById(
        "confirmJoinBtn"
    );

if (confirmJoinBtn) {

    confirmJoinBtn.addEventListener(
        "click",
        joinRoom
    );

}


const roomCodeInput =
    document.getElementById(
        "roomCodeInput"
    );

if (roomCodeInput) {

    roomCodeInput.addEventListener(
        "input",
        () => {

            roomCodeInput.value =
                roomCodeInput.value
                    .toUpperCase()
                    .replace(
                        /[^A-Z0-9]/g,
                        ""
                    )
                    .slice(0, 6);

        }
    );


    roomCodeInput.addEventListener(
        "keydown",
        event => {

            if (event.key === "Enter") {

                event.preventDefault();

                joinRoom();

            }

        }
    );

}


/* ==========================================
   JOIN ROOM
========================================== */

function joinRoom() {

    const input =
        document.getElementById(
            "roomCodeInput"
        );


    const roomCode =
        input.value
            .trim()
            .toUpperCase();


    if (roomCode.length !== 6) {

        alert(
            "Enter a valid 6-character room code."
        );

        return;

    }


    if (!socket.connected) {

        alert(
            "Connecting to server. Please wait..."
        );

        return;

    }


    performJoin(
        roomCode
    );

}


function performJoin(roomCode) {

    socket.emit(
        "join-room",
        {
            username,
            roomCode
        },
        result => {

            if (!result || !result.success) {

                alert(
                    result?.message ||
                    "Unable to join room."
                );

                return;

            }


            const room = {

                code:
                    result.roomCode,

                name:
                    result.roomName ||
                    `Room ${result.roomCode}`

            };


            saveRoom(room);

            addChat(room);


            closeModal();


            openConversation(
                room.code,
                room.name
            );


            messages.innerHTML = "";


            if (
                Array.isArray(
                    result.messages
                )
            ) {

                result.messages.forEach(
                    addMessage
                );

            }


            markChatRead(
                room.code
            );

        }
    );

}


/* ==========================================
   REJOIN AFTER RECONNECT
========================================== */

function rejoinRoom(roomCode) {

    if (!socket.connected) {
        return;
    }


    if (!username || !roomCode) {
        return;
    }


    socket.emit(
        "rejoin-room",
        {
            username,
            roomCode
        },
        result => {

            if (!result || !result.success) {

                // Saved room no longer exists
                // (e.g. server restarted). Clear it
                // so we don't keep retrying.

                currentRoom = "";

                localStorage.removeItem(
                    "chat_current_room"
                );

                return;

            }


            openConversation(
                result.roomCode,
                result.roomName
            );


            messages.innerHTML = "";


            if (
                Array.isArray(
                    result.messages
                )
            ) {

                result.messages.forEach(
                    addMessage
                );

            }

        }
    );

}


/* ==========================================
   RECONNECT PREVIOUS ROOM
========================================== */

function reconnectPreviousRoom() {

    if (!username) return;

    if (!socket.connected) return;

    if (!currentRoom) return;


    rejoinRoom(
        currentRoom
    );

}


/* ==========================================
   OPEN CONVERSATION
========================================== */

function openConversation(
    roomCode,
    roomName
) {

    // On mobile the message panel may have been hidden by the
    // bottom navigation. Always unhide it when a conversation opens.
    if (messagePanel) {
        messagePanel.classList.remove("hidden");
    }

    currentRoom =
        String(
            roomCode
        ).toUpperCase();


    localStorage.setItem(
        "chat_current_room",
        currentRoom
    );


    currentChat =
        chats.find(
            chat =>
                chat.roomCode ===
                currentRoom
        ) || null;


    // Make absolutely sure
    // the chat exists.

    addChat({

        code:
            currentRoom,

        name:
            roomName ||
            `Room ${currentRoom}`

    });


    currentChat =
        chats.find(
            chat =>
                chat.roomCode ===
                currentRoom
        ) || null;


    const nameElement =
        document.getElementById(
            "conversationName"
        );

    const avatarElement =
        document.getElementById(
            "conversationAvatar"
        );


    if (nameElement) {

        nameElement.textContent =
            roomName ||
            `Room ${currentRoom}`;

    }


    if (avatarElement) {

        avatarElement.textContent =
            (
                roomName ||
                "R"
            )
                .charAt(0)
                .toUpperCase();

    }


    setStatus(
        socket.connected
            ? "Connected"
            : "Connecting..."
    );


    welcomePanel.classList.add(
        "hidden"
    );


    conversation.classList.remove(
        "hidden"
    );


    if (
        window.innerWidth <= 767
    ) {

        messagePanel.classList.add(
            "mobile-open"
        );

    }


    markChatRead(
        currentRoom
    );


    renderChats();


    const input =
        document.getElementById(
            "messageInput"
        );


    if (input && window.innerWidth <= 767) {

        // WhatsApp-style mobile chat: open the keyboard immediately and
        // keep the composer above the keyboard while the conversation stays open.
        setTimeout(() => {
            input.focus({ preventScroll: true });
            scrollMessagesToBottom();
            syncMobileKeyboardHeight();
        }, 120);

    } else if (input) {

        setTimeout(() => input.focus(), 50);

    }

    syncMobileKeyboardHeight();

}


/* ==========================================
   OPEN CHAT FROM LIST
========================================== */

function openSavedChat(chat) {

    if (!chat || !chat.roomCode) {
        return;
    }


    const roomCode =
        String(
            chat.roomCode
        ).toUpperCase();


    // Do not block the mobile UI while Socket.IO is reconnecting.
    // Save the selected room and let the connect handler rejoin it.
    if (!socket.connected) {

        currentRoom = roomCode;

        localStorage.setItem(
            "chat_current_room",
            currentRoom
        );

        openConversation(
            currentRoom,
            chat.name || `Room ${currentRoom}`
        );

        setStatus("Reconnecting...");

        return;
    }


    currentRoom =
        roomCode;


    markChatRead(
        roomCode
    );


    socket.emit(
        "join-room",
        {
            username,
            roomCode
        },
        result => {

            if (!result || !result.success) {

                alert(
                    result?.message ||
                    "This room is no longer available."
                );

                return;

            }


            openConversation(
                result.roomCode,
                result.roomName
            );


            messages.innerHTML = "";


            if (
                Array.isArray(
                    result.messages
                )
            ) {

                result.messages.forEach(
                    addMessage
                );

            }

        }
    );

}


/* ==========================================
   RENDER CHAT LIST
========================================== */

function renderChats() {

    if (!chatList) {
        return;
    }


    const query =
        searchInput
            ? searchInput.value
                .trim()
                .toLowerCase()
            : "";


    // Normalize again before rendering.
    // This prevents old broken localStorage
    // data from crashing the UI.

    chats =
        chats
            .filter(
                chat =>
                    chat &&
                    chat.roomCode
            )
            .map(
                chat => ({

                    roomCode:
                        String(
                            chat.roomCode
                        ).toUpperCase(),

                    name:
                        String(
                            chat.name ||
                            `Room ${chat.roomCode}`
                        ),

                    lastMessage:
                        String(
                            chat.lastMessage ||
                            ""
                        ),

                    time:
                        String(
                            chat.time ||
                            ""
                        ),

                    unread:
                        Number(
                            chat.unread || 0
                        )

                })
            );


    const filtered =
        chats.filter(
            chat => {

                const name =
                    chat.name
                        .toLowerCase();

                const last =
                    chat.lastMessage
                        .toLowerCase();

                return (
                    !query ||
                    name.includes(query) ||
                    last.includes(query)
                );

            }
        );


    if (!filtered.length) {

        chatList.innerHTML = `

            <div class="empty-chat">

                <div>💬</div>

                <p>
                    No conversations yet
                </p>

                <small>
                    Create or join a room to start chatting.
                </small>

            </div>

        `;

        return;

    }


    chatList.innerHTML = "";


    filtered.forEach(
        chat => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "chat-item";


            if (
                chat.roomCode ===
                currentRoom
            ) {

                item.classList.add(
                    "selected"
                );

            }


            // Avatar

            const avatar =
                document.createElement(
                    "div"
                );

            avatar.className =
                "chat-avatar";

            avatar.textContent =
                chat.name
                    .charAt(0)
                    .toUpperCase();


            // Content

            const content =
                document.createElement(
                    "div"
                );

            content.className =
                "chat-content";


            // Top

            const top =
                document.createElement(
                    "div"
                );

            top.className =
                "chat-top";


            const name =
                document.createElement(
                    "strong"
                );

            name.textContent =
                chat.name;


            const time =
                document.createElement(
                    "span"
                );

            time.className =
                "chat-time";

            time.textContent =
                chat.time || "";


            top.appendChild(name);

            top.appendChild(time);


            // Preview

            const preview =
                document.createElement(
                    "p"
                );

            preview.className =
                "chat-preview";

            preview.textContent =
                chat.lastMessage ||
                "Start a conversation";


            content.appendChild(top);

            content.appendChild(
                preview
            );


            item.appendChild(
                avatar
            );

            item.appendChild(
                content
            );


            // Unread

            if (
                chat.unread > 0
            ) {

                const unread =
                    document.createElement(
                        "span"
                    );

                unread.className =
                    "unread";

                unread.textContent =
                    chat.unread > 9
                        ? "9+"
                        : chat.unread;


                item.appendChild(
                    unread
                );

            }


            item.addEventListener(
                "click",
                () => {

                    openSavedChat(
                        chat
                    );

                }
            );


            chatList.appendChild(
                item
            );

        }
    );


    localStorage.setItem(
        "chat_list",
        JSON.stringify(chats)
    );

}


/* ==========================================
   SEARCH
========================================== */

if (searchInput) {

    searchInput.addEventListener(
        "input",
        renderChats
    );

}


/* ==========================================
   SEND MESSAGE
========================================== */

const messageForm =
    document.getElementById(
        "messageForm"
    );


if (messageForm) {

    messageForm.addEventListener(
        "submit",
        event => {

            event.preventDefault();


            const input =
                document.getElementById(
                    "messageInput"
                );


            const message =
                input.value.trim();


            if (!message) {
                return;
            }


            if (!currentRoom) {

                alert(
                    "Select a conversation first."
                );

                return;

            }


            if (!socket.connected) {

                alert(
                    "Not connected to server."
                );

                return;

            }


            socket.emit(
                "send-message",
                message
            );


            input.value = "";

            input.focus();

        }
    );

}


/* ==========================================
   RECEIVE MESSAGE
========================================== */

socket.on(
    "receive-message",
    data => {

        if (!data || !data.roomCode) {
            return;
        }


        const roomCode =
            String(
                data.roomCode
            ).toUpperCase();


        // Only show the message if it
        // belongs to the open room.

        if (
            roomCode === currentRoom
        ) {

            addMessage(
                data
            );

        }


        updateChatFromMessage(
            data
        );

    }
);


/* ==========================================
   ADD MESSAGE
========================================== */

function addMessage(data) {

    if (!data || !messages) {
        return;
    }


    const element =
        document.createElement(
            "div"
        );


    element.className =
        "message";


    // socket.id is temporary and changes whenever the phone reconnects.
    // Use the message username as the fallback so previously loaded messages
    // keep the correct left/right alignment after closing and reopening chat.
    const myName = String(username || "").trim().toLowerCase();
    const senderName = String(
        data.senderUsername || data.username || ""
    ).trim().toLowerCase();

    const isOwnMessage =
        data.senderId === socket.id ||
        (!!myName && !!senderName && myName === senderName);

    if (isOwnMessage) {
        element.classList.add("own");
    }


    const name =
        document.createElement(
            "div"
        );

    name.className =
        "message-name";

    name.textContent =
        data.username ||
        "User";


    const text =
        document.createElement(
            "div"
        );

    text.className =
        "message-text";

    text.textContent =
        data.message ||
        "";


    const time =
        document.createElement(
            "span"
        );

    time.className =
        "message-time";

    time.textContent =
        formatTime(
            data.time
        );


    element.appendChild(name);

    element.appendChild(text);

    element.appendChild(time);


    messages.appendChild(
        element
    );


    messages.scrollTop =
        messages.scrollHeight;

}


/* ==========================================
   SYSTEM MESSAGE
========================================== */

socket.on(
    "system-message",
    data => {

        if (!data) return;

        if (
            data.roomCode &&
            String(
                data.roomCode
            ).toUpperCase() !==
            currentRoom
        ) {

            return;

        }


        if (!messages) return;


        const element =
            document.createElement(
                "div"
            );


        element.className =
            "system-message";


        element.textContent =
            data.text || "";


        messages.appendChild(
            element
        );


        messages.scrollTop =
            messages.scrollHeight;

    }
);


/* ==========================================
   USERS
========================================== */

socket.on(
    "users-update",
    users => {

        if (!Array.isArray(users)) {
            users = [];
        }


        if (!currentRoom) {
            return;
        }


        setStatus(
            users.length === 1
                ? "1 person online"
                : `${users.length} people online`
        );

    }
);


/* ==========================================
   STATUS
========================================== */

function setStatus(text) {

    const element =
        document.getElementById(
            "conversationStatus"
        );


    if (element) {

        element.textContent =
            text;

    }

}


/* ==========================================
   UPDATE CHAT FROM MESSAGE
========================================== */

function updateChatFromMessage(data) {

    if (!data || !data.roomCode) {
        return;
    }


    const roomCode =
        String(
            data.roomCode
        ).toUpperCase();


    let room =
        rooms.find(
            item =>
                item.code === roomCode
        );


    if (!room) {

        room = {

            code:
                roomCode,

            name:
                `Room ${roomCode}`

        };


        saveRoom(room);

    }


    let chat =
        chats.find(
            item =>
                item.roomCode === roomCode
        );


    if (!chat) {

        chat = {

            roomCode,

            name:
                room.name,

            lastMessage:
                "",

            time:
                "",

            unread:
                0

        };

    }


    chat.name =
        room.name;


    chat.lastMessage =
        `${data.username || "User"}: ${data.message || ""}`;


    chat.time =
        formatTime(
            data.time
        );


    // Message from another person while
    // another room is open.

    if (
        roomCode !== currentRoom &&
        data.senderId !== socket.id
    ) {

        chat.unread =
            Number(
                chat.unread || 0
            ) + 1;

    }


    chats =
        chats.filter(
            item =>
                item.roomCode !== roomCode
        );


    chats.unshift(
        chat
    );


    saveChats();

    renderChats();

    updateUserUI();

}


/* ==========================================
   MARK READ
========================================== */

function markChatRead(roomCode) {

    const code =
        String(
            roomCode
        ).toUpperCase();


    const chat =
        chats.find(
            item =>
                item.roomCode === code
        );


    if (!chat) {
        return;
    }


    chat.unread = 0;


    saveChats();

    renderChats();

}


/* ==========================================
   SAVE CHATS
========================================== */

function saveChats() {

    localStorage.setItem(
        "chat_list",
        JSON.stringify(chats)
    );

}


/* ==========================================
   TIME
========================================== */

function formatTime(value) {

    if (!value) {
        return "";
    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "";

    }


    return date.toLocaleTimeString(
        [],
        {
            hour: "2-digit",
            minute: "2-digit"
        }
    );

}


/* ==========================================
   MOBILE KEYBOARD / WHATSAPP-STYLE COMPOSER
========================================== */

function syncMobileKeyboardHeight() {
    if (window.innerWidth > 767) return;

    const viewport = window.visualViewport;
    if (!viewport) return;

    const keyboardOffset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop
    );

    document.documentElement.style.setProperty(
        "--mobile-keyboard-offset",
        `${keyboardOffset}px`
    );

    if (currentRoom) {
        requestAnimationFrame(() => {
            scrollMessagesToBottom();
        });
    }
}

function scrollMessagesToBottom() {
    if (!messages) return;
    messages.scrollTop = messages.scrollHeight;
}

if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncMobileKeyboardHeight);
    window.visualViewport.addEventListener("scroll", syncMobileKeyboardHeight);
}

window.addEventListener("resize", () => {
    if (window.innerWidth > 767) {
        document.documentElement.style.removeProperty("--mobile-keyboard-offset");
    } else {
        syncMobileKeyboardHeight();
    }
});

if (messagePanel) {
    messagePanel.addEventListener("click", event => {
        if (window.innerWidth <= 767 && currentRoom &&
            !event.target.closest(".conversation-header") &&
            !event.target.closest(".message-form")) {
            const input = document.getElementById("messageInput");
            if (input) input.focus({ preventScroll: true });
        }
    });
}

/* ==========================================
   MOBILE BACK
========================================== */

const mobileBackBtn =
    document.getElementById(
        "mobileBackBtn"
    );


if (mobileBackBtn) {

    mobileBackBtn.addEventListener(
        "click",
        () => {

            messagePanel.classList.remove(
                "mobile-open"
            );

            // Keep the panel hidden until another chat is selected.
            messagePanel.classList.add("hidden");
            document.documentElement.style.removeProperty("--mobile-keyboard-offset");

            currentRoom = "";

            currentChat = null;

            localStorage.removeItem(
                "chat_current_room"
            );


            conversation.classList.add(
                "hidden"
            );


            welcomePanel.classList.remove(
                "hidden"
            );


            renderChats();

        }
    );

}


/* ==========================================
   MODAL
========================================== */

function openModal() {

    const modal =
        document.getElementById(
            "modal"
        );


    if (modal) {

        modal.classList.remove(
            "hidden"
        );

    }

}


function closeModal() {

    const modal =
        document.getElementById(
            "modal"
        );

    const joinBox =
        document.getElementById(
            "joinBox"
        );

    const input =
        document.getElementById(
            "roomCodeInput"
        );


    if (modal) {

        modal.classList.add(
            "hidden"
        );

    }


    if (joinBox) {

        joinBox.classList.add(
            "hidden"
        );

    }


    if (input) {

        input.value = "";

    }

}


const closeModalBtn =
    document.getElementById(
        "closeModal"
    );


if (closeModalBtn) {

    closeModalBtn.addEventListener(
        "click",
        closeModal
    );

}


/* ==========================================
   CLOSE MODAL OUTSIDE
========================================== */

const modal =
    document.getElementById(
        "modal"
    );


if (modal) {

    modal.addEventListener(
        "click",
        event => {

            if (
                event.target === modal
            ) {

                closeModal();

            }

        }
    );

}


/* ==========================================
   ROOM CODE POPUP
========================================== */

function showRoomCodePopup(code) {

    const popup =
        document.getElementById(
            "roomCodePopup"
        );

    const codeElement =
        document.getElementById(
            "createdRoomCode"
        );


    if (codeElement) {

        codeElement.textContent =
            code;

    }


    if (popup) {

        popup.classList.remove(
            "hidden"
        );

    }

}


const closeRoomPopup =
    document.getElementById(
        "closeRoomPopup"
    );


if (closeRoomPopup) {

    closeRoomPopup.addEventListener(
        "click",
        () => {

            document
                .getElementById(
                    "roomCodePopup"
                )
                .classList.add(
                    "hidden"
                );

        }
    );

}


const continueRoomBtn =
    document.getElementById(
        "continueRoomBtn"
    );


if (continueRoomBtn) {

    continueRoomBtn.addEventListener(
        "click",
        () => {

            document
                .getElementById(
                    "roomCodePopup"
                )
                .classList.add(
                    "hidden"
                );

        }
    );

}


/* ==========================================
   COPY ROOM CODE
========================================== */

const copyRoomCode =
    document.getElementById(
        "copyRoomCode"
    );


if (copyRoomCode) {

    copyRoomCode.addEventListener(
        "click",
        async () => {

            const code =
                document.getElementById(
                    "createdRoomCode"
                ).textContent;


            try {

                await navigator.clipboard.writeText(
                    code
                );


                copyRoomCode.textContent =
                    "Copied ✓";


                setTimeout(
                    () => {

                        copyRoomCode.textContent =
                            "Copy Room Code";

                    },
                    1500
                );

            } catch {

                alert(
                    `Room Code: ${code}`
                );

            }

        }
    );

}


/* ==========================================
   PROFILE
========================================== */

const sidebarProfileBtn =
    document.getElementById(
        "sidebarProfileBtn"
    );


if (sidebarProfileBtn) {

    sidebarProfileBtn.addEventListener(
        "click",
        () => {

            if (
                window.innerWidth <= 767
            ) {

                showMobilePage(
                    "profile"
                );

            }

        }
    );

}


/* ==========================================
   MOBILE NAV
========================================== */

document
    .querySelectorAll(".nav-button")
    .forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const page =
                        button.dataset.page;


                    document
                        .querySelectorAll(
                            ".nav-button"
                        )
                        .forEach(
                            btn =>
                                btn.classList.remove(
                                    "active"
                                )
                        );


                    button.classList.add(
                        "active"
                    );


                    showMobilePage(
                        page
                    );

                }
            );

        }
    );


function showMobilePage(page) {

    if (
        window.innerWidth > 767
    ) {

        return;

    }


    sidebar.classList.add(
        "hidden"
    );


    messagePanel.classList.add(
        "hidden"
    );


    const homePage =
        document.getElementById(
            "homePage"
        );

    const profilePage =
        document.getElementById(
            "profilePage"
        );


    if (homePage) {

        homePage.classList.add(
            "hidden"
        );

    }


    if (profilePage) {

        profilePage.classList.add(
            "hidden"
        );

    }


    if (page === "chat") {

        sidebar.classList.remove(
            "hidden"
        );

        // A selected chat should remain open when returning to the Chat tab.
        if (currentRoom && conversation && !conversation.classList.contains("hidden")) {
            messagePanel.classList.remove("hidden");
            messagePanel.classList.add("mobile-open");
        }

    }


    if (page === "home") {

        homePage.classList.remove(
            "hidden"
        );

    }


    if (page === "profile") {

        profilePage.classList.remove(
            "hidden"
        );

    }

}


/* ==========================================
   LOGOUT
========================================== */

const logoutButtons = [
    document.getElementById("logoutBtn"),
    document.getElementById("desktopLogoutBtn")
].filter(Boolean);


function performLogout() {

    const confirmed = window.confirm("Are you sure you want to log out?");

    if (!confirmed) {
        return;
    }

    const roomsToClear =
        Array.isArray(rooms)
            ? rooms.map(room => room.code).filter(Boolean)
            : [];

    const finishLogout = () => {

        // Remove ALL Chat17 browser data for this account.
        localStorage.removeItem("chat_username");
        localStorage.removeItem("chat_current_room");
        localStorage.removeItem("chat_rooms");
        localStorage.removeItem("chat_list");

        username = "";
        currentRoom = "";
        currentChat = null;
        rooms = [];
        chats = [];

        location.reload();

    };

    // Ask the server to remove this user's messages from their rooms
    // before the browser data is cleared.
    if (socket && socket.connected) {

        let completed = false;

        const done = () => {
            if (completed) return;
            completed = true;
            finishLogout();
        };

        socket.emit(
            "logout",
            {
                username,
                roomCodes: roomsToClear
            },
            done
        );

        // Never leave logout stuck if the connection is unavailable.
        setTimeout(done, 1000);

    } else {

        finishLogout();

    }

}


logoutButtons.forEach(button => {

    button.addEventListener(
        "click",
        performLogout
    );

});


/* ==========================================
   RESIZE
========================================== */

window.addEventListener(
    "resize",
    () => {

        if (
            window.innerWidth > 767
        ) {

            sidebar.classList.remove(
                "hidden"
            );


            messagePanel.classList.remove(
                "hidden"
            );


            messagePanel.classList.remove(
                "mobile-open"
            );


            const homePage =
                document.getElementById(
                    "homePage"
                );

            const profilePage =
                document.getElementById(
                    "profilePage"
                );


            if (homePage) {

                homePage.classList.add(
                    "hidden"
                );

            }


            if (profilePage) {

                profilePage.classList.add(
                    "hidden"
                );

            }

        }

    }
);


/* ==========================================
   FIX OLD BROKEN CHAT LIST
========================================== */

function repairChatList() {

    if (!chats.length && rooms.length) {

        chats =
            rooms.map(
                room => ({

                    roomCode:
                        room.code,

                    name:
                        room.name,

                    lastMessage:
                        "",

                    time:
                        "",

                    unread:
                        0

                })
            );


        saveChats();

    }


    renderChats();

    updateUserUI();

}


repairChatList();