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


    return Array.from(
        room.users.values()
    );

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
                        room.name,

                    owner:
                        room.owner,

                    messages:
                        room.messages

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
                        room.name,

                    owner:
                        room.owner,

                    messages:
                        room.messages

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
                        room.name,

                    owner:
                        room.owner,

                    messages:
                        room.messages

                });


                emitUsers(
                    roomCode
                );

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

                if (!username || room.owner !== username) {
                    if (typeof callback === "function") callback({ success: false, message: "Only the room creator can rename this room." });
                    return;
                }

                if (!roomName) {
                    if (typeof callback === "function") callback({ success: false, message: "Room name is required." });
                    return;
                }

                room.name = roomName;

                io.to(roomCode).emit("room-renamed", {
                    roomCode,
                    roomName,
                    owner: room.owner
                });

                callback({
                    success: true,
                    roomCode,
                    roomName,
                    owner: room.owner
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
            message => {

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


                message =
                    String(
                        message || ""
                    )
                        .trim()
                        .slice(
                            0,
                            2000
                        );


                if (!message) {
                    return;
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
                            .toISOString()

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