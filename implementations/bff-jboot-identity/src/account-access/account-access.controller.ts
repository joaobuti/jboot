import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AccountAccessService } from './account-access.service';
import { AccessTokenDto, ForgotPasswordDto, SetPasswordDto } from './dto/account-access.dto';

/** Rotas publicas do link de senha (docs/product/account-access-email-sprints.md). */
@ApiTags('auth-password')
@Controller('auth/password')
export class AccountAccessController {
  constructor(private readonly access: AccountAccessService) {}

  @Post('check')
  @HttpCode(200)
  check(@Body() dto: AccessTokenDto) {
    return this.access.check(dto.token);
  }

  @Post('set')
  @HttpCode(200)
  set(@Body() dto: SetPasswordDto, @Req() request: Request) {
    return this.access.setPassword(dto.token, dto.password, request.ip);
  }

  /** Sempre 202 com a mesma resposta, exista ou nao o login (sem revelar cadastro nem e-mail). */
  @Post('forgot')
  @HttpCode(202)
  forgot(@Body() dto: ForgotPasswordDto, @Req() request: Request) {
    return this.access.requestPasswordReset(dto.document, request.ip);
  }
}
