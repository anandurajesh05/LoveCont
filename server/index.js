const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, uuidv4() + path.extname(file.originalname)) // Append extension
    }
});
const upload = multer({ storage: storage });

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let waitingQueue = []; // socketId
let rooms = {}; // socketId -> roomId
let connectedUsers = {}; // socketId -> userId
let userSockets = {}; // userId -> socketId (most recent socket for a user)

// persist this to a file or DB in real app
let users = {};

// Upload Endpoint
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({ url: fileUrl, type: req.file.mimetype });
});

io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;
    const nickname = socket.handshake.query.nickname;
    const age = socket.handshake.query.age;
    const avatarSeed = socket.handshake.query.avatarSeed;

    console.log(`User Connected: ${socket.id} (User ID: ${userId})`);

    if (userId) {
        connectedUsers[socket.id] = userId;

        // Join a room with their own userId to allow multiple tabs/devices
        socket.join(userId);

        // Update or Create User Profile
        if (!users[userId]) {
            users[userId] = {
                id: userId,
                nickname: nickname || 'Anonymous',
                age: age || '?',
                avatarSeed: avatarSeed || 'unknown',
                friends: []
            };
        } else {
            // Update existing if provided (e.g. on re-login/edit)
            users[userId].friends = users[userId].friends || [];
            if (nickname) users[userId].nickname = nickname;
            if (age) users[userId].age = age;
            if (avatarSeed) users[userId].avatarSeed = avatarSeed;
        }

        // Keep track of latest socket for legacy/compat, but prefer room messaging
        userSockets[userId] = socket.id;
    }

    socket.on('update_profile', (data) => {
        const uid = connectedUsers[socket.id];
        if (uid && users[uid]) {
            users[uid] = { ...users[uid], ...data };
        }
    });

    socket.on('join_queue', () => {
        if (waitingQueue.includes(socket.id)) return;

        if (waitingQueue.length > 0) {
            const partnerSocketId = waitingQueue.pop();
            const roomId = uuidv4();

            socket.join(roomId);
            const partnerSocket = io.sockets.sockets.get(partnerSocketId);

            if (partnerSocket) {
                partnerSocket.join(roomId);

                rooms[socket.id] = roomId;
                rooms[partnerSocketId] = roomId;

                const myUserId = connectedUsers[socket.id];
                const partnerUserId = connectedUsers[partnerSocketId];

                io.to(roomId).emit('chat_start', { roomId });

                socket.emit('partner_info', {
                    partnerUserId,
                    nickname: users[partnerUserId]?.nickname || 'Stranger',
                    age: users[partnerUserId]?.age || '?',
                    avatarSeed: users[partnerUserId]?.avatarSeed || 'unknown'
                });

                partnerSocket.emit('partner_info', {
                    partnerUserId: myUserId,
                    nickname: users[myUserId]?.nickname || 'Stranger',
                    age: users[myUserId]?.age || '?',
                    avatarSeed: users[myUserId]?.avatarSeed || 'unknown'
                });

                console.log(`Matched ${socket.id} with ${partnerSocketId}`);
            } else {
                waitingQueue.push(socket.id);
            }
        } else {
            waitingQueue.push(socket.id);
        }
    });

    socket.on('send_message', (data, callback) => {
        const { toUserId } = data;

        if (toUserId) {
            // Direct Message (Friend) - Emit to the ROOM of toUserId
            io.to(toUserId).emit('receive_message', data);

            // Optional: emit to sender's other tabs if needed
            // socket.to(data.senderId).emit('receive_message', data);

            if (callback) callback({ status: 'sent' });
        } else {
            // Room Message (Stranger)
            const roomId = rooms[socket.id];
            if (roomId) {
                socket.to(roomId).emit('receive_message', data);
                if (callback) callback({ status: 'sent' });
            }
        }
    });

    socket.on('message_status_update', ({ msgId, status, toUserId }) => {
        if (toUserId) {
            io.to(toUserId).emit('message_status_update', { msgId, status });
        } else {
            const roomId = rooms[socket.id];
            if (roomId) {
                socket.to(roomId).emit('message_status_update', { msgId, status });
            }
        }
    });

    socket.on('next_partner', () => {
        const roomId = rooms[socket.id];
        if (roomId) {
            socket.to(roomId).emit('partner_disconnected');
            socket.leave(roomId);
            delete rooms[socket.id];
            // Also cleanup partner
            // In a real app check if partner is still in room
        }
    });

    socket.on('disconnect', () => {
        console.log('User Disconnected', socket.id);
        // Remove from waiting queue if present
        waitingQueue = waitingQueue.filter(id => id !== socket.id);

        const roomId = rooms[socket.id];
        if (roomId) {
            socket.to(roomId).emit('partner_disconnected');
            delete rooms[socket.id];
        }

        // Clean up connectedUsers? Maybe keep for reconnection?
        // For this simple app, we just leave it. 
        // userSockets[userId] might be stale
    });

    // Friend Request Logic
    socket.on('send_friend_request', ({ toUserId }) => {
        const fromUserId = connectedUsers[socket.id];
        if (!fromUserId || !toUserId) return;

        // Check if already friends
        if (users[fromUserId].friends.includes(toUserId)) return;

        // Emit to target user ROOM
        io.to(toUserId).emit('incoming_friend_request', {
            fromUserId,
            nickname: users[fromUserId].nickname,
            avatarSeed: users[fromUserId].avatarSeed
        });
    });

    socket.on('respond_friend_request', ({ fromUserId, accepted }) => {
        const myId = connectedUsers[socket.id];

        if (accepted) {
            if (!users[myId].friends.includes(fromUserId)) users[myId].friends.push(fromUserId);
            if (!users[fromUserId].friends.includes(myId)) users[fromUserId].friends.push(myId);

            // Notify requester via ROOM
            io.to(fromUserId).emit('friend_request_accepted', {
                friendId: myId,
                nickname: users[myId].nickname,
                avatarSeed: users[myId].avatarSeed
            });

            // Notify acceptor (self) - usually handled by client, but good to confirm
            socket.emit('friend_added', {
                friendId: fromUserId,
                nickname: users[fromUserId].nickname,
                avatarSeed: users[fromUserId].avatarSeed
            });
        }
    });

    socket.on('remove_friend', ({ friendId }) => {
        const myId = connectedUsers[socket.id];
        if (myId && users[myId]) {
            users[myId].friends = users[myId].friends.filter(id => id !== friendId);
        }
        if (friendId && users[friendId]) {
            users[friendId].friends = users[friendId].friends.filter(id => id !== myId);
        }

        // Notify both users via ROOMS
        io.to(myId).emit('friend_removed', { friendId });
        io.to(friendId).emit('friend_removed', { friendId: myId });
    });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
