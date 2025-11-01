import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy';
import { TokenService } from './services/token.service';
import { RefreshTokenService } from './services/refresh-token.service';
import { UsersModule } from '../users/users.module';
import { RateLimitGuard } from '@common/guards/rate-limit.guard';
import { CacheService } from '@common/services/cache.service';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('jwt.secret'),
        signOptions: {
          expiresIn: configService.get('jwt.expiresIn'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RefreshTokenStrategy,
    TokenService,
    RefreshTokenService,
    RateLimitGuard,
    CacheService,
  ],
  exports: [AuthService, TokenService, RefreshTokenService],
})
export class AuthModule {}
