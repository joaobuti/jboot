import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentAuth, AuthContext } from '../../auth/auth-context';
import { UserAuthGuard } from '../../auth/user-auth.guard';
import { RequiredScopes } from '../../auth/required-scopes.decorator';
import { UpsertCredentialDto } from './credential.dto';
import { CredentialService } from './credential.service';

@ApiTags('credentials') @ApiBearerAuth() @UseGuards(UserAuthGuard) @RequiredScopes('ai:credentials:manage') @Controller('v1/credentials')
export class CredentialController {
  constructor(private readonly service: CredentialService) {}
  @Get() list(@CurrentAuth() auth: AuthContext) { return this.service.list(auth); }
  @Post() upsert(@CurrentAuth() auth: AuthContext, @Body() body: UpsertCredentialDto) { return this.service.upsert(auth, body); }
  @Post(':credentialId/test') test(@CurrentAuth() auth: AuthContext, @Param('credentialId', ParseUUIDPipe) id: string) { return this.service.test(auth, id); }
  @Get(':credentialId/models') @RequiredScopes('ai:agents:manage') models(@CurrentAuth() auth: AuthContext, @Param('credentialId', ParseUUIDPipe) id: string) { return this.service.models(auth, id); }
  @Delete(':credentialId') revoke(@CurrentAuth() auth: AuthContext, @Param('credentialId', ParseUUIDPipe) id: string) { return this.service.revoke(auth, id); }
}
