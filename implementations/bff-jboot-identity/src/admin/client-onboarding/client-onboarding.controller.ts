import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminRequest, AdminAuthGuard } from '../guards/admin-auth.guard';
import { buildMutateContext } from '../shared/admin-request-context';
import { ClientOnboardingService } from './client-onboarding.service';
import { CreateClientOnboardingDto } from './dto/client-onboarding.dto';

@ApiTags('admin-client-onboarding')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/client-onboarding')
export class ClientOnboardingController {
  constructor(private readonly onboarding: ClientOnboardingService) {}

  @Post()
  create(@Body() dto: CreateClientOnboardingDto, @Req() request: AdminRequest) {
    return this.onboarding.create(dto, buildMutateContext(request));
  }
}
