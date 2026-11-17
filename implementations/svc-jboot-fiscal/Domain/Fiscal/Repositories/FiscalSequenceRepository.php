<?php

namespace Domain\Fiscal\Repositories;

use Illuminate\Support\Facades\DB;
use RuntimeException;

class FiscalSequenceRepository
{
    public function nextNumber(string $clientId, string $cnpjEmitente, string $tipoDocumento, int $serie, string $ambiente): int
    {
        if (DB::transactionLevel() === 0) {
            throw new RuntimeException('nextNumber() deve ser chamado dentro de DB::transaction()');
        }

        $row = DB::selectOne(
            'UPDATE fiscal_document_sequences
             SET ultimo_numero = ultimo_numero + 1, updated_at = now()
             WHERE client_id = ? AND cnpj_emitente = ? AND tipo_documento = ? AND serie = ? AND ambiente = ?
             RETURNING ultimo_numero',
            [$clientId, $cnpjEmitente, $tipoDocumento, $serie, $ambiente]
        );

        if (! $row) {
            throw new RuntimeException("Sequencia nao encontrada para {$tipoDocumento} serie {$serie}");
        }

        return (int) $row->ultimo_numero;
    }
}
