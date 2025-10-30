import { Server, Socket } from 'socket.io';

export const userSocketMap: Record<string, string> = {};  

export const socketHelper = {
  socket(io: Server) {
    io.on('connection', (socket: Socket) => {
      const userId = socket.handshake.query.userId as string;

      if (userId) {
        userSocketMap[userId] = socket.id;
      }

      io.emit('getOnlineUsers', Object.keys(userSocketMap));

      // 🔹 Handle call request
      socket.on('callUser', ({ to, from, signal, type }) => {
        const targetSocketId = userSocketMap[to];
        if (targetSocketId) {
          io.to(targetSocketId).emit('incomingCall', { from, signal, type });
        }
      });

      // 🔹 Handle call answer
      socket.on('answerCall', ({ to, signal }) => {
        const targetSocketId = userSocketMap[to];
        if (targetSocketId) {
          io.to(targetSocketId).emit('callAccepted', { signal });
        }
      });

      // 🔹 Handle call end
      socket.on('endCall', ({ to }) => {
        const targetSocketId = userSocketMap[to];
        if (targetSocketId) {
          io.to(targetSocketId).emit('callEnded');
        }
      });

      // 🔹 Handle disconnect
      socket.on('disconnect', () => {
        if (userId) delete userSocketMap[userId];
        io.emit('getOnlineUsers', Object.keys(userSocketMap));
      });
    });
  },
};
