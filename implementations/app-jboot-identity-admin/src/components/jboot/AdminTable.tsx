"use client";

import React from "react";
import { Button, Input, Table } from "reactstrap";

export interface AdminColumn<T> {
  key: keyof T | string;
  label: string;
  render?: (item: T) => React.ReactNode;
}

interface AdminTableProps<T extends { id: string }> {
  columns: AdminColumn<T>[];
  data: T[];
  search: string;
  onSearch: (value: string) => void;
  onAdd: () => void;
  onEdit: (item: T) => void;
  onRemove: (item: T) => void;
}

export function AdminTable<T extends { id: string }>({
  columns,
  data,
  search,
  onSearch,
  onAdd,
  onEdit,
  onRemove,
}: AdminTableProps<T>) {
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = normalizedSearch
    ? data.filter(item => JSON.stringify(item).toLowerCase().includes(normalizedSearch))
    : data;

  return (
    <>
      <div className="d-flex gap-2 mb-4">
        <div className="search-box flex-grow-1">
          <Input
            value={search}
            onChange={event => onSearch(event.target.value)}
            placeholder="Buscar..."
          />
          <i className="ri-search-line search-icon"></i>
        </div>
        <Button color="success" onClick={onAdd}>
          <i className="ri-add-line align-bottom me-1"></i>
          Adicionar
        </Button>
      </div>

      <div className="table-responsive table-card">
        <Table className="align-middle table-nowrap mb-0">
          <thead className="table-light">
            <tr>
              {columns.map(column => (
                <th key={String(column.key)}>{column.label}</th>
              ))}
              <th style={{ width: 120 }}>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id}>
                {columns.map(column => (
                  <td key={String(column.key)}>
                    {column.render ? column.render(item) : String(item[column.key as keyof T] ?? "")}
                  </td>
                ))}
                <td>
                  <div className="d-flex gap-2">
                    <Button size="sm" color="soft-primary" onClick={() => onEdit(item)}>
                      Editar
                    </Button>
                    <Button size="sm" color="soft-danger" onClick={() => onRemove(item)}>
                      Remover
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="text-center text-muted py-4">
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </div>
    </>
  );
}
