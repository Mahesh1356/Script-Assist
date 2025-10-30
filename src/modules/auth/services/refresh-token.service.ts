import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RefreshTokenPayload } from '../interfaces/auth.interface';

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateRefreshToken(userId: string): string {
    const payload: RefreshTokenPayload = { sub: userId, type: 'refresh' };
    return this.jwtService.sign(payload, {
      expiresIn: this.configService.get('jwt.refreshExpiresIn'),
      secret: this.configService.get('jwt.refreshSecret'),
    });
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    return this.jwtService.verify(token, {
      secret: this.configService.get('jwt.refreshSecret'),
    });
  }

  decodeRefreshToken(token: string): RefreshTokenPayload | null {
    try {
      return this.jwtService.decode(token) as RefreshTokenPayload;
    } catch {
      return null;
    }
  }

  isRefreshTokenValid(token: string): boolean {
    try {
      this.verifyRefreshToken(token);
      return true;
    } catch {
      return false;
    }
  }

  getRefreshTokenExpiration(token: string): Date | null {
    try {
      const decoded = this.decodeRefreshToken(token);
      return decoded?.exp ? new Date(decoded.exp * 1000) : null;
    } catch {
      return null;
    }
  }

  isRefreshTokenExpired(token: string): boolean {
    const expiration = this.getRefreshTokenExpiration(token);
    return expiration ? expiration < new Date() : true;
  }
}
