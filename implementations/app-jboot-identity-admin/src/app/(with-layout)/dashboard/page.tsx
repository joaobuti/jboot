"use client";

import React, { useEffect, useState } from "react";
import { Alert, Card, CardBody, Col, Container, Row, Spinner } from "reactstrap";
import { adminApi, AdminApplication, AdminClient } from "@/lib/admin-api";

const Dashboard = () => {
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [apps, setApps] = useState<AdminApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([adminApi.clients.list(), adminApi.applications.list()])
      .then(([clientRows, appRows]) => {
        setClients(clientRows);
        setApps(appRows);
      })
      .catch(err => setError(err instanceof Error ? err.message : "Falha ao carregar metricas"))
      .finally(() => setLoading(false));
  }, []);

  const activeClients = clients.filter(client => client.status === "active").length;
  const activeApps = apps.filter(app => app.status === "active").length;

  return (
    <div className="page-content">
      <Container fluid>
        <Row className="mb-3">
          <Col>
            <h4 className="mb-1">Dashboard</h4>
            <p className="text-muted mb-0">Metricas operacionais do Identity Hub.</p>
          </Col>
        </Row>

        {error ? <Alert color="danger">{error}</Alert> : null}
        {loading ? <Spinner /> : null}

        <Row>
          <Col xl={3} md={6}>
            <Card className="card-animate">
              <CardBody>
                <p className="text-uppercase fw-medium text-muted mb-0">Clientes ativos</p>
                <h2 className="mt-3 mb-0">{activeClients}</h2>
              </CardBody>
            </Card>
          </Col>
          <Col xl={3} md={6}>
            <Card className="card-animate">
              <CardBody>
                <p className="text-uppercase fw-medium text-muted mb-0">Clientes totais</p>
                <h2 className="mt-3 mb-0">{clients.length}</h2>
              </CardBody>
            </Card>
          </Col>
          <Col xl={3} md={6}>
            <Card className="card-animate">
              <CardBody>
                <p className="text-uppercase fw-medium text-muted mb-0">Apps ativos</p>
                <h2 className="mt-3 mb-0">{activeApps}</h2>
              </CardBody>
            </Card>
          </Col>
          <Col xl={3} md={6}>
            <Card className="card-animate">
              <CardBody>
                <p className="text-uppercase fw-medium text-muted mb-0">Apps totais</p>
                <h2 className="mt-3 mb-0">{apps.length}</h2>
              </CardBody>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default Dashboard;
