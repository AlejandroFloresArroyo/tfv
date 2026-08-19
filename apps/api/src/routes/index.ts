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
  cancelSubscriptionRoute,
  changePlanRoute,
  createMerchantProfileRoute,
  deleteMerchantProfileRoute,
  entitlementsRoute,
  freePlanAvailabilityRoute,
  getMerchantProfileRoute,
  listMerchantPaymentsRoute,
  listMerchantProfilesRoute,
  listPlansRoute,
  listSubscriptionPaymentsRoute,
  operatingProfileRoute,
  reactivateSubscriptionRoute,
  setPrimaryMerchantProfileRoute,
  subscribeRoute,
  updateMerchantProfileRoute,
  verifyMerchantProfileRoute,
} from "./billing.ts"
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
  cancelCheckoutRoute,
  createCheckoutRoute,
  myCheckoutRoute,
  myCheckoutsRoute,
  myOrderRoute,
  myOrdersRoute,
  priceCartRoute,
} from "./checkout.ts"
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
  assignCharactersRoute,
  closeRecordingRoute,
  createContinuityRoute,
  createRecordingRoute,
  deleteContinuityRoute,
  getRecordingRoute,
  listRecordingsRoute,
  openRecordingRoute,
  setContinuityCharacterRoute,
  updateRecordingRoute,
} from "./continuity.ts"
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
import { localCheckoutPageRoute, localCheckoutPayRoute, paymentWebhookRoute } from "./payments.ts"
import { permissionCatalogRoute } from "./permissions.ts"
import {
  platformActivityRoute,
  platformCompaniesRoute,
  platformCompanyMembersRoute,
  platformUsersRoute,
} from "./platform.ts"
import {
  createProductionCategoryRoute,
  createProductionRoute,
  createWorkflowRoute,
  deleteProductionCategoryRoute,
  deleteProductionRoute,
  deleteWorkflowRoute,
  getProductionCategoryRoute,
  getProductionRoute,
  getWorkflowRoute,
  listProductionCategoriesRoute,
  listProductionsRoute,
  listWorkflowsRoute,
  productionCategoryPathRoute,
  productionCategoryScopeRoute,
  productionPanelRoute,
  productionScopeRoute,
  updateProductionCategoryRoute,
  updateProductionRoute,
  updateWorkflowRoute,
  workflowScopeRoute,
} from "./productions.ts"
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
  changeShipmentStatusRoute,
  estimateShippingRoute,
  getShipmentRoute,
  getShippingRatesRoute,
  updateShipmentRoute,
  updateShippingRatesRoute,
} from "./shipping.ts"
import {
  createCustomizationRoute,
  deleteCustomizationRoute,
  getCustomizationRoute,
  listCustomizationsRoute,
  previewSitePageRoute,
  storefrontPageRoute,
  updateCustomizationRoute,
} from "./site-builder.ts"
import {
  changeUnitStatusRoute,
  confirmArrivalRoute,
  createPriceListRoute,
  createUnitsRoute,
  deletePriceListRoute,
  deleteUnitsRoute,
  findUnitByCodeRoute,
  getPriceListRoute,
  listPendingArrivalsRoute,
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
import {
  storefrontProductRoute,
  storefrontProductsRoute,
  storefrontSiteRoute,
} from "./storefront.ts"
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
import {
  createWebsiteRoute,
  deleteWebsiteRoute,
  getWebsiteRoute,
  listWebsitesRoute,
  updateWebsiteRoute,
  websiteSlugAvailableRoute,
} from "./websites.ts"

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

  // La página de cobro del procesador **suplente**, y su botón de pagar. Sólo responden con
  // `PAYMENTS_PROVIDER=local`; con procesador de verdad no existen. Ver `payments/local-processor.ts`.
  localCheckoutPageRoute,
  localCheckoutPayRoute,

  // ─── Autorización ──────────────────────────────────────────────────────────
  permissionCatalogRoute,

  // ─── Administración de plataforma ──────────────────────────────────────────
  // Ninguna lleva `:companyId`: lo que atienden no pertenece a ninguna empresa, así que no hay
  // permiso de empresa contra el que resolverlas. Todas son de lectura salvo la bandeja de
  // prospectos, que está arriba con el resto del acceso.
  platformCompaniesRoute,
  platformCompanyMembersRoute,
  platformUsersRoute,
  platformActivityRoute,

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

  // ─── Suscripción y facturación ─────────────────────────────────────────────
  // El catálogo y la disponibilidad del plan gratuito son de la persona: se consultan antes de
  // tener empresa contra la que resolver un permiso.

  listPlansRoute,
  freePlanAvailabilityRoute,

  entitlementsRoute,

  subscribeRoute,
  changePlanRoute,
  cancelSubscriptionRoute,
  reactivateSubscriptionRoute,
  listSubscriptionPaymentsRoute,

  // El perfil operativo va antes que el de identificador: `operating` no es un UUID, y con el
  // orden al revés lo capturaría la ruta con parámetro.
  operatingProfileRoute,
  listMerchantProfilesRoute,
  createMerchantProfileRoute,
  getMerchantProfileRoute,
  updateMerchantProfileRoute,
  setPrimaryMerchantProfileRoute,
  verifyMerchantProfileRoute,
  deleteMerchantProfileRoute,

  listMerchantPaymentsRoute,

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
  listPendingArrivalsRoute,
  confirmArrivalRoute,
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

  // ─── Envíos ────────────────────────────────────────────────────────────────
  // El cuadro de tarifas de la empresa, la estimación —el mismo cálculo con el que se cobra— y el
  // seguimiento de la entrega. Ver `shipping-rates` y `order-fulfillment`.

  getShippingRatesRoute,
  updateShippingRatesRoute,
  estimateShippingRoute,

  getShipmentRoute,
  updateShipmentRoute,
  changeShipmentStatusRoute,

  // ─── Producciones ──────────────────────────────────────────────────────────
  // La producción como entidad, su taxonomía —que dirige el trabajo a un equipo— y sus planes de
  // trabajo. El panel va **antes** que la ficha con parámetro por el mismo motivo que el perfil
  // operativo de facturación: nada garantiza que un identificador no se parezca a «panel».

  listProductionsRoute,
  createProductionRoute,
  productionPanelRoute,
  getProductionRoute,
  updateProductionRoute,
  productionScopeRoute,
  deleteProductionRoute,

  listProductionCategoriesRoute,
  getProductionCategoryRoute,
  productionCategoryPathRoute,
  createProductionCategoryRoute,
  updateProductionCategoryRoute,
  productionCategoryScopeRoute,
  deleteProductionCategoryRoute,

  listWorkflowsRoute,
  createWorkflowRoute,
  getWorkflowRoute,
  updateWorkflowRoute,
  workflowScopeRoute,
  deleteWorkflowRoute,

  // Continuidad de rodaje: la jornada, su reparto, su continuidad por personaje y la utilería de
  // cada una. Ver `routes/continuity.ts`.
  listRecordingsRoute,
  createRecordingRoute,
  getRecordingRoute,
  updateRecordingRoute,
  assignCharactersRoute,
  closeRecordingRoute,
  openRecordingRoute,

  createContinuityRoute,
  setContinuityCharacterRoute,
  deleteContinuityRoute,

  // Pendiente: guion, capítulos y escenas (21); inventario, entregas y presupuesto (22); compras
  // a almacenes (23). Las tablas existen desde la `0002` y el panel ya las cuenta.

  // ─── Pixit ─────────────────────────────────────────────────────────────────
  // Pendiente: rebanada 24.

  // ─── Sitios ────────────────────────────────────────────────────────────────
  // La gestión, con permiso. La tienda pública que cuelga de ellos va más abajo, aparte, porque es
  // la única superficie de este servicio que atiende a quien no tiene cuenta.

  listWebsitesRoute,
  websiteSlugAvailableRoute,
  createWebsiteRoute,
  getWebsiteRoute,
  updateWebsiteRoute,
  deleteWebsiteRoute,

  // El constructor: los temas de un sitio y su contenido, más la vista previa de lo que servirían.
  listCustomizationsRoute,
  previewSitePageRoute,
  createCustomizationRoute,
  getCustomizationRoute,
  updateCustomizationRoute,
  deleteCustomizationRoute,

  // La tienda pública que cuelga de un sitio. Las cuatro son públicas, y su motivo está escrito en
  // cada una: es la superficie que se sirve a quien no tiene cuenta.
  storefrontSiteRoute,
  storefrontPageRoute,
  storefrontProductsRoute,
  storefrontProductRoute,

  // ─── Compra en la tienda pública ───────────────────────────────────────────
  // Valorar el carrito es público —es el escaparate con precios—; pagar exige cuenta, y las
  // compras y los pedidos son de la persona, no de una empresa. Ver `storefront-checkout`.

  priceCartRoute,
  createCheckoutRoute,

  myCheckoutsRoute,
  myCheckoutRoute,
  cancelCheckoutRoute,

  myOrdersRoute,
  myOrderRoute,
]
