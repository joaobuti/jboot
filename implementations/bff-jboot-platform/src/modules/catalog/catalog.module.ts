import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { PlatformFilesModule } from '../platform-files/platform-files.module';
import { CatalogCategoriesController } from './categories/categories.controller';
import { CatalogCategoriesRepository } from './categories/categories.repository';
import { CatalogCategoriesService } from './categories/categories.service';
import { PublicMenuController } from './public/public-menu.controller';
import { PublicMenuRepository } from './public/public-menu.repository';
import { PublicMenuService } from './public/public-menu.service';
import { CatalogProductsController } from './products/products.controller';
import { CatalogProductsRepository } from './products/products.repository';
import { CatalogProductsService } from './products/products.service';

@Module({
  imports: [PlatformFilesModule],
  controllers: [CatalogCategoriesController, CatalogProductsController, PublicMenuController],
  providers: [
    AppConfigService,
    CatalogCategoriesRepository,
    CatalogCategoriesService,
    CatalogProductsRepository,
    CatalogProductsService,
    PublicMenuRepository,
    PublicMenuService
  ]
})
export class CatalogModule {}
