import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { SafeUser, UsersService } from '../users/users.service';
import { AuthCookieService, REFRESH_TOKEN_COOKIE } from './auth-cookie.service';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import type { AuthenticatedUser } from './types/authenticated-user.type';

// Never the whole SafeUser (which also carries cpf/phone/monthlyIncome/
// address) — the session response only needs enough to greet the user.
interface AuthResponseUser {
  id: string;
  name: string;
  email: string;
}

function toAuthResponseUser(user: SafeUser): AuthResponseUser {
  return { id: user.id, name: user.name, email: user.email };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authCookieService: AuthCookieService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseUser> {
    const session = await this.authService.login(dto);
    this.authCookieService.setSessionCookies(response, session);
    return toAuthResponseUser(session.user);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseUser> {
    const oldRefreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE] as
      | string
      | undefined;

    if (!oldRefreshToken) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid session, please log in again',
      });
    }

    const session = await this.authService.refresh(oldRefreshToken);
    this.authCookieService.setSessionCookies(response, session);
    return toAuthResponseUser(session.user);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const oldRefreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE] as
      | string
      | undefined;

    if (oldRefreshToken) {
      await this.authService.logout(oldRefreshToken);
    }

    this.authCookieService.clearSessionCookies(response);
  }

  @Get('me')
  async me(
    @CurrentUser() authenticatedUser: AuthenticatedUser,
  ): Promise<AuthResponseUser> {
    const user = await this.usersService.findById(authenticatedUser.id);
    if (!user) throw new NotFoundException();

    return toAuthResponseUser(user);
  }
}
