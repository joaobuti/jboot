import { Body,Controller,Delete,Get,Param,ParseUUIDPipe,Patch,Post,UseGuards } from '@nestjs/common';
import { ApiBearerAuth,ApiTags } from '@nestjs/swagger';
import { AuthContext,CurrentAuth } from '../../auth/auth-context';
import { UserAuthGuard } from '../../auth/user-auth.guard';
import { RequiredScopes } from '../../auth/required-scopes.decorator';
import { CreateAgentDto,UpdateAgentDto } from './agent.dto';
import { AgentService } from './agent.service';
@ApiTags('agents') @ApiBearerAuth() @UseGuards(UserAuthGuard) @RequiredScopes('ai:agents:manage') @Controller('v1/agents')
export class AgentController{constructor(private readonly service:AgentService){} @Get()list(@CurrentAuth()a:AuthContext){return this.service.list(a)} @Post()create(@CurrentAuth()a:AuthContext,@Body()b:CreateAgentDto){return this.service.create(a,b)} @Patch(':agentId')update(@CurrentAuth()a:AuthContext,@Param('agentId',ParseUUIDPipe)id:string,@Body()b:UpdateAgentDto){return this.service.update(a,id,b)} @Delete(':agentId')remove(@CurrentAuth()a:AuthContext,@Param('agentId',ParseUUIDPipe)id:string){return this.service.remove(a,id)}}
