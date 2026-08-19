"use client"

import { Avatar, Badge, Dialog, DialogContent, Spinner } from "@tfv/ui"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { type ItemAction, ItemActions } from "~/components/collection/item-actions.tsx"
import { api } from "~/lib/api.client.ts"

export interface PlatformCompanyRow {
  id: string
  name: string
  description: string
  email: string | null
  commissionRate: string
  memberCount: number
  createdAt: string
  deletedAt: string | null
}

interface MemberRow {
  id: string
  userId: string
  email: string
  name: string
  lastname: string
  isOwner: boolean
  isActive: boolean
}

/**
 * Quién lleva una empresa, sin entrar en ella.
 *
 * Es la pregunta que se hace desde plataforma cuando algo va mal en una empresa ajena: a quién hay
 * que llamar. Responderla entrando en el panel de esa empresa funcionaría —la elusión lo permite—
 * pero deja registrado un paseo por sus datos para averiguar un nombre.
 *
 * Se pide **al abrir** y no al pintar la lista: veinticinco empresas por página son veinticinco
 * peticiones para una información que casi nunca se mira.
 */
export function CompanyMembers({ company }: { company: PlatformCompanyRow }) {
  const t = useTranslations()

  const actions: ItemAction[] = [
    {
      key: "members",
      label: t("platform.companies.seeMembers"),
      dialog: (control) => <MembersDialog key="members" company={company} {...control} />,
    },
  ]

  return (
    <ItemActions
      label={t("platform.companies.actions", { name: company.name })}
      actions={actions}
    />
  )
}

function MembersDialog({
  company,
  open,
  onOpenChange,
}: {
  company: PlatformCompanyRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const [members, setMembers] = useState<MemberRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setFailed(false)

    api<{ items: MemberRow[] }>(`/platform/companies/${company.id}/members`)
      .then((page) => {
        if (!cancelled) setMembers(page.items)
      })
      .catch(() => {
        // El diálogo no puede dejar a quien lo abrió mirando un girador para siempre: si la
        // petición falló, se dice, y cerrar y volver a abrir lo reintenta.
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [open, company.id])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("platform.companies.membersTitle", { name: company.name })}
        size="sm"
        closeLabel={t("common.close")}
      >
        {failed ? (
          <p className="text-body2 text-content-muted">{t("platform.companies.membersFailed")}</p>
        ) : members === null ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : members.length === 0 ? (
          <p className="text-body2 text-content-muted">{t("platform.companies.membersEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {members.map((member) => {
              const name = [member.name, member.lastname].filter(Boolean).join(" ") || member.email

              return (
                <li key={member.id} className="flex items-center gap-3">
                  <Avatar name={name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body2 font-semibold text-content">{name}</p>
                    <p className="truncate text-body3 text-content-faint">{member.email}</p>
                  </div>
                  {member.isOwner ? <Badge tone="accent">{t("shell.owner")}</Badge> : null}
                  {member.isActive ? null : (
                    <Badge tone="warning">{t("platform.companies.memberInactive")}</Badge>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
