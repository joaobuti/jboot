"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DropdownItem, DropdownMenu, DropdownToggle, Spinner, UncontrolledDropdown } from "reactstrap";
import {
  connectPlatformNotificationsSocket,
  platformNotificationsApi,
  PlatformNotificationDto,
} from "@/lib/platform-notifications";
import { fetchMonitoringUpdatesToday, MonitoringUpdateItemDto, MonitoringUpdatesTodayDto } from "@/modules/kanban/lib/kanban-api";
import { monitoringItemHref, monitoringItemLabel } from "@/modules/kanban/lib/monitoring-bell";

/** Releitura do sino do monitoramento enquanto a tela esta aberta (a contagem e do dia). */
const MONITORING_REFRESH_MS = 5 * 60 * 1000;

const FLOW_FILTER = { applicationSlug: "flow", moduleSlug: "kanban" };

export default function NotificationsDropdown() {
  const [notifications, setNotifications] = useState<PlatformNotificationDto[]>([]);
  const [loading, setLoading] = useState(true);
  /** Processos atualizados hoje (DataJud e DJEN), docs/product/flow-offices-sprints.md, S6. */
  const [monitoring, setMonitoring] = useState<MonitoringUpdatesTodayDto | null>(null);

  async function refreshMonitoring() {
    setMonitoring(await fetchMonitoringUpdatesToday().catch(() => null));
  }

  async function refresh() {
    const items = await platformNotificationsApi.list(FLOW_FILTER);
    setNotifications(items);
  }

  useEffect(() => {
    let active = true;
    platformNotificationsApi
      .list(FLOW_FILTER)
      .then((items) => {
        if (active) setNotifications(items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });

    const socket = connectPlatformNotificationsSocket();
    socket.on("notification.created", (notification: PlatformNotificationDto) => {
      if (notification.applicationSlug !== "flow" || notification.moduleSlug !== "kanban") {
        return;
      }
      setNotifications((previous) => [notification, ...previous.filter((item) => item.id !== notification.id)].slice(0, 50));
    });

    void refreshMonitoring();
    const timer = window.setInterval(() => void refreshMonitoring(), MONITORING_REFRESH_MS);

    return () => {
      active = false;
      socket.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  const monitoringTotal = monitoring?.total ?? 0;

  const unreadCount = useMemo(() => notifications.filter((item) => !item.readAt).length, [notifications]);

  async function markRead(notification: PlatformNotificationDto) {
    if (!notification.readAt) {
      await platformNotificationsApi.markRead(notification.id);
      await refresh();
    }
  }

  async function markAllRead() {
    await platformNotificationsApi.markAllRead(FLOW_FILTER);
    await refresh();
  }

  return (
    <UncontrolledDropdown className="topbar-head-dropdown ms-1 header-item">
      <DropdownToggle type="button" tag="button" className="btn btn-icon btn-topbar btn-ghost-secondary rounded-circle" onClick={() => void refreshMonitoring()}>
        <i className="bx bx-bell fs-22" />
        {monitoringTotal > 0 && (
          <span className="position-absolute topbar-badge fs-10 translate-middle badge rounded-pill bg-danger">
            {monitoringTotal}
            <span className="visually-hidden">processos atualizados hoje</span>
          </span>
        )}
      </DropdownToggle>
      <DropdownMenu end className="dropdown-menu-lg dropdown-menu-end p-0">
        <div className="dropdown-head bg-primary bg-pattern rounded-top p-3">
          <div className="d-flex align-items-center justify-content-between">
            <h6 className="m-0 fs-16 fw-semibold text-white">Notificacoes</h6>
            {unreadCount > 0 && (
              <button type="button" className="btn btn-sm btn-light" onClick={() => void markAllRead()}>
                Marcar lidas
              </button>
            )}
          </div>
        </div>
        <div style={{ maxHeight: 420, overflowY: "auto" }}>
          {monitoring?.datajud.enabled ? (
            <MonitoringBlock title="Monitoramento processual (DataJud)" icon="ri-eye-line" items={monitoring.datajud.items} />
          ) : null}
          {monitoring?.djen.enabled ? (
            <MonitoringBlock title="Publicações processuais (DJEN)" icon="ri-newspaper-line" items={monitoring.djen.items} />
          ) : null}
          {monitoring && (monitoring.datajud.enabled || monitoring.djen.enabled) ? (
            <h6 className="dropdown-header border-top pt-3">Outras notificações</h6>
          ) : null}
          {loading ? (
            <div className="text-center p-4">
              <Spinner size="sm" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-muted text-center p-4">Sem notificacoes.</div>
          ) : (
            notifications.map((notification) => (
              <DropdownItem
                key={notification.id}
                tag={Link}
                href={notification.actionUrl ?? "/flow"}
                className={`notification-item py-3 ${notification.readAt ? "" : "active"}`}
                onClick={() => void markRead(notification)}
              >
                <div className="d-flex gap-2">
                  <span className="avatar-xs flex-shrink-0">
                    <span className="avatar-title bg-info-subtle text-info rounded-circle fs-16">
                      <i className="ri-checkbox-circle-line" />
                    </span>
                  </span>
                  <div className="flex-grow-1">
                    <p className="mb-1 text-wrap">{notification.title}</p>
                    <p className="mb-0 fs-11 text-uppercase text-muted">
                      {new Date(notification.createdAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
              </DropdownItem>
            ))
          )}
        </div>
      </DropdownMenu>
    </UncontrolledDropdown>
  );
}

/** Bloco do sino por capacidade: "Cliente - CNJ", link para o board ja abrindo o card. */
function MonitoringBlock({ title, icon, items }: { title: string; icon: string; items: MonitoringUpdateItemDto[] }) {
  return (
    <div className="border-bottom">
      <h6 className="dropdown-header d-flex justify-content-between align-items-center">
        <span><i className={`${icon} me-1`} />{title}</span>
        <span className="badge bg-primary-subtle text-primary">{items.length}</span>
      </h6>
      {items.length === 0 ? (
        <div className="text-muted small px-3 pb-2">Nenhum processo atualizado hoje.</div>
      ) : (
        items.map((item) => (
          <DropdownItem key={`${title}:${item.cardId}`} tag={Link} href={monitoringItemHref(item)} className="py-2">
            <span className="d-block text-wrap small">{monitoringItemLabel(item)}</span>
          </DropdownItem>
        ))
      )}
    </div>
  );
}
