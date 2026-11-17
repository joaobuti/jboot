import React, { useState, useEffect } from "react";
// import Link from "next/link"; // so nos itens de demonstracao comentados
import { useDispatch } from "react-redux";
import { logoutUser } from "@slices/auth/login/thunk";
import type { AppDispatch } from "@slices/store";
import { redirectToIdentityLogin } from "@/lib/identity-navigation";
import {
  UncontrolledDropdown,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
} from "reactstrap";
import Image from "next/image";
import type { CurrentModule } from "@/hooks/useCurrentModule";
import { firstName, readPlatformSession } from "@/lib/platform-session";
import { ActiveOfficeStateDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";

//import images
const avatar1 = "/images/users/avatar-1.jpg";

/**
 * Usuario na barra superior (docs/product/flow-offices-sprints.md, S3): primeiro nome e, no Flow,
 * o escritorio ativo; com mais de um escritorio, o menu escolhe em qual ele atua.
 */
const ProfileDropdown = ({ module }: { module?: CurrentModule }) => {
  const [userName, setUserName] = useState("");
  const [office, setOffice] = useState<ActiveOfficeStateDto | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    setUserName(firstName(readPlatformSession(document.cookie).displayName));
  }, []);

  useEffect(() => {
    if (module !== "flow") {
      setOffice(null);
      return;
    }
    let active = true;
    kanbanApi.offices.myOffice().then((state) => { if (active) setOffice(state); }).catch(() => undefined);
    return () => { active = false; };
  }, [module]);

  const activeOffice = office?.offices.find((item) => item.id === office.activeOfficeId) ?? null;

  async function chooseOffice(officeId: string) {
    if (!office || officeId === office.activeOfficeId || switching) return;
    setSwitching(true);
    try {
      await kanbanApi.offices.chooseMyOffice(officeId);
      // Telas abertas releem o que depende do escritorio.
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  }

  const dispatch = useDispatch<AppDispatch>();
  const handleLogout = () => {
    dispatch(logoutUser());
    redirectToIdentityLogin();
  };
  return (
    <React.Fragment>
      <UncontrolledDropdown
        nav
        inNavbar
        className="ms-sm-3 header-item topbar-user"
      >
        <DropdownToggle tag="button" type="button" className="btn">
          <span className="d-flex align-items-center">
            <Image
              className="rounded-circle header-profile-user"
              src={avatar1}
              alt="Header Avatar"
              width={40}
              height={40}
            />
            <span className="text-start ms-xl-2">
              <span className="d-none d-xl-inline-block ms-1 fw-medium user-name-text">
                {" "}
                {userName}
              </span>
              <span className="d-none d-xl-block ms-1 fs-12 text-muted user-name-sub-text">
                {activeOffice?.name ?? ""}
              </span>
            </span>
          </span>
        </DropdownToggle>
        <DropdownMenu className="dropdown-menu-end">
          <h6 className="dropdown-header">Olá, {userName}!</h6>
          {office && office.offices.length > 1 ? (
            <>
              <h6 className="dropdown-header pt-0">Escritório ativo</h6>
              {office.offices.map((item) => (
                <DropdownItem key={item.id} toggle={false} disabled={switching} onClick={() => void chooseOffice(item.id)}>
                  <i className={`${item.id === office.activeOfficeId ? "ri-checkbox-circle-fill text-success" : "ri-checkbox-blank-circle-line text-muted"} fs-16 align-middle me-1`} />
                  <span className="align-middle">{item.name}</span>
                </DropdownItem>
              ))}
              <div className="dropdown-divider"></div>
            </>
          ) : null}
          {/* Itens de demonstracao do template (perfil, mensagens, saldo, configuracoes, bloqueio de tela) sem tela no produto; comentados, nao removidos.
          <DropdownItem className="p-0">
            <Link href="/profile" className="dropdown-item">
              <i className="mdi mdi-account-circle text-muted fs-16 align-middle me-1"></i>
              <span className="align-middle">Profile</span>
            </Link>
          </DropdownItem>
          <DropdownItem className="p-0">
            <Link href="/apps-chat" className="dropdown-item">
              <i className="mdi mdi-message-text-outline text-muted fs-16 align-middle me-1"></i>{" "}
              <span className="align-middle">Messages</span>
            </Link>
          </DropdownItem>
          <DropdownItem className="p-0">
            <Link href={"#"} className="dropdown-item">
              <i className="mdi mdi-calendar-check-outline text-muted fs-16 align-middle me-1"></i>{" "}
              <span className="align-middle">Taskboard</span>
            </Link>
          </DropdownItem>
          <DropdownItem className="p-0">
            <Link href="/pages-faqs" className="dropdown-item">
              <i className="mdi mdi-lifebuoy text-muted fs-16 align-middle me-1"></i>{" "}
              <span className="align-middle">Help</span>
            </Link>
          </DropdownItem>
          <div className="dropdown-divider"></div>
          <DropdownItem className="p-0">
            <Link href="/pages-profile" className="dropdown-item">
              <i className="mdi mdi-wallet text-muted fs-16 align-middle me-1"></i>{" "}
              <span className="align-middle">
                Balance : <b>$5971.67</b>
              </span>
            </Link>
          </DropdownItem>
          <DropdownItem className="p-0">
            <Link href="/pages-profile-settings" className="dropdown-item">
              <span className="badge bg-success-subtle text-success mt-1 float-end">
                New
              </span>
              <i className="mdi mdi-cog-outline text-muted fs-16 align-middle me-1"></i>{" "}
              <span className="align-middle">Settings</span>
            </Link>
          </DropdownItem>
          <DropdownItem className="p-0">
            <Link href="/auth-lockscreen-basic" className="dropdown-item">
              <i className="mdi mdi-lock text-muted fs-16 align-middle me-1"></i>{" "}
              <span className="align-middle">Lock screen</span>
            </Link>
          </DropdownItem>
          */}
          <DropdownItem tag="div" className="p-0">
            <button
              type="button"
              onClick={handleLogout}
              className="dropdown-item"
            >
              <i className="mdi mdi-logout text-muted fs-16 align-middle me-1" />{" "}
              <span className="align-middle" data-key="t-logout">
                Sair
              </span>
            </button>
          </DropdownItem>
        </DropdownMenu>
      </UncontrolledDropdown>
    </React.Fragment>
  );
};

export default ProfileDropdown;
