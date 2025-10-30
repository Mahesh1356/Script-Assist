import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET || 'your-secret-key',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
  expiresIn: process.env.JWT_EXPIRATION || '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d',
}));
