"use client";

import React from "react";
// import Image from "next/image"; // usado so pelo logo comentado abaixo
// import Link from "next/link"; // usado so pelo logo comentado abaixo
import { Card, CardBody, Col, Container, Row } from "reactstrap";
import ParticlesAuth from "@/app/(with-nonlayout)/auth/ParticlesAuth";

// const logoLight = "/images/logo-light.png"; // usado so pelo logo comentado abaixo

/** Moldura das telas publicas de conta, igual a do login (GlobalLogin). */
export default function AuthCardShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <ParticlesAuth>
      <div className="auth-page-content mt-lg-5">
        <Container>
          <Row>
            <Col lg={12}>
              <div className="text-center mt-sm-5 mb-4 text-white-50">
                {/* Logo oculto por decisao do usuario (2026-11-11); comentado, nao removido.
                <Link href="/login" className="d-inline-block auth-logo">
                  <Image src={logoLight} alt="JBoot" height={20} width={120} />
                </Link>
                */}
                <p className="mt-3 fs-15 fw-medium">Identity Hub</p>
              </div>
            </Col>
          </Row>
          <Row className="justify-content-center">
            <Col md={8} lg={6} xl={5}>
              <Card className="mt-4 card-bg-fill">
                <CardBody className="p-4">
                  <div className="text-center mt-2">
                    <h5 className="text-primary">{title}</h5>
                    {subtitle ? (
                      <p className="text-muted mb-0">{subtitle}</p>
                    ) : null}
                  </div>
                  <div className="p-2 mt-4">{children}</div>
                </CardBody>
              </Card>
            </Col>
          </Row>
        </Container>
      </div>
    </ParticlesAuth>
  );
}
