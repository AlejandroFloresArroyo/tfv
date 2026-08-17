/**
 * La tabla de rutas.
 *
 * **Este archivo es el inventario completo de la superficie HTTP.** Si una ruta no está aquí, no
 * existe. Ese es el punto: en la pila anterior no había forma de saber qué exponía la API sin
 * ejecutarla, porque las rutas se descubrían recorriendo carpetas.
 *
 * Añadir una ruta es añadirla a esta lista. Se puede leer de arriba abajo para saber exactamente
 * qué está expuesto y bajo qué régimen de acceso.
 */

import type { RegisteredRoute } from "../runtime/route.ts"
import {
  acceptInvitationRoute,
  changePasswordRoute,
  forgotPasswordRoute,
  loginRoute,
  logoutAllRoute,
  logoutRoute,
  meRoute,
  refreshRoute,
  registerRoute,
  resendVerificationRoute,
  resetPasswordRoute,
  sessionsRoute,
  verifyEmailRoute,
} from "./auth.ts"
import {
  addMemberRoute,
  createCompanyRoute,
  createRoleRoute,
  deleteCompanyRoute,
  deleteRoleRoute,
  getCompanyRoute,
  listCompaniesRoute,
  listMembersRoute,
  listRolesRoute,
  removeMemberRoute,
  updateCompanyRoute,
  updateMemberRoute,
  updateRoleRoute,
} from "./companies.ts"
import {
  categoryScopeRoute,
  createCategoryRoute,
  createClientRoute,
  createCompanyAddressRoute,
  createProviderRoute,
  createUserAddressRoute,
  deleteCategoryRoute,
  deleteClientRoute,
  deleteCompanyAddressRoute,
  deleteProviderRoute,
  deleteUserAddressRoute,
  listCategoriesRoute,
  listClientsRoute,
  listCompanyAddressesRoute,
  listProvidersRoute,
  listUserAddressesRoute,
  updateCategoryRoute,
  updateClientRoute,
  updateCompanyAddressRoute,
  updateProviderRoute,
  updateUserAddressRoute,
} from "./directory.ts"
import { health } from "./health.ts"
import { permissionCatalogRoute } from "./permissions.ts"

export const routes: readonly RegisteredRoute[] = [
  // ─── Sistema ───────────────────────────────────────────────────────────────
  health,

  // ─── Acceso ────────────────────────────────────────────────────────────────
  registerRoute,
  loginRoute,
  refreshRoute,
  logoutRoute,
  logoutAllRoute,
  meRoute,
  sessionsRoute,
  verifyEmailRoute,
  resendVerificationRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  acceptInvitationRoute,
  changePasswordRoute,

  // ─── Autorización ──────────────────────────────────────────────────────────
  permissionCatalogRoute,

  // ─── Núcleo ────────────────────────────────────────────────────────────────
  createCompanyRoute,
  listCompaniesRoute,
  getCompanyRoute,
  updateCompanyRoute,
  deleteCompanyRoute,

  listMembersRoute,
  addMemberRoute,
  updateMemberRoute,
  removeMemberRoute,

  listRolesRoute,
  createRoleRoute,
  updateRoleRoute,
  deleteRoleRoute,

  listUserAddressesRoute,
  createUserAddressRoute,
  updateUserAddressRoute,
  deleteUserAddressRoute,

  listCompanyAddressesRoute,
  createCompanyAddressRoute,
  updateCompanyAddressRoute,
  deleteCompanyAddressRoute,

  listClientsRoute,
  createClientRoute,
  updateClientRoute,
  deleteClientRoute,

  listProvidersRoute,
  createProviderRoute,
  updateProviderRoute,
  deleteProviderRoute,

  listCategoriesRoute,
  createCategoryRoute,
  updateCategoryRoute,
  categoryScopeRoute,
  deleteCategoryRoute,
  // Pendiente de la rebanada 10: prospectos.

  // ─── Almacenes ─────────────────────────────────────────────────────────────
  // Pendiente: rebanada 12.

  // ─── Producciones ──────────────────────────────────────────────────────────
  // Pendiente: rebanada 20.

  // ─── Pixit ─────────────────────────────────────────────────────────────────
  // Pendiente: rebanada 24.

  // ─── Sitios ────────────────────────────────────────────────────────────────
  // Pendiente: rebanada 19.
]
