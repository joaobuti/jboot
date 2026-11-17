import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { JuridicoAuthGuard, JuridicoRequest } from '../shared/juridico-auth.guard';
import { EprocSessionService } from './eproc-session.service';

class Submit2FADto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

class StartEprocSetupDto {
  @IsOptional()
  @IsString()
  preferredProfile?: string;
}

class SelectProfileDto {
  @IsString()
  sigla!: string;
}

class RunEprocConsultationsDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/)
  cpf?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_-]+$/)
  portalSlug?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(250)
  queryRuns?: number;
}

@ApiTags('juridico-eproc')
@ApiBearerAuth()
@UseGuards(JuridicoAuthGuard)
@Controller('juridico/eproc')
export class EprocSessionController {
  constructor(private readonly service: EprocSessionService) {}

  @Get('session')
  getSession(@Req() req: JuridicoRequest) {
    return this.service.getSessionStatus(req.juridicoContext);
  }

  @Post('setup')
  startSetup(@Req() req: JuridicoRequest, @Body() body: StartEprocSetupDto) {
    return this.service.startSetup(req.juridicoContext, body.preferredProfile);
  }

  @Get('setup/:setupId/status')
  getSetupStatus(@Param('setupId') setupId: string) {
    return this.service.getSetupStatus(setupId);
  }

  @Post('setup/:setupId/2fa')
  submit2fa(@Param('setupId') setupId: string, @Body() body: Submit2FADto) {
    return this.service.submit2fa(setupId, body.code);
  }

  @Post('setup/:setupId/profile')
  selectProfile(@Param('setupId') setupId: string, @Body() body: SelectProfileDto) {
    return this.service.selectProfile(setupId, body.sigla);
  }

  @Post('run-consultations')
  runConsultations(@Req() req: JuridicoRequest, @Body() body: RunEprocConsultationsDto) {
    return this.service.runPendingConsultations(req.juridicoContext, {
      cpf: body.cpf,
      keyword: body.keyword,
      portalSlug: body.portalSlug,
      queryRuns: body.queryRuns,
    });
  }

  @Get('query-jobs/active/current')
  getActiveQueryJob(@Req() req: JuridicoRequest) {
    return this.service.getActiveQueryJobStatus(req.juridicoContext);
  }

  @Get('query-jobs/:jobId')
  getQueryJob(@Req() req: JuridicoRequest, @Param('jobId') jobId: string) {
    return this.service.getQueryJobStatus(req.juridicoContext, jobId);
  }

  @Post('query-jobs/:jobId/cancel')
  cancelQueryJob(@Req() req: JuridicoRequest, @Param('jobId') jobId: string) {
    return this.service.cancelQueryJob(req.juridicoContext, jobId);
  }
}
