import React, { useEffect, useState } from "react";
import {
  Col,
  UncontrolledDropdown,
  DropdownMenu,
  DropdownToggle,
  Row,
} from "reactstrap";
import Link from "next/link";
import {
  getIdentitySelectionUrl,
  IdentityDestination,
  listIdentityApplications,
  persistSwitchedIdentityContext,
  resolveDestinationLaunchUrl,
  switchIdentityApplication,
} from "@/lib/identity-applications";

const appIconBySlug: Record<string, string> = {
  "identity-admin": "ri-shield-keyhole-line",
  pdv: "ri-shopping-bag-3-line",
  juridico: "ri-scales-3-line",
  flow: "ri-trello-line",
};

const WebAppsDropdown = () => {
  const [apps, setApps] = useState<IdentityDestination[]>([]);
  const [loading, setLoading] = useState(true);
  const [switchingKey, setSwitchingKey] = useState("");

  useEffect(() => {
    let active = true;
    listIdentityApplications()
      .then((destinations) => {
        if (active) {
          setApps(destinations.filter((destination) => destination.applicationSlug !== "platform"));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleAppClick = async (destination: IdentityDestination) => {
    const key = `${destination.clientId}:${destination.applicationId}`;
    setSwitchingKey(key);
    try {
      const context = await switchIdentityApplication(destination);
      persistSwitchedIdentityContext(context);
      window.location.assign(resolveDestinationLaunchUrl(context.destination));
    } finally {
      setSwitchingKey("");
    }
  };

  return (
    <React.Fragment>
      <UncontrolledDropdown
        nav
        inNavbar
        className="topbar-head-dropdown ms-1 header-item"
      >
        <DropdownToggle
          tag="button"
          type="button"
          className="btn btn-icon btn-topbar btn-ghost-secondary rounded-circle"
        >
          <i className="bx bx-category-alt fs-22"></i>
        </DropdownToggle>
        <DropdownMenu className="dropdown-menu-lg p-0">
          <div className="p-3 border-top-0 border-start-0 border-end-0 border-dashed border">
            <Row className="align-items-center">
              <Col>
                <h6 className="m-0 fw-semibold fs-15"> Web Apps </h6>
              </Col>
              <div className="col-auto">
                <Link href={getIdentitySelectionUrl()} className="btn btn-sm btn-soft-info">
                  {" "}
                  View All Apps
                  <i className="ri-arrow-right-s-line align-middle"></i>
                </Link>
              </div>
            </Row>
          </div>

          <div className="p-2">
            <div className="row g-0">
              {loading ? (
                <Col>
                  <div className="dropdown-icon-item text-muted">
                    <i className="ri-loader-4-line fs-22"></i>
                    <span>Carregando</span>
                  </div>
                </Col>
              ) : null}
              {!loading && apps.length === 0 ? (
                <Col>
                  <div className="dropdown-icon-item text-muted">
                    <i className="ri-lock-2-line fs-22"></i>
                    <span>Sem apps</span>
                  </div>
                </Col>
              ) : null}
              {apps.map((destination) => {
                const key = `${destination.clientId}:${destination.applicationId}`;
                const icon = appIconBySlug[destination.applicationSlug] ?? "ri-apps-2-line";
                return (
                  <Col key={key}>
                    <button
                      type="button"
                      className="dropdown-icon-item border-0 bg-transparent w-100"
                      disabled={Boolean(switchingKey)}
                      onClick={() => handleAppClick(destination)}
                    >
                      <i className={`${switchingKey === key ? "ri-loader-4-line" : icon} fs-22`}></i>
                      <span>{destination.applicationName}</span>
                    </button>
                  </Col>
                );
              })}
            </div>
          </div>
        </DropdownMenu>
      </UncontrolledDropdown>
    </React.Fragment>
  );
};

export default WebAppsDropdown;
