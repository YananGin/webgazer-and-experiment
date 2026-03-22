const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 存储连接的客户端
const connections = {
    subjects: {}, // 被试连接
    admins: {}    // 主试连接
};

// 服务静态文件
app.use(express.static(path.join(__dirname)));

// 主页路由 - 根据参数决定是被试还是主试界面
app.get('/', (req, res) => {
    const role = req.query.role;
    if (role === 'admin') {
        res.sendFile(path.join(__dirname, 'admin_panel.html'));
    } else {
        res.sendFile(path.join(__dirname, 'subject_interface.html'));
    }
});

// Socket.IO 连接处理
io.on('connection', (socket) => {
    console.log('新客户端连接:', socket.id);

    // 被试连接
    socket.on('subject_connect', (subjectId, emotionGroup) => {
        socket.subjectId = subjectId;
        connections.subjects[subjectId] = socket.id;
        
        console.log(`被试 ${subjectId} (${emotionGroup}) 已连接`);
        
        // 通知所有主试有新被试连接
        io.emit('new_subject_connected', { subjectId, emotionGroup, socketId: socket.id });
    });

    // 主试连接
    socket.on('admin_connect', (adminId) => {
        connections.admins[adminId] = socket.id;
        console.log(`主试 ${adminId} 已连接`);
        
        // 发送当前所有被试列表
        const subjectList = Object.keys(connections.subjects).map(subjectId => ({
            subjectId,
            connected: connections.subjects[subjectId] !== undefined
        }));
        socket.emit('subject_list_update', subjectList);
    });

    // 被试发送消息
    socket.on('subject_message', (data) => {
        console.log(`被试消息:`, data);
        
        // 转发给所有主试
        io.emit('admin_receive_message', {
            subjectId: data.subjectId,
            message: data.message,
            timestamp: data.timestamp
        });
    });

    // 主试发送AI回复
    socket.on('admin_send_ai_response', (data) => {
        console.log(`AI回复:`, data);
        
        const targetSocketId = connections.subjects[data.subjectId];
        if (targetSocketId) {
            io.to(targetSocketId).emit('ai_response', {
                message: data.message,
                timestamp: data.timestamp
            });
        }
    });

    // 被试发送眼动数据
    socket.on('subject_gaze_data', (data) => {
        // 转发给相关主试
        io.emit('gaze_data_update', {
            subjectId: data.subjectId,
            gazeData: data.gazeData,
            stage: data.stage
        });
    });

    // 被试发送评分
    socket.on('subject_rating', (data) => {
        // 转发给相关主试
        io.emit('rating_update', {
            subjectId: data.subjectId,
            ratings: data.ratings
        });
    });

    // 断开连接
    socket.on('disconnect', () => {
        console.log('客户端断开连接:', socket.id);
        
        // 检查是否是被试断开
        for (let [subjectId, socketId] of Object.entries(connections.subjects)) {
            if (socketId === socket.id) {
                delete connections.subjects[subjectId];
                io.emit('subject_disconnected', { subjectId, socketId });
                break;
            }
        }
        
        // 检查是否是主试断开
        for (let [adminId, socketId] of Object.entries(connections.admins)) {
            if (socketId === socket.id) {
                delete connections.admins[adminId];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
});