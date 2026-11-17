import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { PlatformFilesRepository } from './platform-files.repository';
import { PlatformFilesService } from './platform-files.service';
import { PlatformFilesStorage } from './platform-files.storage';

@Module({
  providers: [AppConfigService, PlatformFilesRepository, PlatformFilesService, PlatformFilesStorage],
  exports: [PlatformFilesService]
})
export class PlatformFilesModule {}
