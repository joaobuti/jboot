"use client";

import { useEffect, useState } from "react";
import { PdvAdminPage } from "@/modules/pdv/components/PdvAdminPage";
import { CatalogCategory, catalogApi } from "@/modules/pdv/lib/catalog-api";

export default function CategoriesPage() {
  const [parentOptions, setParentOptions] = useState<Array<{ label: string; value: string }>>([]);

  useEffect(() => {
    let active = true;
    catalogApi.categories
      .list({ limit: 200, offset: 0, status: "active" })
      .then((result) => {
        if (active) setParentOptions(result.data.map((c) => ({ label: c.name, value: c.id })));
      })
      .catch(() => { if (active) setParentOptions([]); });
    return () => { active = false; };
  }, []);

  return (
    <PdvAdminPage<CatalogCategory>
      title="Categorias"
      subtitle="Categorias do catálogo compartilhado — usadas em PDV, Cardápio Digital e Comanda."
      columns={[
        { key: "name", label: "Nome" },
        { key: "slug", label: "Slug" },
        { key: "description", label: "Descrição" },
        { key: "visibleInComanda", label: "Comanda", render: (row) => row.visibleInComanda ? "✓" : "—" },
        { key: "status", label: "Status" }
      ]}
      fields={[
        { name: "name", label: "Nome", section: "Identificação", required: true },
        {
          name: "parentId",
          label: "Categoria pai",
          section: "Hierarquia",
          type: "select",
          placeholder: "Categoria raiz",
          options: parentOptions
        },
        { name: "description", label: "Descrição", section: "Detalhes", colMd: 12 },
        {
          name: "visibleInComanda",
          label: "Visível na Comanda",
          section: "Visibilidade",
          type: "checkbox"
        }
      ]}
      load={(params) => catalogApi.categories.list(params)}
      create={catalogApi.categories.create}
      update={catalogApi.categories.update}
      remove={catalogApi.categories.remove}
    />
  );
}
