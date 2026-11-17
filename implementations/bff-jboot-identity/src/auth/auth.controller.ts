import { Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { getRequestContext } from '../shared/request-context';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ServiceTokenDto } from './dto/service-token.dto';
import { SelectContextDto } from './dto/select-context.dto';
import { SwitchContextDto } from './dto/switch-context.dto';
import { ServiceTokenService } from './service-token.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly serviceTokens: ServiceTokenService,
  ) {}

  @Post('service-token')
  serviceToken(@Body() dto: ServiceTokenDto, @Req() request: Request) {
    return this.serviceTokens.issue(dto, request.ip ?? 'unknown');
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.auth.login({
      document: dto.document,
      password: dto.password,
      deviceRef: dto.deviceRef,
      request: getRequestContext(request)
    });
  }

  @Post('context')
  selectContext(@Body() dto: SelectContextDto, @Req() request: Request) {
    return this.auth.selectContext({
      loginTicket: dto.loginTicket,
      clientId: dto.clientId,
      applicationId: dto.applicationId,
      request: getRequestContext(request)
    });
  }

  @Get('me/applications')
  listMyApplications(@Req() request: Request) {
    const header = request.get('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    return this.auth.listApplicationsForToken(token);
  }

  @Post('me/context')
  switchContext(@Body() dto: SwitchContextDto, @Req() request: Request) {
    const header = request.get('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    return this.auth.switchContext({
      accessToken: token,
      clientId: dto.clientId,
      applicationId: dto.applicationId,
      deviceRef: dto.deviceRef,
      request: getRequestContext(request)
    });
  }
}
