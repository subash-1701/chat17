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

/*
 * Active WebRTC calls.
 * The server relays only signalling messages; microphone audio stays
 * peer-to-peer between the two browsers.
 */
const activeCalls = new Map();

function findSocketById(id) {
    return id ? io.sockets.sockets.get(id) : null;
}

function emitCallHistory(call, status, duration = 0) {
    if (!call) return;
    const room = rooms.get(call.roomCode);
    if (!room) return;

    const base = {
        id: `call-${call.callId}-${Date.now()}`,
        type: "call-history",
        callId: call.callId,
        roomCode: call.roomCode,
        username: call.callerUsername,
        senderUsername: call.callerUsername,
        message: status === "missed" ? "Missed call" : "Audio call",
        time: new Date().toISOString(),
        status,
        duration: Math.max(0, Math.floor(duration / 1000))
    };

    const saved = { ...base };
    room.messages.push(saved);
    if (room.messages.length > 200) room.messages = room.messages.slice(-200);

    const caller = findSocketById(call.callerSocketId);
    const callee = findSocketById(call.calleeSocketId);

    if (caller) caller.emit("call-history", { ...base, direction: "outgoing" });
    if (callee) callee.emit("call-history", { ...base, direction: "incoming" });
}

function findSocketsByUsername(username) {
    const target = cleanName(username).toLowerCase();
    if (!target) return [];

    return Array.from(io.sockets.sockets.values()).filter(
        candidate =>
            cleanName(candidate.username).toLowerCase() === target
    );
}

function emitCallToSocket(socketId, event, payload) {
    const target = findSocketById(socketId);
    if (target) {
        target.emit(event, payload);
        return true;
    }
    return false;
}

function endActiveCall(callId, event = "call-ended", extra = {}) {
    const call = activeCalls.get(callId);
    if (!call) return;

    const payload = { callId, ...extra };

    if (call.callerSocketId) {
        emitCallToSocket(call.callerSocketId, event, payload);
    }

    if (call.calleeSocketId) {
        emitCallToSocket(call.calleeSocketId, event, payload);
    }

    activeCalls.delete(callId);
}


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
           TYPING INDICATOR
           WhatsApp-style real-time typing state.
        ================================== */

        socket.on(
            "typing-start",
            () => {

                if (!socket.roomCode || !socket.username) {
                    return;
                }

                const room = rooms.get(socket.roomCode);

                if (!room) {
                    return;
                }

                socket.to(socket.roomCode).emit(
                    "user-typing",
                    {
                        roomCode: socket.roomCode,
                        username: socket.username
                    }
                );
            }
        );

        socket.on(
            "typing-stop",
            () => {

                if (!socket.roomCode || !socket.username) {
                    return;
                }

                socket.to(socket.roomCode).emit(
                    "user-stopped-typing",
                    {
                        roomCode: socket.roomCode,
                        username: socket.username
                    }
                );
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

                // Send the new authoritative last-message preview to every
                // participant so the chat list never shows a deleted message.
                const latestMessage = room.messages.length
                    ? room.messages[room.messages.length - 1]
                    : null;

                io.to(roomCode).emit("message-deleted", {
                    roomCode,
                    messageId,
                    lastMessage: latestMessage
                        ? `${latestMessage.username || latestMessage.senderUsername || "User"}: ${latestMessage.message || ""}`
                        : "",
                    lastMessageTime: latestMessage?.time || ""
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
           REAL-TIME AUDIO CALL SIGNALING
        ================================== */

        socket.on("call-user", (data, callback) => {
            data = data || {};

            const callerUsername = cleanName(socket.username || data.callerUsername);
            const targetUsername = cleanName(data.targetUsername);
            const roomCode = cleanRoomCode(data.roomCode || socket.roomCode);
            const callId = String(data.callId || "").trim().slice(0, 100);
            const room = rooms.get(roomCode);

            if (!callerUsername || !targetUsername || !callId || !room || socket.roomCode !== roomCode) {
                if (typeof callback === "function") callback({
                    success: false,
                    message: "Unable to start the call. The room is unavailable."
                });
                return;
            }

            if (callerUsername.toLowerCase() === targetUsername.toLowerCase()) {
                if (typeof callback === "function") callback({
                    success: false,
                    message: "You cannot call yourself."
                });
                return;
            }

            // Find the target only inside the current room. This prevents a user
            // in another room from receiving the call.
            const targets = Array.from(io.sockets.sockets.values()).filter(candidate =>
                candidate.id !== socket.id &&
                candidate.roomCode === roomCode &&
                cleanName(candidate.username).toLowerCase() === targetUsername.toLowerCase()
            );

            if (!targets.length) {
                if (typeof callback === "function") callback({
                    success: false,
                    message: `${targetUsername} is offline.`
                });
                return;
            }

            // One person can have multiple tabs. Pick the first tab that is not
            // already in a call; otherwise report the user as busy.
            const target = targets.find(candidate => {
                for (const call of activeCalls.values()) {
                    if (call.callerSocketId === candidate.id || call.calleeSocketId === candidate.id) {
                        return false;
                    }
                }
                return true;
            });

            if (!target) {
                if (typeof callback === "function") callback({
                    success: false,
                    message: `${targetUsername} is already on another call.`
                });
                return;
            }

            // Prevent duplicate call IDs.
            if (activeCalls.has(callId)) {
                if (typeof callback === "function") callback({
                    success: false,
                    message: "This call is already being started."
                });
                return;
            }

            const call = {
                callId,
                roomCode,
                callerSocketId: socket.id,
                callerUsername,
                calleeSocketId: target.id,
                calleeUsername: cleanName(target.username),
                status: "ringing",
                createdAt: Date.now()
            };

            activeCalls.set(callId, call);

            target.emit("call-incoming", {
                callId,
                roomCode,
                callerUsername,
                callerSocketId: socket.id
            });

            if (typeof callback === "function") callback({
                success: true,
                callId,
                targetUsername: call.calleeUsername
            });
        });

        socket.on("call-accept", (data, callback) => {
            const callId = String(data?.callId || "").trim();
            const call = activeCalls.get(callId);

            if (!call || call.calleeSocketId !== socket.id || call.status !== "ringing") {
                if (typeof callback === "function") callback({
                    success: false,
                    message: "This call is no longer available."
                });
                return;
            }

            call.status = "accepted";
            call.acceptedAt = Date.now();

            const caller = findSocketById(call.callerSocketId);
            if (!caller) {
                activeCalls.delete(callId);
                if (typeof callback === "function") callback({
                    success: false,
                    message: "The caller has disconnected."
                });
                return;
            }

            caller.emit("call-accepted", {
                callId,
                calleeUsername: call.calleeUsername
            });

            if (typeof callback === "function") callback({ success: true, callId });
        });

        socket.on("call-reject", (data) => {
            const callId = String(data?.callId || "").trim();
            const call = activeCalls.get(callId);
            if (!call) return;

            if (socket.id !== call.calleeSocketId && socket.id !== call.callerSocketId) return;

            const caller = findSocketById(call.callerSocketId);
            if (caller) {
                caller.emit("call-rejected", {
                    callId,
                    by: socket.username || call.calleeUsername
                });
            }

            emitCallHistory(call, "declined", 0);
            activeCalls.delete(callId);
        });

        socket.on("call-offer", (data) => {
            const callId = String(data?.callId || "").trim();
            const call = activeCalls.get(callId);
            if (!call || call.callerSocketId !== socket.id || !data?.offer) return;

            const callee = findSocketById(call.calleeSocketId);
            if (!callee) return;

            callee.emit("call-offer", {
                callId,
                offer: data.offer
            });
        });

        socket.on("call-answer", (data) => {
            const callId = String(data?.callId || "").trim();
            const call = activeCalls.get(callId);
            if (!call || call.calleeSocketId !== socket.id || !data?.answer) return;

            const caller = findSocketById(call.callerSocketId);
            if (!caller) return;

            caller.emit("call-answer", {
                callId,
                answer: data.answer
            });
        });

        socket.on("call-ice", (data) => {
            const callId = String(data?.callId || "").trim();
            const call = activeCalls.get(callId);
            if (!call || !data?.candidate) return;

            let targetSocketId = null;
            if (socket.id === call.callerSocketId) {
                targetSocketId = call.calleeSocketId;
            } else if (socket.id === call.calleeSocketId) {
                targetSocketId = call.callerSocketId;
            } else {
                return;
            }

            const target = findSocketById(targetSocketId);
            if (target) {
                target.emit("call-ice", {
                    callId,
                    candidate: data.candidate
                });
            }
        });

        socket.on("call-end", (data) => {
            const callId = String(data?.callId || "").trim();
            const call = activeCalls.get(callId);
            if (!call) return;

            if (socket.id !== call.callerSocketId && socket.id !== call.calleeSocketId) return;

            const otherSocketId = socket.id === call.callerSocketId
                ? call.calleeSocketId
                : call.callerSocketId;

            const other = findSocketById(otherSocketId);
            if (other) {
                other.emit("call-ended", {
                    callId,
                    by: socket.username || "User"
                });
            }

            const duration = call.acceptedAt ? Date.now() - call.acceptedAt : 0;
            emitCallHistory(call, call.status === "accepted" ? "answered" : "missed", duration);
            activeCalls.delete(callId);
        });

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

                // End any audio call owned by this socket.
                for (const [callId, call] of activeCalls.entries()) {
                    if (
                        call.callerSocketId === socket.id ||
                        call.calleeSocketId === socket.id
                    ) {
                        endActiveCall(callId, "call-ended", {
                            by: socket.username || "User"
                        });

                        for (const target of findSocketsByUsername(call.calleeUsername)) {
                            target.emit("call-ended", {
                                callId,
                                by: socket.username || "User"
                            });
                        }
                    }
                }


                const roomCode =
                    socket.roomCode;


                // Clear the typing indicator for everyone in the room.
                if (roomCode && socket.username) {
                    socket.to(roomCode).emit(
                        "user-stopped-typing",
                        {
                            roomCode,
                            username: socket.username
                        }
                    );
                }


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