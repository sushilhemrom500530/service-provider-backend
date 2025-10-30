import { Socket } from 'socket.io';
import { User } from '../../modules/user/user.model';
import { TokenService } from '../../modules/token/token.services';
import { config } from '../../config';
import { Secret } from 'jsonwebtoken';
import { TokenType } from '../../modules/token/token.interface';

export const socketAuthMiddleware = async (socket: Socket, next: any) => {
  try {
    const token =
      socket.handshake.auth.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
      socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    // Verify token
    const verifiedUser = await TokenService.verifyToken(
      token as string,
      config.jwt.accessSecret as Secret,
      TokenType.ACCESS
    );

    if (!verifiedUser) {
      return next(new Error('Invalid authentication token'));
    }

    // Check user status
    const user = await User.findById(verifiedUser.userId);
    if (!user || user.status !== 'Active') {
      return next(new Error('User account is not active'));
    }

    // Attach user info to socket
    socket.userId = verifiedUser.userId;
    socket.userEmail = verifiedUser.email;
    socket.userRole = verifiedUser.role;
    socket.isAuthenticated = true;
    socket.data.user = user;

    next();
  } catch (error: any) {
    next(new Error(error?.message || 'Authentication failed'));
  }
};
