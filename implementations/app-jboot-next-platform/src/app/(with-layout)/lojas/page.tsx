"use client";

import { PdvAdminPage } from "@/modules/pdv/components/PdvAdminPage";
import { PdvStockLocation, pdvApi } from "@/modules/pdv/lib/pdv-api";

export default function LojasPage() {
  return (
    <PdvAdminPage<PdvStockLocation>
      title="Lojas"
      subtitle="Lojas e filiais da sua operação. A Loja Matriz é criada automaticamente ao contratar o módulo."
      columns={[
        { key: "name", label: "Nome" },
        { key: "type", label: "Tipo", render: (row) => ({ store: "Loja", warehouse: "Depósito", virtual: "Virtual" }[row.type] ?? row.type) },
        { key: "isMatriz", label: "Matriz", render: (row) => row.isMatriz ? "✓" : "—" },
        { key: "cnpj", label: "CNPJ", render: (row) => row.cnpj ?? "—" },
        { key: "addressCity", label: "Cidade", render: (row) => row.addressCity ? `${row.addressCity}/${row.addressState ?? ""}` : "—" },
        { key: "status", label: "Status" }
      ]}
      fields={[
        { name: "name", label: "Nome", section: "Identificação", required: true },
        {
          name: "type",
          label: "Tipo",
          section: "Identificação",
          type: "select",
          required: true,
          options: [
            { label: "Loja", value: "store" },
            { label: "Depósito", value: "warehouse" },
            { label: "Virtual", value: "virtual" }
          ]
        },
        { name: "cnpj", label: "CNPJ", section: "Dados Fiscais" },
        { name: "ie", label: "Inscrição Estadual", section: "Dados Fiscais" },
        {
          name: "addressZip",
          label: "CEP",
          section: "Endereço",
          type: "cep",
          cepMapping: {
            street: "addressStreet",
            neighborhood: "addressNeighborhood",
            city: "addressCity",
            state: "addressState",
            ibgeCode: "addressIbgeCode"
          }
        },
        { name: "addressStreet", label: "Logradouro", section: "Endereço" },
        { name: "addressNumber", label: "Número", section: "Endereço" },
        { name: "addressComplement", label: "Complemento", section: "Endereço" },
        { name: "addressNeighborhood", label: "Bairro", section: "Endereço" },
        { name: "addressCity", label: "Município", section: "Endereço" },
        { name: "addressState", label: "UF", section: "Endereço" },
        { name: "addressIbgeCode", label: "Cód. IBGE", section: "Endereço" }
      ]}
      load={pdvApi.stockLocations.list}
      create={pdvApi.stockLocations.create}
      update={pdvApi.stockLocations.update}
    />
  );
}
