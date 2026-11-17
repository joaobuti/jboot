"use client";

import { PdvAdminPage } from "@/modules/pdv/components/PdvAdminPage";
import { PdvCustomer, pdvApi } from "@/modules/pdv/lib/pdv-api";

const UF_OPTIONS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
].map((uf) => ({ value: uf, label: uf }));

export default function CustomersPage() {
  return (
    <PdvAdminPage<PdvCustomer>
      title="Clientes"
      subtitle="Clientes finais do tenant usados em venda, histórico e emissão de NF-e/NFC-e."
      columns={[
        { key: "name", label: "Nome / Razão Social" },
        { key: "documentNumber", label: "CPF / CNPJ" },
        { key: "email", label: "E-mail" },
        { key: "phone", label: "Telefone" },
        { key: "status", label: "Status" }
      ]}
      fields={[
        // Identificação
        { name: "name",           label: "Nome / Razão Social",  section: "Identificação", required: true },
        { name: "documentNumber", label: "CPF / CNPJ",           section: "Identificação" },

        // Fiscal
        { name: "indIeDest", label: "Indicador IE", section: "Fiscal",
          type: "select", colMd: 4,
          options: [
            { value: "9", label: "9 — Não contribuinte" },
            { value: "1", label: "1 — Contribuinte ICMS" },
            { value: "2", label: "2 — Contribuinte isento" }
          ]
        },
        { name: "ie", label: "Inscrição Estadual", section: "Fiscal", colMd: 4 },

        // Contato
        { name: "email", label: "E-mail",    section: "Contato" },
        { name: "phone", label: "Telefone",  section: "Contato" },

        // Endereço — obrigatório para NFe
        { name: "addressZip",          label: "CEP",           section: "Endereço", colMd: 3,
          type: "cep",
          cepMapping: {
            street:       "addressStreet",
            neighborhood: "addressNeighborhood",
            city:         "addressCity",
            state:        "addressState",
            ibgeCode:     "addressIbgeCode",
            complement:   "addressComplement"
          }
        },
        { name: "addressStreet",       label: "Logradouro",    section: "Endereço", colMd: 7 },
        { name: "addressNumber",       label: "Número",        section: "Endereço", colMd: 2 },
        { name: "addressComplement",   label: "Complemento",   section: "Endereço", colMd: 4 },
        { name: "addressNeighborhood", label: "Bairro",        section: "Endereço", colMd: 4 },
        { name: "addressCity",         label: "Cidade",        section: "Endereço", colMd: 6 },
        { name: "addressState",        label: "UF",            section: "Endereço", colMd: 2,
          type: "select", options: UF_OPTIONS },
        { name: "addressIbgeCode",     label: "Código IBGE",   section: "Endereço", colMd: 4 }
      ]}
      load={(params) => pdvApi.customers.list(params)}
      create={pdvApi.customers.create}
      update={pdvApi.customers.update}
      remove={pdvApi.customers.remove}
    />
  );
}
