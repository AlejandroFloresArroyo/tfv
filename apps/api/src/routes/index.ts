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
  archiveNotificationRoute,
  companyActivityRoute,
  devicesRoute,
  inboxCountsRoute,
  inboxRoute,
  myActivityRoute,
  openInboxRoute,
  preferencesRoute,
  readNotificationRoute,
  registerDeviceRoute,
  revokeDeviceRoute,
  setPreferenceRoute,
} from "./activity.ts"
import {
  acceptInvitationRoute,
  changeEmailRoute,
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
  addChildRoute,
  addMeasurementRoute,
  createProductRoute,
  createWarehouseCategoryRoute,
  deleteMeasurementRoute,
  deleteProductRoute,
  deleteWarehouseCategoryRoute,
  getProductRoute,
  getWarehouseCategoryRoute,
  listProductsRoute,
  listWarehouseCategoriesRoute,
  productScopeRoute,
  setProductImagesRoute,
  updateMeasurementRoute,
  updateProductRoute,
  updateWarehouseCategoryRoute,
  warehouseCategoryPathRoute,
  warehouseCategoryScopeRoute,
} from "./catalog.ts"
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
import { publicDocumentRoute, quoteDocumentRoute } from "./documents.ts"
import { health } from "./health.ts"
import {
  deleteMessageRoute,
  editMessageRoute,
  markConversationReadRoute,
  readConversationRoute,
  sendMessageRoute,
} from "./order-chat.ts"
import {
  acceptOrderRoute,
  changeOrderStatusRoute,
  createOrderRoute,
  deleteOrderRoute,
  getOrderRoute,
  listOrderLinesRoute,
  listOrdersRoute,
  rejectOrderRoute,
} from "./orders.ts"
import { paymentWebhookRoute } from "./payments.ts"
import { permissionCatalogRoute } from "./permissions.ts"
import {
  acceptProspectRoute,
  captureProspectRoute,
  discardProspectRoute,
  listProspectsRoute,
  updateProspectRoute,
} from "./prospects.ts"
import {
  changeQuoteStatusRoute,
  createQuoteRoute,
  deleteQuotePaymentRoute,
  deleteQuoteRoute,
  extendQuoteRoute,
  getQuoteRoute,
  listQuoteLinesRoute,
  listQuotePaymentsRoute,
  listQuotesRoute,
  listQuoteUnitsRoute,
  listRatesRoute,
  quoteBreakdownRoute,
  registerQuotePaymentRoute,
  reservationCoherenceRoute,
  returnQuoteUnitsRoute,
  setQuoteContactsRoute,
  setQuoteLinesRoute,
  setQuotePaymentRoute,
  setQuoteResponsibleRoute,
  setQuoteTaxesRoute,
  updateQuoteRoute,
} from "./quotes.ts"
import {
  changeUnitStatusRoute,
  createPriceListRoute,
  createUnitsRoute,
  deletePriceListRoute,
  deleteUnitsRoute,
  findUnitByCodeRoute,
  getPriceListRoute,
  listPriceListsRoute,
  listPricesRoute,
  listUnitsRoute,
  priceListScopeRoute,
  removePriceRoute,
  resolvePriceRoute,
  setPriceListProductsRoute,
  setPriceRoute,
  unitHistoryRoute,
  updatePriceListRoute,
} from "./stock.ts"
import { authorizeUploadRoute, confirmUploadRoute, reissueTargetsRoute } from "./uploads.ts"
import {
  createStorageRoute,
  createWarehouseRoute,
  deleteStorageRoute,
  deleteWarehouseRoute,
  getWarehouseRoute,
  listStoragesRoute,
  listWarehousesRoute,
  storagePathRoute,
  storageScopeRoute,
  updateStorageRoute,
  updateWarehouseRoute,
  warehouseScopeRoute,
} from "./warehouses.ts"

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
  changeEmailRoute,
  changePasswordRoute,

  // Prospectos: la captura es pública, el resto lo lleva la administración de plataforma.
  captureProspectRoute,
  listProspectsRoute,
  updateProspectRoute,
  acceptProspectRoute,
  discardProspectRoute,

  // Eventos del procesador de pagos. Público y protegido por la firma del remitente.
  paymentWebhookRoute,

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
  listWarehousesRoute,
  createWarehouseRoute,
  getWarehouseRoute,
  updateWarehouseRoute,
  warehouseScopeRoute,
  deleteWarehouseRoute,

  listStoragesRoute,
  storagePathRoute,
  createStorageRoute,
  updateStorageRoute,
  storageScopeRoute,
  deleteStorageRoute,

  listWarehouseCategoriesRoute,
  getWarehouseCategoryRoute,
  warehouseCategoryPathRoute,
  createWarehouseCategoryRoute,
  updateWarehouseCategoryRoute,
  warehouseCategoryScopeRoute,
  deleteWarehouseCategoryRoute,

  listProductsRoute,
  createProductRoute,
  getProductRoute,
  updateProductRoute,
  setProductImagesRoute,
  productScopeRoute,
  deleteProductRoute,

  addChildRoute,
  addMeasurementRoute,
  updateMeasurementRoute,
  deleteMeasurementRoute,

  listPriceListsRoute,
  getPriceListRoute,
  createPriceListRoute,
  updatePriceListRoute,
  priceListScopeRoute,
  deletePriceListRoute,
  listPricesRoute,
  setPriceRoute,
  setPriceListProductsRoute,
  removePriceRoute,
  resolvePriceRoute,

  listUnitsRoute,
  createUnitsRoute,
  changeUnitStatusRoute,
  deleteUnitsRoute,
  findUnitByCodeRoute,
  unitHistoryRoute,

  listQuotesRoute,
  createQuoteRoute,
  getQuoteRoute,
  updateQuoteRoute,
  setQuoteContactsRoute,
  setQuotePaymentRoute,
  setQuoteTaxesRoute,
  setQuoteResponsibleRoute,
  changeQuoteStatusRoute,
  listQuoteLinesRoute,
  setQuoteLinesRoute,
  listRatesRoute,
  quoteBreakdownRoute,
  listQuoteUnitsRoute,
  returnQuoteUnitsRoute,
  listQuotePaymentsRoute,
  registerQuotePaymentRoute,
  deleteQuotePaymentRoute,
  extendQuoteRoute,
  reservationCoherenceRoute,
  deleteQuoteRoute,

  // El documento comercial y su enlace público. Ver `pdf-documents`.
  quoteDocumentRoute,
  publicDocumentRoute,

  // Pedidos de almacén: la bandeja del operador. Aceptar genera la cotización.
  listOrdersRoute,
  createOrderRoute,
  getOrderRoute,
  listOrderLinesRoute,
  acceptOrderRoute,
  rejectOrderRoute,
  changeOrderStatusRoute,
  deleteOrderRoute,

  // ─── Archivos ──────────────────────────────────────────────────────────────

  authorizeUploadRoute,
  reissueTargetsRoute,
  confirmUploadRoute,

  // ─── Conversación del pedido ───────────────────────────────────────────────
  // Los dos lados del mostrador, dentro del pedido.

  readConversationRoute,
  sendMessageRoute,
  markConversationReadRoute,
  editMessageRoute,
  deleteMessageRoute,

  // ─── Bitácora y notificaciones ─────────────────────────────────────────────
  // La bitácora es de la empresa; la bandeja, las preferencias y los dispositivos son de la persona.

  companyActivityRoute,
  myActivityRoute,

  inboxRoute,
  inboxCountsRoute,
  openInboxRoute,
  readNotificationRoute,
  archiveNotificationRoute,

  preferencesRoute,
  setPreferenceRoute,

  devicesRoute,
  registerDeviceRoute,
  revokeDeviceRoute,

  // ─── Producciones ──────────────────────────────────────────────────────────
  // Pendiente: rebanada 20.

  // ─── Pixit ─────────────────────────────────────────────────────────────────
  // Pendiente: rebanada 24.

  // ─── Sitios ────────────────────────────────────────────────────────────────
  // Pendiente: rebanada 19.
]
