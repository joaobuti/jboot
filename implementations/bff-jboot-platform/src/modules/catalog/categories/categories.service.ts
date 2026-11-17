import { Injectable } from '@nestjs/common';
import { CatalogPageQuery } from '../catalog.types';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CatalogCategoriesRepository } from './categories.repository';

@Injectable()
export class CatalogCategoriesService {
  constructor(private readonly repository: CatalogCategoriesRepository) {}

  list(clientId: string, query: CatalogPageQuery) {
    return this.repository.list(clientId, query);
  }

  create(clientId: string, dto: CreateCategoryDto) {
    return this.repository.create(clientId, dto);
  }

  update(clientId: string, id: string, dto: UpdateCategoryDto) {
    return this.repository.update(clientId, id, dto);
  }
}
