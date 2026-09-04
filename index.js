"use strict";

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();

const server =
    http.createServer(app);

const io =
    new Server(server, {

        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        },

        transports: [
            "websocket",
            "polling"
        ],

        pingInterval: 25000,
        pingTimeout: 20000

    });


const PORT =
    process.env.PORT || 3000;


/* ==========================================
   EXPRESS
========================================== */

app.use(
    express.json()
);

app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);


/* ==========================================
   ROOMS
========================================== */

const rooms =
    new Map();


/* ==========================================
   ROOM CODE
========================================== */

function generateRoomCode() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;

    do {

        code = "";

        for (
            let i = 0;
            i < 6;
            i++
        ) {

            code +=
                chars[
                    Math.floor(
                        Math.random() *
                        chars.length
                    )
                ];

        }

    }
    while (
        rooms.has(code)
    );


    return code;
}


/* ==========================================
   CLEAN NAME
========================================== */

function cleanName(name) {

    return String(
        name || ""
    )
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 30);

}


/* ==========================================
   CLEAN ROOM NAME
========================================== */

function cleanRoomName(name) {

    return String(name || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 40);

}


/* ==========================================
   CLEAN ROOM
========================================== */

function cleanRoomCode(code) {

    return String(
        code || ""
    )
        .trim()
        .toUpperCase()
        .replace(
            /[^A-Z0-9]/g,
            ""
        )
        .slice(0, 6);

}


/* ==========================================
   USERS
========================================== */

function getUsers(roomCode) {

    const room =
        rooms.get(roomCode);


    if (!room) {
        return [];
    }


    // Online status represents PEOPLE, not Socket.IO connections.
    // A refresh, reconnect, or multiple tabs can create several sockets
    // for the same person; those must count as one person.
    const uniqueUsers = new Map();

    for (const user of room.users.values()) {
        const username = String(user?.username || "").trim();

        if (!username || uniqueUsers.has(username)) {
            continue;
        }

        uniqueUsers.set(username, {
            id: user.id,
            username
        });
    }

    return Array.from(uniqueUsers.values());

}


/* ==========================================
   USERS UPDATE
========================================== */

function emitUsers(roomCode) {

    io.to(roomCode).emit(
        "users-update",
        getUsers(roomCode)
    );

}


/* ==========================================
   UNREAD MESSAGE COUNT
========================================== */

function getUnreadCount(room, username) {
    if (!room || !username) return 0;

    const me = cleanName(username).toLowerCase();

    return room.messages.filter(message => {
        const sender = cleanName(
            message.senderUsername || message.username
        ).toLowerCase();

        if (!sender || sender === me) return false;

        const seenBy = Array.isArray(message.seenBy)
            ? message.seenBy.map(name => cleanName(name).toLowerCase())
            : [];

        return !seenBy.includes(me);
    }).length;
}

function pushUnreadCount(roomCode, username) {
    const room = rooms.get(roomCode);
    const target = cleanName(username).toLowerCase();
    if (!room || !target) return;

    const count = getUnreadCount(room, username);

    for (const connectedSocket of io.sockets.sockets.values()) {
        const socketUser = cleanName(connectedSocket.username).toLowerCase();
        if (socketUser !== target) continue;
        if (connectedSocket.roomCode === roomCode) continue;

        connectedSocket.emit("unread-count-update", { roomCode, count });
    }
}


/* ==========================================
   CONNECTION
========================================== */

io.on(
    "connection",
    socket => {

        console.log(
            "Connected:",
            socket.id
        );


        /* ==================================
           CREATE ROOM
        ================================== */

        socket.on(
            "create-room",
            (username, callback) => {

                username =
                    cleanName(username);


                if (!username) {

                    return callback({

                        success: false,

                        message:
                            "Name is required."

                    });

                }


                const roomCode =
                    generateRoomCode();


                const room = {

                    code:
                        roomCode,

                    name:
                        `Room ${roomCode}`,

                    owner:
                        username,

                    users:
                        new Map(),

                    messages:
                        [],

                    // Each user may keep a private/favourite room name.
                    namesByUser:
                        new Map(),

                    createdAt:
                        Date.now()

                };


                rooms.set(
                    roomCode,
                    room
                );


                joinRoomSocket(
                    socket,
                    room,
                    username
                );


                callback({

                    success: true,

                    roomCode,

                    roomName:
                        room.namesByUser?.get(username) || room.name,

                    owner:
                        room.owner,

                    messages:
                        room.messages,

                    unreadCount:
                        getUnreadCount(room, username)

                });


                emitUsers(
                    roomCode
                );

            }
        );


        /* ==================================
           JOIN ROOM
        ================================== */

        socket.on(
            "join-room",
            (data, callback) => {

                data =
                    data || {};


                const username =
                    cleanName(
                        data.username
                    );


                const roomCode =
                    cleanRoomCode(
                        data.roomCode
                    );


                if (!username) {

                    return callback({

                        success: false,

                        message:
                            "Name is required."

                    });

                }


                if (
                    roomCode.length !== 6
                ) {

                    return callback({

                        success: false,

                        message:
                            "Invalid room code."

                    });

                }


                const room =
                    rooms.get(roomCode);


                if (!room) {

                    return callback({

                        success: false,

                        message:
                            "Room not found."

                    });

                }


                leaveCurrentRoom(
                    socket,
                    false
                );


                joinRoomSocket(
                    socket,
                    room,
                    username
                );


                callback({

                    success: true,

                    roomCode:
                        room.code,

                    roomName:
                        room.namesByUser?.get(username) || room.name,

                    owner:
                        room.owner,

                    messages:
                        room.messages,

                    unreadCount:
                        getUnreadCount(room, username)

                });


                socket.to(
                    roomCode
                ).emit(
                    "system-message",
                    {

                        text:
                            `${username} joined the room.`,

                        roomCode

                    }
                );


                emitUsers(
                    roomCode
                );

            }
        );


        /* ==================================
           REJOIN AFTER CONNECTION LOSS
        ================================== */

        socket.on(
            "rejoin-room",
            (data, callback) => {

                data =
                    data || {};


                const username =
                    cleanName(
                        data.username
                    );


                const roomCode =
                    cleanRoomCode(
                        data.roomCode
                    );


                const room =
                    rooms.get(roomCode);


                if (
                    !username ||
                    !room
                ) {

                    return callback({

                        success: false,

                        message:
                            "Room is unavailable."

                    });

                }


                leaveCurrentRoom(
                    socket,
                    false
                );


                joinRoomSocket(
                    socket,
                    room,
                    username
                );


                callback({

                    success: true,

                    roomCode:
                        room.code,

                    roomName:
                        room.namesByUser?.get(username) || room.name,

                    owner:
                        room.owner,

                    messages:
                        room.messages,

                    unreadCount:
                        getUnreadCount(room, username)

                });


                emitUsers(
                    roomCode
                );

            }
        );


        /* ==================================
           SYNC UNREAD COUNTS AFTER RECONNECT
        ================================== */

        socket.on(
            "sync-unread-counts",
            (data, callback) => {

                data = data || {};

                const username = cleanName(data.username);
                const roomCodes = Array.isArray(data.roomCodes)
                    ? data.roomCodes.map(cleanRoomCode).filter(Boolean)
                    : [];

                const counts = {};

                if (username) {
                    for (const roomCode of roomCodes) {
                        const room = rooms.get(roomCode);
                        if (room) {
                            counts[roomCode] = getUnreadCount(room, username);
                        } else {
                            counts[roomCode] = 0;
                        }
                    }
                }

                if (typeof callback === "function") {
                    callback({ success: true, counts });
                }
            }
        );


        /* ==================================
           DELETE ROOM
        ================================== */

        socket.on(
            "delete-room",
            (data, callback) => {

                data = data || {};

                const roomCode = cleanRoomCode(data.roomCode);
                const username = cleanName(data.username);
                const room = rooms.get(roomCode);

                if (!room) {
                    if (typeof callback === "function") callback({
                        success: false,
                        message: "Room not found."
                    });
                    return;
                }

                if (!username || room.owner !== username) {
                    if (typeof callback === "function") callback({
                        success: false,
                        message: "Only the room creator can delete this room."
                    });
                    return;
                }

                // Tell everyone currently inside that the room was deleted.
                io.to(roomCode).emit("room-deleted", { roomCode });

                rooms.delete(roomCode);

                // Remove socket room state for connected members.
                for (const socketId of room.users.keys()) {
                    const member = io.sockets.sockets.get(socketId);
                    if (member) {
                        member.leave(roomCode);
                        member.roomCode = "";
                    }
                }

                if (typeof callback === "function") {
                    callback({ success: true, roomCode });
                }
            }
        );


        /* ==================================
           RENAME ROOM
        ================================== */

        socket.on(
            "rename-room",
            (data, callback) => {

                data = data || {};

                const roomCode = cleanRoomCode(data.roomCode);
                const username = cleanName(data.username);
                const roomName = cleanRoomName(data.roomName);
                const room = rooms.get(roomCode);

                if (!room) {
                    if (typeof callback === "function") callback({ success: false, message: "Room not found." });
                    return;
                }

                // Renaming is a personal preference: every participant can set
                // their own name without changing the other participant's name.
                if (!username) {
                    if (typeof callback === "function") callback({ success: false, message: "Username is required." });
                    return;
                }

                const participant = room.users.get(socket.id);
                if (!participant || participant.username !== username) {
                    if (typeof callback === "function") callback({ success: false, message: "Join the room before renaming it." });
                    return;
                }

                if (!roomName) {
                    if (typeof callback === "function") callback({ success: false, message: "Room name is required." });
                    return;
                }

                if (!room.namesByUser) room.namesByUser = new Map();
                room.namesByUser.set(username, roomName);

                // Do NOT broadcast this rename. It belongs only to this user.
                callback({
                    success: true,
                    roomCode,
                    roomName,
                    owner: room.owner,
                    personal: true
                });
            }
        );


        /* ==================================
           LOGOUT / CLEAR USER DATA
        ================================== */

        socket.on(
            "logout",
            (data, callback) => {

                data = data || {};

                const logoutUsername =
                    cleanName(data.username);

                const roomCodes =
                    Array.isArray(data.roomCodes)
                        ? data.roomCodes
                            .map(cleanRoomCode)
                            .filter(Boolean)
                        : [];

                // Also include the room the socket is currently in.
                if (
                    socket.roomCode &&
                    !roomCodes.includes(socket.roomCode)
                ) {
                    roomCodes.push(socket.roomCode);
                }

                roomCodes.forEach(roomCode => {

                    const room = rooms.get(roomCode);

                    if (!room) {
                        return;
                    }

                    // Delete every message authored by this user.
                    if (logoutUsername) {

                        room.messages =
                            room.messages.filter(
                                message =>
                                    message.senderUsername !== logoutUsername &&
                                    message.username !== logoutUsername
                            );

                    }

                    room.users.delete(socket.id);

                    emitUsers(roomCode);

                    // If nobody is left, remove the room and all remaining data.
                    if (room.users.size === 0) {
                        rooms.delete(roomCode);
                    }

                });

                socket.roomCode = "";
                socket.username = "";

                if (typeof callback === "function") {
                    callback({ success: true });
                }

                socket.disconnect(true);

            }
        );


        /* ==================================
           SEND MESSAGE
        ================================== */

        socket.on(
            "send-message",
            payload => {

                if (
                    !socket.roomCode
                ) {

                    return;

                }


                const room =
                    rooms.get(
                        socket.roomCode
                    );


                if (!room) {
                    return;
                }


                const message =
                    String(
                        typeof payload === "string"
                            ? payload
                            : payload?.message || ""
                    )
                        .trim()
                        .slice(
                            0,
                            2000
                        );

                if (!message) {
                    return;
                }

                let replyTo = null;

                if (
                    payload &&
                    typeof payload === "object" &&
                    payload.replyTo &&
                    payload.replyTo.id
                ) {
                    const original = room.messages.find(
                        item => item.id === String(payload.replyTo.id)
                    );

                    if (original) {
                        replyTo = {
                            id: original.id,
                            username: original.username,
                            message: original.message
                        };
                    }
                }


                const data = {

                    id:
                        `${Date.now()}-${Math.random()
                            .toString(36)
                            .slice(2, 9)}`,

                    username:
                        socket.username,

                    message,

                    senderId:
                        socket.id,

                    // socket.id changes after a reconnect, so keep a stable
                    // sender name for rendering message ownership in history.
                    senderUsername:
                        socket.username,

                    roomCode:
                        socket.roomCode,

                    time:
                        new Date()
                            .toISOString(),

                    replyTo,

                    // Usernames of people who have opened/read this message.
                    seenBy: []

                };


                room.messages.push(
                    data
                );


                if (
                    room.messages.length >
                    200
                ) {

                    room.messages =
                        room.messages.slice(
                            -200
                        );

                }


                io.to(
                    socket.roomCode
                ).emit(
                    "receive-message",
                    data
                );

                // Immediately push the authoritative badge count to other
                // connected tabs/devices for the room participants.
                const senderName = cleanName(socket.username).toLowerCase();
                const participantNames = new Set(
                    [...room.users.values()]
                        .map(user => cleanName(user?.username))
                        .filter(Boolean)
                );
                for (const participant of participantNames) {
                    if (participant.toLowerCase() !== senderName) {
                        pushUnreadCount(socket.roomCode, participant);
                    }
                }

            }
        );


        /* ==================================
           DELETE MESSAGE
           Only the message author can delete it.
        ================================== */

        socket.on(
            "delete-message",
            (data, callback) => {
                data = data || {};

                const roomCode = cleanRoomCode(data.roomCode || socket.roomCode);
                const messageId = String(data.messageId || "").trim();
                const room = rooms.get(roomCode);

                if (!room || !messageId || socket.roomCode !== roomCode) {
                    if (typeof callback === "function") callback({ success: false, message: "Message not found." });
                    return;
                }

                const index = room.messages.findIndex(message => String(message.id) === messageId);
                if (index === -1) {
                    if (typeof callback === "function") callback({ success: false, message: "Message not found." });
                    return;
                }

                const message = room.messages[index];
                const sender = cleanName(message.senderUsername || message.username).toLowerCase();
                const requester = cleanName(socket.username).toLowerCase();

                if (!sender || sender !== requester) {
                    if (typeof callback === "function") callback({ success: false, message: "You can only delete your own messages." });
                    return;
                }

                room.messages.splice(index, 1);

                io.to(roomCode).emit("message-deleted", {
                    roomCode,
                    messageId
                });

                if (typeof callback === "function") callback({ success: true, messageId });
            }
        );


        /* ==================================
           MARK ROOM AS SEEN / READ
        ================================== */

        socket.on(
            "mark-room-read",
            (data, callback) => {

                data = data || {};

                const roomCode = cleanRoomCode(data.roomCode);
                const username = cleanName(data.username);
                const room = rooms.get(roomCode);

                if (!room || !username) {
                    if (typeof callback === "function") {
                        callback({ success: false });
                    }
                    return;
                }

                let changed = false;

                // Mark every message from another participant as seen by this user.
                for (const message of room.messages) {
                    const sender = cleanName(
                        message.senderUsername || message.username
                    );

                    if (!sender || sender === username) continue;

                    if (!Array.isArray(message.seenBy)) {
                        message.seenBy = [];
                    }

                    const alreadySeen = message.seenBy.some(
                        name => cleanName(name).toLowerCase() === username.toLowerCase()
                    );

                    if (!alreadySeen) {
                        message.seenBy.push(username);
                        changed = true;

                        io.to(roomCode).emit("message-seen", {
                            roomCode,
                            messageId: message.id,
                            seenBy: [...message.seenBy]
                        });
                    }
                }

                // Sync the badge immediately across any other tabs.
                pushUnreadCount(roomCode, username);

                if (typeof callback === "function") {
                    callback({ success: true, changed });
                }
            }
        );


        /* ==================================
           DISCONNECT
        ================================== */

        socket.on(
            "disconnect",
            reason => {

                console.log(
                    "Disconnected:",
                    socket.id,
                    reason
                );


                const roomCode =
                    socket.roomCode;


                if (!roomCode) {
                    return;
                }


                const room =
                    rooms.get(
                        roomCode
                    );


                if (!room) {
                    return;
                }


                room.users.delete(
                    socket.id
                );


                socket.to(
                    roomCode
                ).emit(
                    "system-message",
                    {

                        text:
                            `${socket.username || "User"} disconnected.`,

                        roomCode

                    }
                );


                emitUsers(
                    roomCode
                );


                /*
                 IMPORTANT:
                 DO NOT DELETE THE ROOM.

                 This allows a disconnected
                 browser to reconnect and
                 rejoin the same room.
                */

            }
        );

    }
);


/* ==========================================
   JOIN SOCKET
========================================== */

function joinRoomSocket(
    socket,
    room,
    username
) {

    socket.join(
        room.code
    );


    socket.roomCode =
        room.code;


    socket.username =
        username;


    room.users.set(
        socket.id,
        {

            id:
                socket.id,

            username

        }
    );

}


/* ==========================================
   LEAVE CURRENT ROOM
========================================== */

function leaveCurrentRoom(
    socket,
    announce = true
) {

    const roomCode =
        socket.roomCode;


    if (!roomCode) {
        return;
    }


    const room =
        rooms.get(
            roomCode
        );


    if (!room) {

        socket.roomCode = "";

        return;

    }


    room.users.delete(
        socket.id
    );


    socket.leave(
        roomCode
    );


    if (
        announce &&
        socket.username
    ) {

        socket.to(
            roomCode
        ).emit(
            "system-message",
            {

                text:
                    `${socket.username} left the room.`,

                roomCode

            }
        );

    }


    emitUsers(
        roomCode
    );


    socket.roomCode = "";

}


/* ==========================================
   HEALTH
========================================== */

app.get(
    "/health",
    (req, res) => {

        res.json({

            status: "ok",

            rooms:
                rooms.size,

            time:
                new Date()
                    .toISOString()

        });

    }
);


/* ==========================================
   START
========================================== */

server.listen(
    PORT,
    () => {

        console.log(
            `Chat17 running on port ${PORT}`
        );

    }
);