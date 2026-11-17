export interface CatalogPageQuery {
  limit: number;
  offset: number;
  search?: string;
  status?: string;
  visibleInPdv?: boolean;
  visibleInCardapio?: boolean;
  visibleInComanda?: boolean;
}

export interface CatalogPageResult<T> {
  data: T[];
  meta: {
    limit: number;
    offset: number;
    total: number;
  };
}
