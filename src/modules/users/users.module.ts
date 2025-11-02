import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { RateLimitGuard } from '@common/guards/rate-limit.guard';
import { CacheService } from '@common/services/cache.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), forwardRef(() => AuthModule)],
  controllers: [UsersController],
  providers: [UsersService, RateLimitGuard, CacheService],
  exports: [UsersService],
})
export class UsersModule {}
