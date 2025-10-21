import { JwtPayload } from 'jsonwebtoken';
import { Server } from 'socket.io';

export interface CustomJwtPayload extends JwtPayload {
  userId: string;
  email: string;
  role: string;
}

declare global {
  var io: Server;
  namespace Express {
    interface Request {
      user: CustomJwtPayload;
    }
  }
  namespace NodeJS {
    interface Global {
      io: Server;
    }
  }
}

declare module 'express-xss-sanitizer' {
  import { RequestHandler } from 'express';
  export const xss: RequestHandler;
}

declare module 'xss-clean' {
  import { RequestHandler } from 'express';
  const xssClean: () => RequestHandler;
  export = xssClean;
}
