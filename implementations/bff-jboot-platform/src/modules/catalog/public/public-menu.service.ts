import { Injectable } from '@nestjs/common';
import { PlatformFilesService } from '../../platform-files/platform-files.service';
import { PublicMenuRepository } from './public-menu.repository';
import { PublicMenuCategory, PublicMenuProduct, PublicMenuResponse } from './public-menu.types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PublicMenuService {
  constructor(
    private readonly repository: PublicMenuRepository,
    private readonly files: PlatformFilesService
  ) {}

  /**
   * Endpoint publico e anonimo (sem JWT) — nunca deve vazar se um clientId
   * existe ou nao, nem se o tenant tem a flag `autoatendimento_comanda`
   * desligada. Toda saida negativa (client_id invalido, tenant sem flag,
   * tenant inexistente) converge para o mesmo cardapio vazio com 200.
   */
  async getMenu(clientId: string): Promise<PublicMenuResponse> {
    if (!UUID_PATTERN.test(clientId)) {
      return this.emptyMenu();
    }

    const enabled = await this.repository.isComandaAutoatendimentoEnabled(clientId);
    if (!enabled) {
      return this.emptyMenu();
    }

    const [categories, products] = await Promise.all([
      this.repository.findVisibleCategories(clientId),
      this.repository.findVisibleProducts(clientId)
    ]);
    const imageUrlMap = await this.files.getSignedDownloadUrlMap(clientId, products.map((product) => product.imageFileId));

    const productsByCategory = new Map<string, PublicMenuProduct[]>();
    const uncategorized: PublicMenuProduct[] = [];

    for (const product of products) {
      const item: PublicMenuProduct = {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        queueType: product.queueType,
        imageUrl: product.imageFileId ? imageUrlMap.get(product.imageFileId)?.url ?? null : null
      };
      if (product.categoryId === null) {
        uncategorized.push(item);
        continue;
      }
      const list = productsByCategory.get(product.categoryId) ?? [];
      list.push(item);
      productsByCategory.set(product.categoryId, list);
    }

    const categoriesWithProducts: PublicMenuCategory[] = categories.map((category) => ({
      id: category.id,
      name: category.name,
      products: productsByCategory.get(category.id) ?? []
    }));

    return {
      categories: categoriesWithProducts,
      uncategorized: { name: 'Outros', products: uncategorized }
    };
  }

  private emptyMenu(): PublicMenuResponse {
    return { categories: [], uncategorized: { name: 'Outros', products: [] } };
  }
}
