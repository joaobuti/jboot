import { BadRequestException, Injectable } from '@nestjs/common';
import { PlatformFilesService } from '../../platform-files/platform-files.service';
import { PlatformUploadedFile } from '../../platform-files/platform-files.types';
import { CatalogPageQuery } from '../catalog.types';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { CatalogProductsRepository, ProductRow } from './products.repository';

const QUEUE_TYPE_REQUIRED_ERROR = {
  code: 'queue_type_required',
  message: 'queueType e obrigatorio quando visibleInComanda=true'
};

@Injectable()
export class CatalogProductsService {
  constructor(
    private readonly repository: CatalogProductsRepository,
    private readonly files: PlatformFilesService
  ) {}

  async list(clientId: string, query: CatalogPageQuery) {
    const page = await this.repository.list(clientId, query);
    return {
      ...page,
      data: await this.withImageUrls(clientId, page.data)
    };
  }

  async create(clientId: string, dto: CreateProductDto, identityId: string) {
    if (dto.visibleInComanda === true && !dto.queueType) {
      throw new BadRequestException(QUEUE_TYPE_REQUIRED_ERROR);
    }
    const product = await this.repository.create(clientId, dto, identityId);
    return (await this.withImageUrls(clientId, [product]))[0];
  }

  async update(clientId: string, id: string, dto: UpdateProductDto) {
    await this.assertQueueTypeValid(clientId, id, dto);
    const product = await this.repository.update(clientId, id, dto);
    return (await this.withImageUrls(clientId, [product]))[0];
  }

  async uploadImage(clientId: string, id: string, identityId: string, file: PlatformUploadedFile | undefined) {
    await this.repository.findById(clientId, id);
    const storedFile = await this.files.upload(
      {
        clientId,
        sourceModule: 'catalog',
        sourceEntityType: 'catalog_product',
        sourceEntityId: id,
        usage: 'product_image',
        uploadedByIdentityId: identityId
      },
      file
    );
    const product = await this.repository.updateImageFileId(clientId, id, storedFile.id);
    return (await this.withImageUrls(clientId, [product]))[0];
  }

  /**
   * Valida a regra "visibleInComanda=true exige queueType" considerando o
   * estado final apos o merge do PATCH — nao so o payload isolado. So busca
   * o registro atual quando o payload por si so nao permite decidir (ou seja,
   * quando queueType nao veio no payload e visibleInComanda pode terminar
   * true, seja explicito ou herdado do valor atual).
   */
  private async assertQueueTypeValid(clientId: string, id: string, dto: UpdateProductDto): Promise<void> {
    if (dto.queueType) return;
    if (dto.visibleInComanda === false) return;

    const current = await this.repository.findById(clientId, id);
    const effectiveVisibleInComanda = dto.visibleInComanda ?? current.visibleInComanda;
    const effectiveQueueType = dto.queueType ?? current.queueType;

    if (effectiveVisibleInComanda === true && !effectiveQueueType) {
      throw new BadRequestException(QUEUE_TYPE_REQUIRED_ERROR);
    }
  }

  private async withImageUrls<T extends Omit<ProductRow, 'total'>>(clientId: string, products: T[]) {
    const urlMap = await this.files.getSignedDownloadUrlMap(clientId, products.map((product) => product.imageFileId));
    return products.map((product) => ({
      ...product,
      imageUrl: product.imageFileId ? urlMap.get(product.imageFileId)?.url ?? null : null
    }));
  }
}
