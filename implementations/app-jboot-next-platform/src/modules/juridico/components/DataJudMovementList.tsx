import { Card, CardBody, Table } from "reactstrap";
import type { DataJudMovement } from "../lib/juridico-api";

export default function DataJudMovementList({ movements }: { movements: DataJudMovement[] }) {
  // A vara do movimento so vira coluna quando o processo tramitou em mais de
  // uma: no caso comum (vara unica) ela repetiria o orgao julgador da capa.
  const courts = new Set(movements.map((item) => item.orgaoJulgador?.nome).filter(Boolean));
  const showCourt = courts.size > 1;
  return (
    <Card>
      <CardBody>
        <h5 className="card-title">Movimentações</h5>
        {movements.length === 0 ? <p className="text-muted mb-0">Nenhuma movimentação informada.</p> : (
          <div className="table-responsive">
            <Table className="align-middle mb-0">
              <thead><tr><th>Data</th><th>Movimentação</th>{showCourt ? <th>Vara</th> : null}<th>Complementos</th></tr></thead>
              <tbody>{movements.map((movement, index) => (
                <tr key={`${movement.codigo ?? "sem-codigo"}-${movement.dataHora ?? index}`}>
                  <td className="text-nowrap">{movement.dataHora ? new Date(movement.dataHora).toLocaleString("pt-BR") : "Não informada"}</td>
                  <td>{movement.nome}</td>
                  {showCourt ? <td>{movement.orgaoJulgador?.nome || "—"}</td> : null}
                  <td>{movement.complementos.map((item) => item.descricao || item.valor || item.nome).filter(Boolean).join(" · ") || "—"}</td>
                </tr>
              ))}</tbody>
            </Table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
