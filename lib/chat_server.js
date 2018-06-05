var socketio = require('socket.io');
var io;
var guestNumber = 1;
var nickNames = {};
var namesUsed = {};
var currentRoom = {};

exports.listen = function (server) {
    io = socketio.listen(server);                                                                       
    io.set('log level', 1);
    // 每个用户连接的处理逻辑
    io.sockets.on('connection', function (socket) {
        // 赋予一个访客名
        guestNumber = assignGuestName(socket, guestNumber, nickNames, namesUsed);
        // 放入聊天室Lobby里
        joinRoom(socket, 'Lobby');
        // 处理用户的消息，更名，以及聊天室的创建和变更
        handleMessageBroadcasting(socket, nickNames);
        // 
        handleNameChangeAttempts(socket, nickNames, namesUsed);
        //  
        handleRoomJoining(socket);

        socket.on('rooms', function () {
            socket.emit('rooms', io.sockets.manager.rooms);
        });
        // 用户断开连接后的清除逻辑
        handleClientDisconnection(socket, nickNames, namesUsed);
    });
}

// 分配昵称
function assignGuestName (socket, guestNumber, nickNames, namesUsed) {
    // 生成新昵称
    var name = 'Guest' + guestNumber;
    // 关联用户昵称和客户端ID连接上
    nickNames[socket.id] = name;
    // 让用户知道他们的昵称
    socket.emit('nameResult', {
        success: true,
        name: name
    });
    // 增加用来生成昵称的计数器
    namesUsed.push(name);

    return guestNumber + 1;
}

// 进入聊天室
function joinRoom (socket, room) {
    // 让用户进入房间
    socket.join(room);
    // 记录用户的当前房间
    currentRoom[socket.id] = room;
    // 
    socket.emit('joinResult', {
        room: room
    });
    // 让房间里的其他用户知道有新用户进入了房间
    socket.broadcast.to(room).emit('message', {
        text: nickNames[socket.id] + 'has joined' + room + '.'
    });
    // 
    var usersInRoom = io.sockets.clients(room);
    if(usersInRoom.length > 1) {
        var usersInRoomSummary = 'Users currently in' + room + ': ';
        for(var index in usersInRoom) {
            var userSocketId = usersInRoom[index].id;
            if(userSocketId != socket.id) {
                if(index > 0) {
                    usersInRoomSummary += ', ';
                }
                usersInRoomSummary += nickNames[userSocketId];
            }
        }
        usersInRoomSummary += '.';
        socket.emit('message', {
            text: usersInRoomSummary
        });
    }
}

// 处理昵称变更请求
function handleNameChangeAttempts(sockets, nickNames, namesUsed) {
    // 添加nameAttempt事件监听器
    socket.on('nameAttempt', function (name) {
        // 昵称不能以Guest开头
        if(name.indexOf('Guest') == 0) {
            socket.emit('nameResult', {
                success: false,
                message: 'Names cannot begin with "Guest".' 
            });
        }else {
            // 如果昵称还没注册就注册上
            if(namesUsed.indexOf(name) == 1) {
                var previousName = nickNames[socket.id];
                var previousNameIndex = namesUsed.indexOf(previousName);

                namesUsed.push(name);
                nickNames[socket.id] = name;
                delete namesUsed[previousNameIndex];    // 删掉之前用的昵称，让其他用户可以使用

                socket.emit('nameResult', {
                    success: true,
                    name: name
                });

                socket.broadcast.to(currentRoom[socket.id]).emit('message', {
                    text: previousName + ' is now known as ' + name + '.'
                });
            }else {
                // 如果昵称已经被占用，给客户端发送错误消息
                socket.emit('nameResult', {
                    success: false,
                    message: 'That name is already in use.'
                });
            }
        }
    });
}

// 发送聊天消息
function handleMessageBroadcasting(socket) {
    socket.on('message', function (message) {
        // 广播用户发送的消息
        socekt.broadcast.to(message.room).emit('message', {
            text: nickNames[socket.id] + '：' + message.text 
        });
    });
}

// 创建房间
function handleRoomJoining(socket) {
    socket.on('join', function (room) {
        socket.leave(currentRoom[socket.id]);
        joinRoom(socket, room.newRoom);
    })
}

// 用户断开连接
function handleClientDisconnection (socket) {
    socket.on('disconnect', function () {
        var nameIndex = namesUsed.indexOf(nickNames[socket.id]);
        delete namesUsed[nameIndex];
        delete nickNames[socket.id];
    });
}