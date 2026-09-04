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

let replyingTo = null;
let swipeState = null;

function getPersonalRoomNames() {
    try {
        const value = JSON.parse(localStorage.getItem("chat_personal_room_names") || "{}");
        return value && typeof value === "object" ? value : {};
    } catch (_) {
        return {};
    }
}

function getPersonalRoomName(code) {
    const names = getPersonalRoomNames();
    return names[String(code || "").toUpperCase()] || "";
}

function setPersonalRoomName(code, name) {
    const key = String(code || "").toUpperCase();
    const names = getPersonalRoomNames();
    names[key] = name;
    localStorage.setItem("chat_personal_room_names", JSON.stringify(names));
}


/* ==========================================
   NORMALIZE OLD DATA
========================================== */

rooms = rooms
    .filter(room => room && room.code)
    .map(room => ({
        code: String(room.code).toUpperCase(),
        name: getPersonalRoomName(room.code) || room.name || `Room ${room.code}`,
        owner: room.owner || ""
    }));


chats = chats
    .filter(chat => chat && chat.roomCode)
    .map(chat => ({
        roomCode:
            String(chat.roomCode).toUpperCase(),

        name:
            getPersonalRoomName(chat.roomCode) || chat.name || `Room ${chat.roomCode}`,

        owner:
            chat.owner ||
            rooms.find(room => room.code === String(chat.roomCode).toUpperCase())?.owner ||
            "",

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
   SYNC UNREAD COUNTS
   Re-check every saved room whenever the browser
   reconnects, so badges survive disconnects/reloads.
========================================== */
function syncUnreadCounts() {
    if (!socket.connected || !username) return;

    const roomCodes = [...new Set(
        chats
            .map(chat => String(chat.roomCode || "").toUpperCase())
            .filter(Boolean)
    )];

    if (!roomCodes.length) return;

    socket.emit(
        "sync-unread-counts",
        { username, roomCodes },
        result => {
            if (!result || !result.success || !result.counts) return;

            let changed = false;

            chats.forEach(chat => {
                const code = String(chat.roomCode || "").toUpperCase();
                if (!Object.prototype.hasOwnProperty.call(result.counts, code)) return;

                const count = Math.max(0, Number(result.counts[code]) || 0);
                if (Number(chat.unread || 0) !== count) {
                    chat.unread = count;
                    changed = true;
                }
            });

            if (changed) {
                saveChats();
                renderChats();
            }
        }
    );
}

/* ==========================================
   SOCKET CONNECTION
========================================== */

socket.on("connect", () => {

    console.log(
        "Chat17 connected:",
        socket.id
    );


    // First refresh all saved chat badges from the server. This is what
    // restores unread counts after a disconnect or reopening the website.
    syncUnreadCounts();

    if (currentRoom) {

        rejoinRoom(
            currentRoom
        );

        // Re-send the read state after reconnect so receipts continue to work
        // even after a temporary disconnect.
        setTimeout(() => markRoomMessagesSeen(currentRoom), 100);

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

let pendingCreatedRoom = null;
let pendingCreatedMessages = [];

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
                    `Room ${result.roomCode}`,

                owner:
                    result.owner || username

            };


            saveRoom(room);

            addChat(room);

            if (typeof result.unreadCount === "number") {
                const chat = chats.find(
                    item => item.roomCode === String(result.roomCode).toUpperCase()
                );
                if (chat) {
                    chat.unread = result.unreadCount;
                    saveChats();
                }
            }


            closeModal();

            // Keep the newly created room on the success screen.
            // Do NOT open the conversation or focus the message input yet;
            // this prevents the mobile keyboard from appearing.
            pendingCreatedRoom = room;
            pendingCreatedMessages = Array.isArray(result.messages)
                ? result.messages
                : [];

            // Explicitly remove focus from the create/join form before
            // displaying the Room Created popup.
            if (document.activeElement && typeof document.activeElement.blur === "function") {
                document.activeElement.blur();
            }

            showRoomCodePopup(room.code);

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
            `Room ${code}`,

        owner:
            room.owner || ""

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

        existing.owner =
            room.owner ||
            existing.owner ||
            "";

    } else {

        chats.unshift({

            roomCode:
                code,

            name:
                room.name ||
                `Room ${code}`,

            owner:
                room.owner ||
                "",

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
   QR ROOM SCANNER
========================================== */

let roomQrScanner = null;
let roomQrScannerRunning = false;

function extractRoomCodeFromQr(rawText) {
    const text = String(rawText || "").trim();

    // Current Chat17 QR format: the QR directly contains the 6-character room code.
    const directCode = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (directCode.length === 6) return directCode;

    // Also accept a Chat17 join URL if a QR was generated externally.
    try {
        const url = new URL(text);
        const room =
            url.searchParams.get("room") ||
            url.searchParams.get("roomCode") ||
            url.hash.replace(/^#/, "");

        const code = String(room || "")
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "");

        if (code.length === 6) return code;
    } catch {
        // Not a URL.
    }

    return "";
}

async function startRoomQrScanner() {
    const scannerBox = document.getElementById("qrScannerBox");
    const status = document.getElementById("qrScannerStatus");
    const reader = document.getElementById("qrReader");

    if (!scannerBox || !reader) return;

    if (!window.Html5Qrcode) {
        if (status) status.textContent = "QR scanner is still loading. Please try again.";
        return;
    }

    if (roomQrScannerRunning) return;

    scannerBox.classList.remove("hidden");
    reader.innerHTML = "";
    if (status) status.textContent = "Point your camera at a Chat17 room QR code.";

    roomQrScanner = new Html5Qrcode("qrReader");

    try {
        await roomQrScanner.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: { width: 220, height: 220 },
                aspectRatio: 1
            },
            decodedText => {
                const code = extractRoomCodeFromQr(decodedText);

                if (!code) {
                    if (status) status.textContent = "That QR code does not contain a valid Chat17 room code.";
                    return;
                }

                const input = document.getElementById("roomCodeInput");
                if (input) input.value = code;

                if (status) status.textContent = `Room ${code} found. Joining…`;

                stopRoomQrScanner().finally(() => {
                    performJoin(code);
                });
            },
            () => {
                // Ignore normal camera frames that do not contain a QR code.
            }
        );

        roomQrScannerRunning = true;
    } catch (error) {
        console.error("QR scanner error:", error);
        if (status) {
            status.textContent = "Camera access failed. Please allow camera permission and try again.";
        }
        roomQrScanner = null;
        roomQrScannerRunning = false;
    }
}

async function stopRoomQrScanner() {
    const scannerBox = document.getElementById("qrScannerBox");
    const reader = document.getElementById("qrReader");

    if (roomQrScanner) {
        try {
            if (roomQrScannerRunning) {
                await roomQrScanner.stop();
            }
        } catch (error) {
            console.warn("Unable to stop QR scanner:", error);
        }

        try {
            await roomQrScanner.clear();
        } catch {
            // Already cleared.
        }
    }

    roomQrScanner = null;
    roomQrScannerRunning = false;

    if (reader) reader.innerHTML = "";
    if (scannerBox) scannerBox.classList.add("hidden");
}

const scanRoomQrBtn = document.getElementById("scanRoomQrBtn");
if (scanRoomQrBtn) {
    scanRoomQrBtn.addEventListener("click", startRoomQrScanner);
}

const stopQrScannerBtn = document.getElementById("stopQrScannerBtn");
if (stopQrScannerBtn) {
    stopQrScannerBtn.addEventListener("click", stopRoomQrScanner);
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
                    `Room ${result.roomCode}`,

                owner:
                    result.owner || ""

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


            saveRoom({
                code: result.roomCode,
                name: result.roomName,
                owner: result.owner || ""
            });

            if (typeof result.unreadCount === "number") {
                const chat = chats.find(
                    item => item.roomCode === String(result.roomCode).toUpperCase()
                );
                if (chat) {
                    chat.unread = result.unreadCount;
                    saveChats();
                }
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

            // The reconnected room is open only after history is rendered.
            markChatRead(result.roomCode);
            syncUnreadCounts();

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

                    owner:
                        String(
                            chat.owner ||
                            rooms.find(room => room.code === String(chat.roomCode).toUpperCase())?.owner ||
                            ""
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


            // Room actions
            // Resolve ownership from the canonical room record as well as the chat
            // record. Older localStorage entries may not contain `owner`.
            const roomRecord = rooms.find(
                room => room.code === String(chat.roomCode).toUpperCase()
            );
            const roomOwner =
                chat.owner ||
                roomRecord?.owner ||
                "";

            if (roomOwner && chat.owner !== roomOwner) {
                chat.owner = roomOwner;
            }

            const roomActions =
                document.createElement("button");

            roomActions.className = "room-delete-button";
            roomActions.type = "button";
            roomActions.title =
                "Room options";
            roomActions.textContent = "⋮";
            roomActions.setAttribute("aria-label", "Room options");
            roomActions.disabled = false;

            roomActions.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();

                openRoomActionsMenu(roomActions, { ...chat, owner: roomOwner });
            });

            item.appendChild(roomActions);


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
   ROOM ACTIONS / RENAME ROOM
========================================== */

let activeRoomActionsMenu = null;

function closeRoomActionsMenu() {
    if (activeRoomActionsMenu) {
        activeRoomActionsMenu.remove();
        activeRoomActionsMenu = null;
    }
}

function openRoomActionsMenu(button, chat) {
    closeRoomActionsMenu();

    // Always resolve the latest room record first. This keeps the menu
    // working after a rename, when the chat object may still be stale.
    const code = String(chat?.roomCode || chat?.code || currentRoom || "").toUpperCase();
    const roomRecord = rooms.find(room => String(room.code).toUpperCase() === code);
    const resolvedChat = {
        ...(chat || {}),
        ...(roomRecord || {}),
        roomCode: code,
        owner: roomRecord?.owner || chat?.owner || ""
    };

    if (!code) return;

    const menu = document.createElement("div");
    menu.className = "room-actions-menu";

    const roomCodeButton = document.createElement("button");
    roomCodeButton.type = "button";
    roomCodeButton.className = "room-action-menu-item";
    roomCodeButton.textContent = "Room code";
    roomCodeButton.addEventListener("click", event => {
        event.stopPropagation();
        closeRoomActionsMenu();
        openRoomCodeModal(code);
    });

    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.className = "room-action-menu-item";
    renameButton.textContent = "Rename room";
    renameButton.addEventListener("click", event => {
        event.stopPropagation();
        closeRoomActionsMenu();
        openRenameRoomDialog(resolvedChat);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "room-action-menu-item room-action-danger";
    deleteButton.textContent = "Delete room";
    deleteButton.addEventListener("click", event => {
        event.stopPropagation();
        closeRoomActionsMenu();
        openDeleteRoomDialog(resolvedChat);
    });

    menu.append(roomCodeButton, renameButton, deleteButton);
    document.body.appendChild(menu);

    const rect = button.getBoundingClientRect();
    menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 8)}px`;
    menu.style.left = `${Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8)}px`;

    activeRoomActionsMenu = menu;
}

document.addEventListener("click", event => {
    if (activeRoomActionsMenu && !activeRoomActionsMenu.contains(event.target)) {
        closeRoomActionsMenu();
    }
});

const renameRoomModal = document.getElementById("renameRoomModal");
const renameRoomInput = document.getElementById("renameRoomInput");
const confirmRenameRoom = document.getElementById("confirmRenameRoom");
const closeRenameRoomModal = document.getElementById("closeRenameRoomModal");
const cancelRenameRoom = document.getElementById("cancelRenameRoom");
const renameRoomError = document.getElementById("renameRoomError");
let roomPendingRename = null;

function openRenameRoomDialog(chat) {
    if (!chat) return;
    roomPendingRename = chat;
    if (renameRoomModal) renameRoomModal.classList.remove("hidden");
    if (renameRoomInput) {
        renameRoomInput.value = getPersonalRoomName(chat.roomCode) || chat.name || "";
        requestAnimationFrame(() => {
            renameRoomInput.focus();
            renameRoomInput.select();
        });
    }
    if (renameRoomError) renameRoomError.textContent = "";
}

function closeRenameRoomDialog() {
    if (renameRoomModal) renameRoomModal.classList.add("hidden");
    if (renameRoomInput) renameRoomInput.value = "";
    if (renameRoomError) renameRoomError.textContent = "";
    if (confirmRenameRoom) {
        confirmRenameRoom.disabled = false;
        confirmRenameRoom.textContent = "Rename room";
    }
    roomPendingRename = null;
}

function performRenameRoom() {
    if (!roomPendingRename) return;
    const newName = renameRoomInput ? renameRoomInput.value.trim() : "";

    if (!newName) {
        if (renameRoomError) renameRoomError.textContent = "Enter a room name.";
        return;
    }

    if (newName.length > 40) {
        if (renameRoomError) renameRoomError.textContent = "Room name must be 40 characters or fewer.";
        return;
    }

    if (!socket.connected) {
        if (renameRoomError) renameRoomError.textContent = "Connecting to server. Please wait...";
        return;
    }

    if (confirmRenameRoom) {
        confirmRenameRoom.disabled = true;
        confirmRenameRoom.textContent = "Renaming…";
    }

    const code = String(roomPendingRename.roomCode).toUpperCase();
    socket.emit("rename-room", { username, roomCode: code, roomName: newName }, result => {
        if (!result || !result.success) {
            if (renameRoomError) renameRoomError.textContent = result?.message || "Unable to rename room.";
            if (confirmRenameRoom) {
                confirmRenameRoom.disabled = false;
                confirmRenameRoom.textContent = "Rename room";
            }
            return;
        }

        setPersonalRoomName(code, newName);
        rooms = rooms.map(room =>
            room.code === code ? { ...room, name: newName } : room
        );
        chats = chats.map(chat =>
            chat.roomCode === code ? { ...chat, name: newName } : chat
        );
        localStorage.setItem("chat_rooms", JSON.stringify(rooms));
        saveChats();

        if (currentRoom === code) {
            const nameElement = document.getElementById("conversationName");
            const avatarElement = document.getElementById("conversationAvatar");
            if (nameElement) nameElement.textContent = newName;
            if (avatarElement) avatarElement.textContent = newName.charAt(0).toUpperCase();
            if (currentChat) currentChat.name = newName;
        }
        renderChats();
        closeRenameRoomDialog();
    });
}

if (confirmRenameRoom) confirmRenameRoom.addEventListener("click", performRenameRoom);
if (renameRoomInput) {
    renameRoomInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            performRenameRoom();
        }
    });
}
if (closeRenameRoomModal) closeRenameRoomModal.addEventListener("click", closeRenameRoomDialog);
if (cancelRenameRoom) cancelRenameRoom.addEventListener("click", closeRenameRoomDialog);
if (renameRoomModal) {
    renameRoomModal.addEventListener("click", event => {
        if (event.target === renameRoomModal) closeRenameRoomDialog();
    });
}

socket.on("room-renamed", () => {
    // Personal room names are never broadcast to other users.
});


/* ==========================================
   DELETE ROOM
========================================== */

const deleteRoomModal =
    document.getElementById("deleteRoomModal");

const deleteRoomInput =
    document.getElementById("deleteRoomInput");

const confirmDeleteRoom =
    document.getElementById("confirmDeleteRoom");

const closeDeleteRoomModal =
    document.getElementById("closeDeleteRoomModal");

const cancelDeleteRoom =
    document.getElementById("cancelDeleteRoom");

const deleteRoomError =
    document.getElementById("deleteRoomError");

let roomPendingDeletion = null;
const DELETE_ROOM_PHRASE = "delete room";

function openDeleteRoomDialog(chat) {
    if (!chat) return;

    roomPendingDeletion = chat;

    if (deleteRoomModal) deleteRoomModal.classList.remove("hidden");
    if (deleteRoomInput) {
        deleteRoomInput.value = "";
        requestAnimationFrame(() => deleteRoomInput.focus());
    }
    validateDeleteRoomPhrase();
}

function closeDeleteRoomDialog() {
    if (deleteRoomModal) deleteRoomModal.classList.add("hidden");
    if (deleteRoomInput) deleteRoomInput.value = "";
    if (confirmDeleteRoom) confirmDeleteRoom.disabled = true;
    if (deleteRoomError) deleteRoomError.textContent = "";
    roomPendingDeletion = null;
}

function validateDeleteRoomPhrase() {
    const value = deleteRoomInput
        ? deleteRoomInput.value.trim().toLowerCase()
        : "";

    const valid = value === DELETE_ROOM_PHRASE;
    if (confirmDeleteRoom) confirmDeleteRoom.disabled = !valid;
    if (deleteRoomError) {
        deleteRoomError.textContent =
            value && !valid ? "Type exactly: delete room" : "";
    }
    return valid;
}

function performDeleteRoom() {
    if (!roomPendingDeletion || !validateDeleteRoomPhrase()) return;

    const code = String(roomPendingDeletion.roomCode).toUpperCase();
    if (confirmDeleteRoom) {
        confirmDeleteRoom.disabled = true;
        confirmDeleteRoom.textContent = "Deleting…";
    }

    const finish = () => {
        rooms = rooms.filter(room => room.code !== code);
        chats = chats.filter(chat => chat.roomCode !== code);
        saveChats();
        localStorage.setItem("chat_rooms", JSON.stringify(rooms));

        if (currentRoom === code) {
            currentRoom = "";
            currentChat = null;
            localStorage.removeItem("chat_current_room");
            if (conversation) conversation.classList.add("hidden");
            if (welcomePanel) welcomePanel.classList.remove("hidden");
            if (messagePanel && window.innerWidth <= 767) {
                messagePanel.classList.remove("mobile-open");
            }
        }

        renderChats();
        updateUserUI();
        closeDeleteRoomDialog();
    };

    if (!socket.connected) {
        alert("Connecting to server. Please wait...");
        if (confirmDeleteRoom) {
            confirmDeleteRoom.disabled = false;
            confirmDeleteRoom.textContent = "Delete room";
        }
        return;
    }

    socket.emit("delete-room", { username, roomCode: code }, result => {
        if (!result || !result.success) {
            if (deleteRoomError) deleteRoomError.textContent = result?.message || "Unable to delete room.";
            if (confirmDeleteRoom) {
                confirmDeleteRoom.disabled = false;
                confirmDeleteRoom.textContent = "Delete room";
            }
            return;
        }
        finish();
    });
}

if (deleteRoomInput) {
    deleteRoomInput.addEventListener("input", validateDeleteRoomPhrase);
    deleteRoomInput.addEventListener("keydown", event => {
        if (event.key === "Enter" && validateDeleteRoomPhrase()) {
            event.preventDefault();
            performDeleteRoom();
        }
    });
}

if (confirmDeleteRoom) confirmDeleteRoom.addEventListener("click", performDeleteRoom);
if (closeDeleteRoomModal) closeDeleteRoomModal.addEventListener("click", closeDeleteRoomDialog);
if (cancelDeleteRoom) cancelDeleteRoom.addEventListener("click", closeDeleteRoomDialog);
if (deleteRoomModal) {
    deleteRoomModal.addEventListener("click", event => {
        if (event.target === deleteRoomModal) closeDeleteRoomDialog();
    });
}

socket.on("room-deleted", data => {
    const code = String(data?.roomCode || "").toUpperCase();
    if (!code) return;

    rooms = rooms.filter(room => room.code !== code);
    chats = chats.filter(chat => chat.roomCode !== code);
    saveChats();
    localStorage.setItem("chat_rooms", JSON.stringify(rooms));

    if (currentRoom === code) {
        currentRoom = "";
        currentChat = null;
        localStorage.removeItem("chat_current_room");
        if (conversation) conversation.classList.add("hidden");
        if (welcomePanel) welcomePanel.classList.remove("hidden");
        if (messagePanel && window.innerWidth <= 767) messagePanel.classList.remove("mobile-open");
    }

    renderChats();
    updateUserUI();
});


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


            const payload = replyingTo
                ? {
                    message,
                    replyTo: {
                        id: replyingTo.id,
                        username: replyingTo.username,
                        message: replyingTo.message
                    }
                }
                : message;

            socket.emit(
                "send-message",
                payload
            );

            input.value = "";
            clearReply();
            input.focus();

        }
    );

}


/* ==========================================
   SWIPE TO REPLY — WhatsApp style
========================================== */

function setReply(messageData) {
    if (!messageData || !messageData.id) return;

    replyingTo = {
        id: messageData.id,
        username: messageData.username || "User",
        message: messageData.message || ""
    };

    if (replyName) replyName.textContent = replyingTo.username;
    if (replyText) replyText.textContent = replyingTo.message;

    if (replyBar) {
        replyBar.classList.remove("hidden");
        replyBar.setAttribute("aria-hidden", "false");
    }

    const input = document.getElementById("messageInput");
    if (input) input.focus();
}

function clearReply() {
    replyingTo = null;
    if (replyBar) {
        replyBar.classList.add("hidden");
        replyBar.setAttribute("aria-hidden", "true");
    }
}

if (cancelReplyBtn) cancelReplyBtn.addEventListener("click", clearReply);

function requestDeleteMessage(messageData, element) {
    if (!messageData?.id || !currentRoom) return;

    const sender = String(messageData.senderUsername || messageData.username || "").trim().toLowerCase();
    const me = String(username || "").trim().toLowerCase();
    if (!sender || sender !== me) return;

    socket.emit("delete-message", {
        roomCode: currentRoom,
        messageId: String(messageData.id)
    }, result => {
        if (!result?.success) return;
        if (element?.isConnected) element.remove();
    });
}

function attachSwipeReply(element, messageData) {
    let startX = 0;
    let startY = 0;
    let swiping = false;
    let holdTimer = null;
    let holdTriggered = false;

    const clearHold = () => {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
    };

    element.addEventListener("pointerdown", event => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        startX = event.clientX;
        startY = event.clientY;
        swiping = false;
        holdTriggered = false;
        swipeState = { element, startX, startY };
        clearHold();

        // Hold a message for 3 seconds to delete your own message.
        const sender = String(messageData.senderUsername || messageData.username || "").trim().toLowerCase();
        const me = String(username || "").trim().toLowerCase();
        if (sender && sender === me) {
            holdTimer = setTimeout(() => {
                holdTriggered = true;
                element.classList.remove("swiping", "reply-ready");
                element.style.transform = "";
                swipeState = null;
                requestDeleteMessage(messageData, element);
            }, 3000);
        }

        try { element.setPointerCapture(event.pointerId); } catch (_) {}
    });

    element.addEventListener("pointermove", event => {
        if (!swipeState || swipeState.element !== element || holdTriggered) return;

        const dx = event.clientX - startX;
        const dy = event.clientY - startY;

        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearHold();
        if (!swiping && Math.abs(dx) < 8) return;

        if (!swiping && Math.abs(dy) > Math.abs(dx)) {
            swipeState = null;
            return;
        }

        swiping = true;
        // Left swipe is delete; right swipe keeps the existing reply action.
        const direction = dx >= 0 ? 1 : -1;
        const distance = Math.min(Math.abs(dx), 110);

        element.style.transform = `translateX(${direction * distance}px)`;
        element.classList.add("swiping");
        element.classList.toggle("reply-ready", direction > 0 && distance >= 60);
        element.classList.toggle("delete-ready", direction < 0 && distance >= 60);
    });

    const finishSwipe = event => {
        clearHold();
        if (!swipeState || swipeState.element !== element) return;

        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        const shouldDelete =
            swiping &&
            dx <= -60 &&
            Math.abs(dx) > Math.abs(dy);
        const shouldReply =
            swiping &&
            dx >= 60 &&
            Math.abs(dx) > Math.abs(dy);

        element.style.transform = "";
        element.classList.remove("swiping", "reply-ready", "delete-ready");
        swipeState = null;

        if (shouldDelete) requestDeleteMessage(messageData, element);
        else if (shouldReply) setReply(messageData);
        swiping = false;
    };

    element.addEventListener("pointerup", finishSwipe);
    element.addEventListener("pointercancel", () => {
        clearHold();
        if (swipeState?.element === element) {
            element.style.transform = "";
            element.classList.remove("swiping", "reply-ready", "delete-ready");
            swipeState = null;
        }
        swiping = false;
    });
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

            // Viewing the open conversation immediately creates a read receipt.
            if (
                String(data.senderUsername || data.username || "").trim().toLowerCase() !==
                String(username || "").trim().toLowerCase()
            ) {
                markRoomMessagesSeen(roomCode);
                markChatRead(roomCode);
            }

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

    if (data.id) element.dataset.messageId = String(data.id);


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

    // Instagram-style seen indicator: show two tiny orange commas
    // on the same row as the sender name, aligned to the right.
    const hasSeen = isOwnMessage && Array.isArray(data.seenBy) && data.seenBy.some(
        person => String(person).trim().toLowerCase() !== myName
    );
    if (hasSeen) {
        const seen = document.createElement("span");
        seen.className = "message-seen";
        seen.textContent = ",,";
        seen.setAttribute("aria-label", "Seen");
        seen.title = "Seen";
        name.appendChild(seen);
    }


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

    if (data.replyTo && data.replyTo.message) {
        const quote = document.createElement("div");
        quote.className = "reply-quote";
        if (data.replyTo.id) quote.dataset.replyToId = String(data.replyTo.id);
        quote.setAttribute("role", "button");
        quote.setAttribute("tabindex", "0");
        quote.title = "View replied message";

        const quoteName = document.createElement("strong");
        quoteName.textContent = data.replyTo.username || "User";

        const quoteText = document.createElement("span");
        quoteText.textContent = data.replyTo.message;

        quote.appendChild(quoteName);
        quote.appendChild(quoteText);

        const jumpToOriginal = () => {
            const id = quote.dataset.replyToId;
            if (!id || !messages) return;
            const original = messages.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
            if (!original) return;
            original.scrollIntoView({ behavior: "smooth", block: "center" });
            original.classList.remove("reply-highlight");
            void original.offsetWidth;
            original.classList.add("reply-highlight");
            window.setTimeout(() => original.classList.remove("reply-highlight"), 1200);
        };
        quote.addEventListener("click", jumpToOriginal);
        quote.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                jumpToOriginal();
            }
        });

        element.appendChild(quote);
    }

    element.appendChild(text);

    element.appendChild(time);

    attachSwipeReply(element, data);

    messages.appendChild(
        element
    );


    messages.scrollTop =
        messages.scrollHeight;

}


/* ==========================================
   MESSAGE SEEN / READ RECEIPT
========================================== */

socket.on(
    "message-seen",
    data => {
        if (!data || !data.messageId) return;

        const messageElement = messages
            ? messages.querySelector(
                `[data-message-id="${CSS.escape(String(data.messageId))}"]`
            )
            : null;

        if (!messageElement) return;

        const myName = String(username || "").trim().toLowerCase();
        const seenBy = Array.isArray(data.seenBy) ? data.seenBy : [];

        if (!seenBy.some(
            person => String(person).trim().toLowerCase() !== myName
        )) {
            return;
        }

        if (!messageElement.classList.contains("own")) return;

        // Keep exactly one seen marker even if the same read event arrives
        // more than once during reconnect/replay.
        const seenMarkers = messageElement.querySelectorAll(".message-seen");
        seenMarkers.forEach((marker, index) => {
            if (index > 0) marker.remove();
        });

        let seen = messageElement.querySelector(".message-seen");
        if (!seen) {
            seen = document.createElement("span");
            seen.className = "message-seen";
            seen.textContent = ",,";
            seen.setAttribute("aria-label", "Seen");
            seen.title = "Seen";
            const name = messageElement.querySelector(".message-name");
            if (name) {
                name.appendChild(seen);
            } else {
                messageElement.appendChild(seen);
            }
        }
    }
);


socket.on("message-deleted", data => {
    if (!data?.messageId || !messages) return;
    const element = messages.querySelector(`[data-message-id="${CSS.escape(String(data.messageId))}"]`);
    if (element) element.remove();
});


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


        // Count unique people, not duplicate socket connections.
        const uniqueUsernames = new Set(
            users
                .map(user => String(user?.username || "").trim())
                .filter(Boolean)
        );

        const onlineCount = uniqueUsernames.size;

        setStatus(
            onlineCount === 1
                ? "1 person online"
                : `${onlineCount} people online`
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
   MARK SERVER MESSAGES AS SEEN
========================================== */

function markRoomMessagesSeen(roomCode) {
    const code = String(roomCode || "").toUpperCase();

    if (!code || !username || !socket.connected) return;

    socket.emit(
        "mark-room-read",
        {
            roomCode: code,
            username
        }
    );
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

    // Keep the local unread badge cleared and persist that state even if
    // the other participant disconnects or this browser reconnects later.
    markRoomMessagesSeen(code);

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
    if (!viewport || !messagePanel) return;

    // Pin the chat to the exact visible visual viewport. Do not use the
    // document/body height here: on Android the keyboard can resize the
    // visual viewport while the layout viewport remains taller, which leaves
    // a strip of the page visible above the keyboard.
    const top = Math.max(0, viewport.offsetTop || 0);
    const height = Math.max(0, viewport.height || window.innerHeight);
    const layoutHeight = Math.max(0, window.innerHeight || height);
    const keyboardOpen = layoutHeight - height > 80;

    messagePanel.style.top = `${top}px`;
    messagePanel.style.bottom = "auto";
    messagePanel.style.height = `${height}px`;
    messagePanel.classList.toggle("keyboard-open", keyboardOpen);

    // Prevent the underlying document from participating in the gesture.
    // Only #messages should be scrollable while the conversation is open.
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.overscrollBehavior = "none";

    if (currentRoom) {
        requestAnimationFrame(() => {
            scrollMessagesToBottom();
        });
    }
}

function resetMobileViewportStyles() {
    if (!messagePanel) return;
    messagePanel.style.top = "";
    messagePanel.style.bottom = "";
    messagePanel.style.height = "";
    messagePanel.classList.remove("keyboard-open");
    document.documentElement.style.overscrollBehavior = "";
    document.body.style.overscrollBehavior = "";
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
        resetMobileViewportStyles();
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
            resetMobileViewportStyles();

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

    stopRoomQrScanner();

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
   ROOM CODE MENU MODAL
========================================== */
function openRoomCodeModal(code) {
    const modal = document.getElementById("roomCodeModal");
    const value = document.getElementById("roomCodeValue");
    const copied = document.getElementById("roomCodeCopied");
    const qr = document.getElementById("roomCodeQr");
    const cleanCode = String(code || "").trim().toUpperCase();

    if (!modal) return;

    if (value) value.textContent = cleanCode || "—";
    if (copied) copied.textContent = "";

    if (qr) {
        qr.innerHTML = "";

        if (cleanCode && window.QRCode) {
            new QRCode(qr, {
                text: cleanCode,
                width: 190,
                height: 190,
                correctLevel: QRCode.CorrectLevel.M
            });
        } else if (cleanCode) {
            qr.textContent = "QR is loading…";
            setTimeout(() => openRoomCodeModal(cleanCode), 300);
        }
    }

    modal.classList.remove("hidden");
}

function closeRoomCodeModal() {
    const modal = document.getElementById("roomCodeModal");
    if (modal) modal.classList.add("hidden");
}

const closeRoomCodeModalBtn = document.getElementById("closeRoomCodeModal");
const closeRoomCodeModalButton = document.getElementById("closeRoomCodeModalButton");
const copyRoomCodeBtn = document.getElementById("copyRoomCodeBtn");
if (closeRoomCodeModalBtn) closeRoomCodeModalBtn.addEventListener("click", closeRoomCodeModal);
if (closeRoomCodeModalButton) closeRoomCodeModalButton.addEventListener("click", closeRoomCodeModal);
if (copyRoomCodeBtn) copyRoomCodeBtn.addEventListener("click", async () => {
    const code = document.getElementById("roomCodeValue")?.textContent?.trim() || "";
    const copied = document.getElementById("roomCodeCopied");
    try {
        await navigator.clipboard.writeText(code);
        if (copied) copied.textContent = "Copied ✓";
    } catch {
        if (copied) copied.textContent = "Copy failed. Long-press the code to copy it.";
    }
});
const roomCodeModal = document.getElementById("roomCodeModal");
if (roomCodeModal) roomCodeModal.addEventListener("click", event => {
    if (event.target === roomCodeModal) closeRoomCodeModal();
});

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

    // Generate a compact QR code immediately in the Room Created popup.
    const qr = document.getElementById("createdRoomQr");
    const cleanCode = String(code || "").trim().toUpperCase();
    if (qr) {
        qr.innerHTML = "";
        if (cleanCode && window.QRCode) {
            new QRCode(qr, {
                text: cleanCode,
                width: 112,
                height: 112,
                correctLevel: QRCode.CorrectLevel.M
            });
        } else if (cleanCode) {
            qr.textContent = "QR loading…";
            setTimeout(() => showRoomCodePopup(cleanCode), 300);
        }
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

            // Closing the popup must NOT enter the chat.
            // The user must explicitly press Continue Chat.

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

            // Continue Chat is the only action that enters the new room.
            if (pendingCreatedRoom) {
                const room = pendingCreatedRoom;
                const roomMessages = pendingCreatedMessages;
                pendingCreatedRoom = null;
                pendingCreatedMessages = [];

                openConversation(room.code, room.name);
                messages.innerHTML = "";
                roomMessages.forEach(addMessage);
            }

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
   DELETE ACCOUNT / LOGOUT
========================================== */

const logoutButtons = [
    document.getElementById("logoutBtn"),
    document.getElementById("desktopLogoutBtn")
].filter(Boolean);

const deleteAccountModal =
    document.getElementById("deleteAccountModal");

const deleteAccountInput =
    document.getElementById("deleteAccountInput");

const confirmDeleteAccount =
    document.getElementById("confirmDeleteAccount");

const closeDeleteAccountModal =
    document.getElementById("closeDeleteAccountModal");

const cancelDeleteAccount =
    document.getElementById("cancelDeleteAccount");

const deleteAccountError =
    document.getElementById("deleteAccountError");

const DELETE_ACCOUNT_PHRASE =
    "yes delete account";

function closeDeleteAccountDialog() {

    if (!deleteAccountModal) {
        return;
    }

    deleteAccountModal.classList.add("hidden");

    if (deleteAccountInput) {
        deleteAccountInput.value = "";
    }

    if (confirmDeleteAccount) {
        confirmDeleteAccount.disabled = true;
    }

    if (deleteAccountError) {
        deleteAccountError.textContent = "";
    }

}

function openDeleteAccountDialog() {

    if (!deleteAccountModal) {
        return;
    }

    deleteAccountModal.classList.remove("hidden");

    requestAnimationFrame(() => {

        if (deleteAccountInput) {
            deleteAccountInput.focus();
        }

    });

}

function validateDeletePhrase() {

    const value =
        deleteAccountInput
            ? deleteAccountInput.value.trim().toLowerCase()
            : "";

    const valid =
        value === DELETE_ACCOUNT_PHRASE;

    if (confirmDeleteAccount) {
        confirmDeleteAccount.disabled = !valid;
    }

    if (deleteAccountError) {

        deleteAccountError.textContent =
            value && !valid
                ? "Type exactly: yes delete account"
                : "";

    }

    return valid;

}

function performDeleteAccount() {

    if (!validateDeletePhrase()) {
        return;
    }

    if (confirmDeleteAccount) {
        confirmDeleteAccount.disabled = true;
        confirmDeleteAccount.textContent = "Deleting…";
    }

    const roomsToClear =
        Array.isArray(rooms)
            ? rooms.map(room => room.code).filter(Boolean)
            : [];

    const finishDeleteAccount = () => {

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

            if (completed) {
                return;
            }

            completed = true;
            finishDeleteAccount();

        };

        socket.emit(
            "logout",
            {
                username,
                roomCodes: roomsToClear
            },
            done
        );

        // Never leave account deletion stuck if the connection is unavailable.
        setTimeout(done, 1500);

    } else {

        finishDeleteAccount();

    }

}

logoutButtons.forEach(button => {

    button.addEventListener(
        "click",
        openDeleteAccountDialog
    );

});

if (deleteAccountInput) {

    deleteAccountInput.addEventListener(
        "input",
        validateDeletePhrase
    );

    deleteAccountInput.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter" &&
                validateDeletePhrase()
            ) {

                event.preventDefault();
                performDeleteAccount();

            }

        }
    );

}

if (confirmDeleteAccount) {

    confirmDeleteAccount.addEventListener(
        "click",
        performDeleteAccount
    );

}

if (closeDeleteAccountModal) {

    closeDeleteAccountModal.addEventListener(
        "click",
        closeDeleteAccountDialog
    );

}

if (cancelDeleteAccount) {

    cancelDeleteAccount.addEventListener(
        "click",
        closeDeleteAccountDialog
    );

}

if (deleteAccountModal) {

    deleteAccountModal.addEventListener(
        "click",
        event => {

            if (event.target === deleteAccountModal) {
                closeDeleteAccountDialog();
            }

        }
    );

}

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
/* ==========================================
   MOBILE / CHAT HEADER ROOM MENU
   The same 3-dot menu works inside the open chat.
========================================== */
const roomInfoBtn = document.getElementById("roomInfoBtn");
if (roomInfoBtn) {
    roomInfoBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const code = String(currentRoom || "").toUpperCase();
        const room = rooms.find(r => String(r.code).toUpperCase() === code);
        const chat = chats.find(c => String(c.roomCode).toUpperCase() === code) || currentChat;
        if (room || chat) {
            openRoomActionsMenu(roomInfoBtn, {
                ...(chat || {}),
                ...(room || {}),
                roomCode: code,
                owner: room?.owner || chat?.owner || ""
            });
        }
    });
}
