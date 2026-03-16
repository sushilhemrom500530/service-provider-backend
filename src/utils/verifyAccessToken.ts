import jwt from 'jsonwebtoken';

export interface DecodedAccessToken {
  userId: string;
  email: string;
  role: string;
}

// Ensure the secret exists
if (!process.env.JWT_ACCESS_SECRET) {
  throw new Error('JWT_ACCESS_SECRET is not defined in environment variables');
}
export const JWT_ACCESS_SECRET: string = process.env.JWT_ACCESS_SECRET;

export const verifyAccessToken = (token: string): DecodedAccessToken | null => {
  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as any;
    console.log('Decoded token:', decoded);
    // Support tokens with 'id' as userId
    const userId = decoded.userId || decoded.id;

    if (userId && decoded.email && decoded.role) {
      return {
        userId,
        email: decoded.email,
        role: decoded.role,
      };
    }

    return null;
  } catch (error) {
    console.error('Invalid token:', error);
    return null;
  }
};
