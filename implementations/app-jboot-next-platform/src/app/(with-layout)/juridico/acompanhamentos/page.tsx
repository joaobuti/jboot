"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Form, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Spinner, Table } from "reactstrap";
import { DataJudMonitor, DataJudMonitorCadence, DataJudMonitorMovement, juridicoApi } from "@/modules/juridico/lib/juridico-api";

const cadenceLabels: Record<DataJudMonitorCadence, string> = { daily: "Diário", weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal" };

export default function JuridicoMonitorsPage() {
  const [items, setItems] = useState<DataJudMonitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processNumber, setProcessNumber] = useState("");
  const [tribunal, setTribunal] = useState("");
  const [cadence, setCadence] = useState<DataJudMonitorCadence>("daily");
  const [history, setHistory] = useState<DataJudMonitorMovement[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await juridicoApi.datajud.listMonitors()); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar acompanhamentos."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(null);
    try {
      await juridicoApi.datajud.createMonitor({ processNumber, tribunal: tribunal || undefined, cadence });
      setOpen(false); setProcessNumber(""); setTribunal(""); setCadence("daily"); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível criar acompanhamento."); }
    finally { setSaving(false); }
  }

  async function toggle(item: DataJudMonitor) {
    try { await juridicoApi.datajud.updateMonitor(item.id, { state: item.state === "active" ? "paused" : "active" }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível atualizar acompanhamento."); }
  }

  async function remove(item: DataJudMonitor) {
    if (!window.confirm("Excluir este acompanhamento? Os dados serão eliminados definitivamente após 180 dias.")) return;
    try { await juridicoApi.datajud.deleteMonitor(item.id); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível excluir acompanhamento."); }
  }

  async function showHistory(item: DataJudMonitor) {
    try { setHistory(await juridicoApi.datajud.listMonitorMovements(item.id)); setHistoryOpen(true); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar histórico."); }
  }

  return <div className="page-content"><div className="container-fluid">
    <Card><CardHeader className="d-flex align-items-center justify-content-between"><div><h4 className="card-title mb-1">Acompanhamentos <span className="badge bg-info-subtle text-info align-middle fs-13 ms-1">DataJud</span></h4><p className="text-muted mb-0 small">Consultas feitas na base pública do DataJud/CNJ, com histórico e retenção limitada.</p></div><Button color="primary" onClick={() => setOpen(true)}><i className="ri-add-line me-1" />Novo acompanhamento</Button></CardHeader>
      <CardBody>{error && <Alert color="danger">{error}</Alert>}{loading ? <div className="text-center py-5"><Spinner color="primary" /></div> : items.length === 0 ? <p className="text-muted mb-0">Nenhum processo em acompanhamento.</p> : <Table responsive hover className="table-nowrap mb-0"><thead className="table-light"><tr><th>Tribunal</th><th>Cadência</th><th>Status</th><th>Última verificação</th><th>Próxima</th><th className="text-end">Ações</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.tribunal ?? "Auto"}</td><td>{cadenceLabels[item.cadence]}</td><td><Badge color={item.state === "active" ? "success" : "warning"}>{item.state === "active" ? "Ativo" : "Pausado"}</Badge></td><td>{item.lastCheckedAt ? new Date(item.lastCheckedAt).toLocaleString("pt-BR") : "Ainda não verificado"}</td><td>{item.nextCheckAt ? new Date(item.nextCheckAt).toLocaleString("pt-BR") : "—"}</td><td className="text-end"><Button size="sm" color="light" onClick={() => void showHistory(item)}>Histórico</Button><Button size="sm" color="light" className="ms-2" onClick={() => void toggle(item)}>{item.state === "active" ? "Pausar" : "Retomar"}</Button><Button size="sm" color="link" className="text-danger ms-2" onClick={() => void remove(item)}>Excluir</Button></td></tr>)}</tbody></Table>}</CardBody></Card>
    <Modal isOpen={open} toggle={() => setOpen(false)} centered><Form onSubmit={(event) => void submit(event)}><ModalHeader toggle={() => setOpen(false)}>Novo acompanhamento</ModalHeader><ModalBody><p className="text-muted small">O processo será acompanhado até pausa ou exclusão. Após isso, os dados são eliminados em 180 dias.</p><FormGroup><Label>Número do processo <span className="text-danger">*</span></Label><Input required value={processNumber} onChange={(e) => setProcessNumber(e.target.value)} /></FormGroup><FormGroup><Label>Tribunal</Label><Input value={tribunal} onChange={(e) => setTribunal(e.target.value.toUpperCase())} /></FormGroup><FormGroup><Label>Cadência <span className="text-danger">*</span></Label><Input type="select" value={cadence} onChange={(e) => setCadence(e.target.value as DataJudMonitorCadence)}>{Object.entries(cadenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Input></FormGroup></ModalBody><ModalFooter><Button color="light" onClick={() => setOpen(false)}>Cancelar</Button><Button color="primary" type="submit" disabled={saving}>{saving && <Spinner size="sm" className="me-1" />}Salvar</Button></ModalFooter></Form></Modal>
    <Modal isOpen={historyOpen} toggle={() => setHistoryOpen(false)} centered><ModalHeader toggle={() => setHistoryOpen(false)}>Novas movimentações detectadas</ModalHeader><ModalBody>{history.length === 0 ? <p className="text-muted mb-0">Nenhuma movimentação nova detectada ainda.</p> : history.map((movement) => <div className="border-bottom py-2" key={movement.id}><div>{movement.description}</div><small className="text-muted">{new Date(movement.occurredAt ?? movement.detectedAt).toLocaleString("pt-BR")}</small></div>)}</ModalBody><ModalFooter><Button color="light" onClick={() => setHistoryOpen(false)}>Fechar</Button></ModalFooter></Modal>
  </div></div>;
}
