import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BrandingController } from './branding.controller';
import { BrandingRepository } from './branding.repository';
import { BrandingService } from './branding.service';
import { LayoutPreferenceController } from './layout-preference.controller';
import { LayoutPreferenceRepository } from './layout-preference.repository';
import { LayoutPreferenceService } from './layout-preference.service';

@Module({
  imports: [AuthModule],
  controllers: [BrandingController, LayoutPreferenceController],
  providers: [BrandingRepository, BrandingService, LayoutPreferenceRepository, LayoutPreferenceService]
})
export class PreferencesModule {}
