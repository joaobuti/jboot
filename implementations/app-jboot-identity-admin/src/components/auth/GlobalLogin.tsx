"use client";

import React, { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  Col,
  Container,
  Form,
  FormFeedback,
  Input,
  Label,
  Row,
  Spinner,
} from "reactstrap";
import Cookies from "js-cookie";
// import Image from "next/image"; // usado so pelo logo comentado abaixo
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ParticlesAuth from "@/app/(with-nonlayout)/auth/ParticlesAuth";
import {
  IdentityContextSelectionError,
  IdentityDestination,
  IdentitySelection,
  IdentitySession,
  isExternalUrl,
  isIdentitySelection,
  listIdentityApplications,
  loginIdentity,
  resolveConsentReturnUrl,
  resolvePostLoginUrl,
  selectIdentityDestination,
  switchIdentityDestination,
} from "@/lib/jboot-identity";

// const logoLight = "/images/logo-light.png"; // usado so pelo logo comentado abaixo

const appIconBySlug: Record<string, string> = {
  "identity-admin": "ri-shield-keyhole-line",
  pdv: "ri-shopping-bag-3-line",
  juridico: "ri-scales-3-line",
  flow: "ri-trello-line",
};

// Slugs com cookie dedicado proprio (alem do "accessToken"/"authUser"
// genericos), usado por modulos cujo cliente le um cookie fixo por nome
// (ex: pdv-api.ts le "pdvAccessToken", no app-jboot-next-platform). Manter
// em sincronia com MODULE_DEDICATED_COOKIES em
// app-jboot-next-platform/src/lib/identity-applications.ts.
const MODULE_DEDICATED_COOKIES: Record<string, string> = {
  pdv: "pdvAccessToken",
  juridico: "juridicoAccessToken",
};

// Escopo de dominio dos cookies de sessao. Sem isso, cookies setados aqui
// (admin.jboot.com.br) ficam presos a esse subdominio exato -- invisiveis
// em app.jboot.com.br apos o redirect pos-login, causando "Missing bearer
// token" la (confirmado em producao em 2026-08-22: login e selecao de app
// acontecem em admin.jboot.com.br, mas o destino real e um subdominio
// diferente). Em dev (localhost, sem NEXT_PUBLIC_COOKIE_DOMAIN definido),
// fica undefined e o js-cookie usa o host atual -- comportamento inalterado,
// ja que localhost:3000/3002 compartilham cookie por padrao (mesmo host,
// so porta diferente).
const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;

function persistSession(session: IdentitySession) {
  Cookies.set("authUser", JSON.stringify(session), { expires: 1, sameSite: "strict", domain: COOKIE_DOMAIN });
  Cookies.set("accessToken", session.accessToken, { expires: 1, sameSite: "strict", domain: COOKIE_DOMAIN });
  Object.values(MODULE_DEDICATED_COOKIES).forEach((cookieName) =>
    Cookies.remove(cookieName, { domain: COOKIE_DOMAIN })
  );

  const dedicatedCookie = MODULE_DEDICATED_COOKIES[session.destination.applicationSlug];
  if (dedicatedCookie) {
    Cookies.set(dedicatedCookie, session.accessToken, { expires: 1, sameSite: "strict", domain: COOKIE_DOMAIN });
  }
}

const DEV_PASSWORD = "Jboot@123";

export default function GlobalLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldOpenAppSelection = searchParams.get("apps") === "1";
  const returnTo = searchParams.get("returnTo");
  const [document, setDocument] = useState("000.000.001-91");
  const [password, setPassword] = useState(DEV_PASSWORD);
  const [passwordShow, setPasswordShow] = useState(false);
  const [loader, setLoader] = useState(false);
  const [selectingApp, setSelectingApp] = useState("");
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<IdentitySelection | null>(null);

  useEffect(() => {
    if (!shouldOpenAppSelection) {
      return;
    }

    const authUser = Cookies.get("authUser");
    const accessToken = Cookies.get("accessToken");
    if (!authUser || !accessToken) {
      return;
    }

    let active = true;
    setLoader(true);
    setError("");

    const loadApplications = async () => {
      try {
        const session = JSON.parse(authUser) as IdentitySession;
        const destinations = await listIdentityApplications(accessToken);
        if (!active) {
          return;
        }

        setSelection({
          selectionRequired: true,
          identity: session.identity,
          expiresIn: session.expiresIn,
          destinations,
        });
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Falha ao carregar aplicacoes");
        }
      } finally {
        if (active) {
          setLoader(false);
        }
      }
    };

    void loadApplications();

    return () => {
      active = false;
    };
  }, [shouldOpenAppSelection]);

  const openSession = (session: IdentitySession) => {
    persistSession(session);

    const targetUrl =
      resolveConsentReturnUrl(session, returnTo) ??
      resolvePostLoginUrl(session);
    if (isExternalUrl(targetUrl)) {
      window.location.assign(targetUrl);
    } else {
      router.push(targetUrl);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSelection(null);
    setLoader(true);

    try {
      const result = await loginIdentity(document, password);
      if (isIdentitySelection(result)) {
        setSelection(result);
        return;
      }

      openSession(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao autenticar");
    } finally {
      setLoader(false);
    }
  };

  const handleDestinationSelect = async (destination: IdentityDestination) => {
    if (!selection) {
      return;
    }

    setError("");
    setSelectingApp(destination.applicationId);

    try {
      const accessToken = Cookies.get("accessToken");
      const session = selection.loginTicket
        ? await selectIdentityDestination({
            identity: selection.identity,
            loginTicket: selection.loginTicket,
            destination,
          })
        : await switchIdentityDestination({
            identity: selection.identity,
            accessToken: accessToken ?? "",
            destination,
          });

      openSession(session);
    } catch (err) {
      if (err instanceof IdentityContextSelectionError && err.status === 401) {
        setSelection(null);
      }
      setError(err instanceof Error ? err.message : "Falha ao selecionar acesso");
    } finally {
      setSelectingApp("");
    }
  };

  const resetSelection = () => {
    setSelection(null);
    setError("");
    setSelectingApp("");
  };

  return (
    <ParticlesAuth>
      <div className="auth-page-content mt-lg-5">
        <Container>
          <Row>
            <Col lg={12}>
              <div className="text-center mt-sm-5 mb-4 text-white-50">
                {/* Logo oculto por decisao do usuario (2026-11-11); comentado, nao removido.
                <Link href="/" className="d-inline-block auth-logo">
                  <Image src={logoLight} alt="JBoot" height={20} width={120} />
                </Link>
                */}
                <p className="mt-3 fs-15 fw-medium">Identity Hub</p>
              </div>
            </Col>
          </Row>

          <Row className="justify-content-center">
            <Col md={selection ? 10 : 8} lg={selection ? 9 : 6} xl={selection ? 8 : 5}>
              <Card className="mt-4 card-bg-fill">
                <CardBody className="p-4">
                  <div className="text-center mt-2">
                    <h5 className="text-primary">
                      {selection ? "Escolha onde deseja entrar" : "JBoot Identity Admin"}
                    </h5>
                    <p className="text-muted mb-0">
                      {selection
                        ? `${selection.identity.displayName} possui acesso a mais de uma aplicacao`
                        : "Acesso administrativo global"}
                    </p>
                  </div>

                  {error ? <Alert color="danger" className="mt-4">{error}</Alert> : null}

                  {selection ? (
                    <div className="p-2 mt-4">
                      <Row className="g-3">
                        {selection.destinations
                          .filter((destination) => destination.applicationSlug !== "platform")
                          .map((destination) => {
                          const icon = appIconBySlug[destination.applicationSlug] ?? "ri-apps-2-line";
                          const isLoading = selectingApp === destination.applicationId;
                          return (
                            <Col md={6} xl={4} key={`${destination.clientId}:${destination.applicationId}`}>
                              <div className="h-100 border rounded-2 p-3 d-flex flex-column">
                                <div className="d-flex align-items-start gap-3 mb-3">
                                  <div className="avatar-sm flex-shrink-0">
                                    <span className="avatar-title rounded bg-primary-subtle text-primary fs-3">
                                      <i className={icon} />
                                    </span>
                                  </div>
                                  <div className="flex-grow-1">
                                    <h6 className="mb-1">{destination.applicationName}</h6>
                                    <p className="text-muted mb-0 small">{destination.clientName}</p>
                                  </div>
                                </div>

                                <div className="d-flex flex-wrap gap-1 mb-3">
                                  {destination.roles.slice(0, 2).map((role) => (
                                    <Badge color="secondary" pill key={role}>{role}</Badge>
                                  ))}
                                </div>

                                <p className="text-muted small mb-3">
                                  {destination.launchUrl ?? "Acesso pelo painel Identity"}
                                </p>

                                <Button
                                  color="success"
                                  className="mt-auto w-100"
                                  disabled={Boolean(selectingApp)}
                                  onClick={() => handleDestinationSelect(destination)}
                                >
                                  {isLoading ? <Spinner size="sm" className="me-2">Entrando...</Spinner> : null}
                                  Entrar
                                </Button>
                              </div>
                            </Col>
                          );
                        })}
                      </Row>

                      <div className="text-center mt-4">
                        <Button color="link" className="text-muted" type="button" onClick={resetSelection}>
                          Usar outro login
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2 mt-4">
                    <Form onSubmit={handleSubmit}>
                      <div className="mb-3">
                        <Label htmlFor="document" className="form-label">CPF/CNPJ</Label>
                        <Input
                          id="document"
                          name="document"
                          className="form-control"
                          placeholder="000.000.001-91"
                          value={document}
                          onChange={event => setDocument(event.target.value)}
                          invalid={!document}
                          autoComplete="username"
                        />
                        {!document ? <FormFeedback type="invalid">Informe o CPF/CNPJ</FormFeedback> : null}
                      </div>

                      <div className="mb-3">
                        <div className="float-end">
                          <Link href="/esqueci-senha" className="text-muted">Esqueci minha senha</Link>
                        </div>
                        <Label className="form-label" htmlFor="password-input">Senha</Label>
                        <div className="position-relative auth-pass-inputgroup mb-3">
                          <Input
                            id="password-input"
                            name="password"
                            value={password}
                            type={passwordShow ? "text" : "password"}
                            className="form-control pe-5"
                            placeholder="Senha"
                            onChange={event => setPassword(event.target.value)}
                            invalid={!password}
                            autoComplete="current-password"
                          />
                          {!password ? <FormFeedback type="invalid">Informe a senha</FormFeedback> : null}
                          <button
                            className="btn btn-link position-absolute end-0 top-0 text-decoration-none text-muted"
                            type="button"
                            id="password-addon"
                            onClick={() => setPasswordShow(!passwordShow)}
                          >
                            <i className="ri-eye-fill align-middle" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-4">
                        <Button color="success" disabled={loader} className="w-100" type="submit">
                          {loader ? <Spinner size="sm" className="me-2">Entrando...</Spinner> : null}
                          Entrar
                        </Button>
                      </div>
                    </Form>
                  </div>
                  )}
                </CardBody>
              </Card>
            </Col>
          </Row>
        </Container>
      </div>
    </ParticlesAuth>
  );
}
