/**
 * Cliente tipado del contrato publicado. **Generado: no se edita a mano.**
 *
 * Se emite con `pnpm --filter @tfv/api contract` a partir de `/openapi.json`, que a su vez se
 * deriva de los esquemas que validan en ejecución. Una prueba comprueba que este archivo coincide
 * con lo que el registro de rutas produce ahora mismo: si alguien cambia una ruta y no lo regenera,
 * falla ahí y no en la pantalla que lo usaba.
 *
 * Ver `packages/contracts/src/openapi-types.ts` y `api-client.ts`.
 */

export interface ApiEndpoints {
  "POST /auth/accept-invitation": {
    /** Establecer la contraseña de una cuenta invitada */
    body: {
      token: string
      password: string
    }
    response: {
      message: string
    }
  }

  "POST /auth/change-email": {
    /** Solicitar el cambio de correo */
    body: {
      newEmail: string
    }
    response: {
      message: string
    }
  }

  "POST /auth/change-password": {
    /** Cambiar la contraseña con sesión iniciada */
    body: {
      currentPassword: string
      newPassword: string
    }
    response: {
      message: string
    }
  }

  "POST /auth/forgot-password": {
    /** Solicitar el restablecimiento de la contraseña */
    body: {
      email: string
    }
    response: {
      message: string
    }
  }

  "POST /auth/login": {
    /** Iniciar sesión */
    body: {
      email: string
      password: string
    }
    response: {
      userId: string
      accessExpiresAt: string
    }
  }

  "POST /auth/logout": {
    /** Cerrar la sesión actual */
    response: {
      message: string
    }
  }

  "POST /auth/logout-all": {
    /** Cerrar todas las sesiones */
    response: {
      message: string
    }
  }

  "GET /auth/me": {
    /** Perfil del solicitante, con sus empresas y servicios */
    response: {
      id: string
      email: string
      name: string
      lastname: string
      username: string
      isPlatformAdmin: boolean
      emailVerified: boolean
      companies: Array<{
        id: string
        name: string
        isOwner: boolean
        services: Array<{
          keycode: string
          name: string
        }>
        permissions: Array<string>
      }>
    }
  }

  "POST /auth/refresh": {
    /** Renovar la sesión */
    response: {
      userId: string
      accessExpiresAt: string
    }
  }

  "POST /auth/register": {
    /** Crear una cuenta */
    body: {
      email: string
      password: string
      name: string
      lastname?: string
    }
    response: {
      message: string
    }
  }

  "POST /auth/resend-verification": {
    /** Reenviar el enlace de verificación */
    body: {
      email: string
    }
    response: {
      message: string
    }
  }

  "POST /auth/reset-password": {
    /** Fijar una contraseña nueva */
    body: {
      token: string
      password: string
    }
    response: {
      message: string
    }
  }

  "GET /auth/sessions": {
    /** Listar las sesiones activas */
    response: {
      items: Array<{
        id: string
        userAgent: string | null
        ipAddress: string | null
        lastUsedAt: string | null
        createdAt: string
      }>
    }
  }

  "POST /auth/verify-email": {
    /** Confirmar la dirección de correo */
    body: {
      token: string
    }
    response: {
      message: string
      changed: boolean
      sameSession: boolean
    }
  }

  "GET /categories": {
    /** Listar categorías globales */
    query?: {
      parent?: string
      service?: string
    }
    response: {
      items: Array<{
        id: string
        name: string
        slug: string | null
        parentId: string | null
        serviceId: string | null
        keyname: string | null
        createdAt: string
        updatedAt: string
      }>
    }
  }

  "GET /companies": {
    /** Listar las empresas del solicitante */
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        name: string
        description: string
        email: string | null
        commissionRate: string
        createdAt: string
        updatedAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "POST /companies": {
    /** Crear una empresa */
    headers?: {
      "idempotency-key"?: string
    }
    body: {
      name: string
      description?: string
      email?: string
    }
    response: {
      id: string
      name: string
      description: string
      email: string | null
      commissionRate: string
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}": {
    /** Ver una empresa */
    params: {
      companyId: string
    }
    response: {
      id: string
      name: string
      description: string
      email: string | null
      commissionRate: string
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}": {
    /** Editar una empresa */
    params: {
      companyId: string
    }
    body: {
      name?: string
      description?: string
      email?: string | null
      commissionRate?: string
    }
    response: {
      id: string
      name: string
      description: string
      email: string | null
      commissionRate: string
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}": {
    /** Dar de baja una empresa */
    params: {
      companyId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/activity": {
    /** La bitácora de la empresa */
    params: {
      companyId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_createdAt?: string | Array<string>
      action?: string | Array<string>
      entity?: string | Array<string>
      serviceId?: string | Array<string>
      performedById?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        companyId: string
        companyName: string
        action: "create" | "update" | "delete"
        entity: string
        entityId: string | null
        entityLabel: string
        title: string
        description: string
        url: string
        origin: string
        permissions: Array<string>
        performedById: string | null
        performedBy: string
        performedAsPlatformAdmin: boolean
        createdAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "GET /companies/{companyId}/addresses": {
    /** Libreta de direcciones de la empresa */
    params: {
      companyId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_label?: string | Array<string>
      sort_city?: string | Array<string>
      sort_isPrimary?: string | Array<string>
      sort_createdAt?: string | Array<string>
      isPrimary?: string | Array<string>
      city?: string | Array<string>
      countryCode?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        label: string
        street: string
        number: string
        colony: string
        city: string
        state: string
        country: string
        countryCode: string
        postalCode: string
        latitude: string | null
        longitude: string | null
        isPrimary: boolean
        createdAt: string
        updatedAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "POST /companies/{companyId}/addresses": {
    /** Añadir una dirección de empresa */
    params: {
      companyId: string
    }
    body: {
      label?: string
      street?: string
      number?: string
      colony?: string
      city?: string
      state?: string
      country?: string
      countryCode?: string
      postalCode?: string
      latitude?: string | null
      longitude?: string | null
      isPrimary?: boolean
    }
    response: {
      id: string
      label: string
      street: string
      number: string
      colony: string
      city: string
      state: string
      country: string
      countryCode: string
      postalCode: string
      latitude: string | null
      longitude: string | null
      isPrimary: boolean
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/addresses/{addressId}": {
    /** Editar una dirección de empresa */
    params: {
      companyId: string
      addressId: string
    }
    body: {
      label?: string
      street?: string
      number?: string
      colony?: string
      city?: string
      state?: string
      country?: string
      countryCode?: string
      postalCode?: string
      latitude?: string | null
      longitude?: string | null
      isPrimary?: boolean
    }
    response: {
      id: string
      label: string
      street: string
      number: string
      colony: string
      city: string
      state: string
      country: string
      countryCode: string
      postalCode: string
      latitude: string | null
      longitude: string | null
      isPrimary: boolean
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/addresses/{addressId}": {
    /** Eliminar una dirección de empresa */
    params: {
      companyId: string
      addressId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/billing-profiles": {
    /** Perfiles de facturación de la empresa */
    params: {
      companyId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_alias?: string | Array<string>
      sort_createdAt?: string | Array<string>
      status?: string | Array<string>
      isPrimary?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        alias: string
        addressId: string | null
        business?: unknown
        bank?: unknown
        representative?: unknown
        status: string
        verificationStatus: string
        canAcceptCharges: boolean
        canReceivePayouts: boolean
        isPrimary: boolean
        termsAcceptedAt: string | null
        notes: string | null
        createdAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "POST /companies/{companyId}/billing-profiles": {
    /** Dar de alta un perfil y su cuenta de comercio */
    params: {
      companyId: string
    }
    body: {
      alias: string
      addressId?: string
      business: {
        type: "individual" | "company" | "government_entity" | "non_profit"
        legalName: string
        taxId: string
        taxRegime?: string
        invoiceUse?: string
        email?: string
        dialCode?: string
        phone?: string
      }
      bank: {
        bankName?: string
        holderType: "individual" | "company"
        holder: string
        clabe: string
        currency: "MXN" | "USD"
        country?: string
      }
      representative: {
        name: string
        lastname: string
        email?: string
        dialCode?: string
        phone?: string
        taxId?: string
        birthdate: {
          day: number
          month: number
          year: number
        }
        address: {
          line1: string
          city: string
          state: string
          postalCode: string
          country?: string
        }
        relationship: {
          title?: string
          isDirector?: boolean
          isExecutive?: boolean
          isRepresentative?: boolean
          isOwner?: boolean
          percentOwnership?: number
        }
      }
    }
    response: {
      id: string
      alias: string
      addressId: string | null
      business?: unknown
      bank?: unknown
      representative?: unknown
      status: string
      verificationStatus: string
      canAcceptCharges: boolean
      canReceivePayouts: boolean
      isPrimary: boolean
      termsAcceptedAt: string | null
      notes: string | null
      createdAt: string
    }
  }

  "GET /companies/{companyId}/billing-profiles/operating": {
    /** Cuál es el perfil operativo, sin datos fiscales ni bancarios */
    params: {
      companyId: string
    }
    response: {
      exists: boolean
      canCharge: boolean
      status: string | null
      verificationStatus: string | null
    }
  }

  "GET /companies/{companyId}/billing-profiles/{profileId}": {
    /** Ver un perfil de facturación */
    params: {
      companyId: string
      profileId: string
    }
    response: {
      id: string
      alias: string
      addressId: string | null
      business?: unknown
      bank?: unknown
      representative?: unknown
      status: string
      verificationStatus: string
      canAcceptCharges: boolean
      canReceivePayouts: boolean
      isPrimary: boolean
      termsAcceptedAt: string | null
      notes: string | null
      createdAt: string
    }
  }

  "PATCH /companies/{companyId}/billing-profiles/{profileId}": {
    /** Modificar un perfil y propagar lo que afecte al procesador */
    params: {
      companyId: string
      profileId: string
    }
    body: {
      alias?: string
      addressId?: string | null
      business?: {
        type: "individual" | "company" | "government_entity" | "non_profit"
        legalName: string
        taxId: string
        taxRegime?: string
        invoiceUse?: string
        email?: string
        dialCode?: string
        phone?: string
      }
      bank?: {
        bankName?: string
        holderType: "individual" | "company"
        holder: string
        clabe: string
        currency: "MXN" | "USD"
        country?: string
      }
      representative?: {
        name: string
        lastname: string
        email?: string
        dialCode?: string
        phone?: string
        taxId?: string
        birthdate: {
          day: number
          month: number
          year: number
        }
        address: {
          line1: string
          city: string
          state: string
          postalCode: string
          country?: string
        }
        relationship: {
          title?: string
          isDirector?: boolean
          isExecutive?: boolean
          isRepresentative?: boolean
          isOwner?: boolean
          percentOwnership?: number
        }
      }
      notes?: string | null
    }
    response: {
      id: string
      alias: string
      addressId: string | null
      business?: unknown
      bank?: unknown
      representative?: unknown
      status: string
      verificationStatus: string
      canAcceptCharges: boolean
      canReceivePayouts: boolean
      isPrimary: boolean
      termsAcceptedAt: string | null
      notes: string | null
      createdAt: string
    }
  }

  "DELETE /companies/{companyId}/billing-profiles/{profileId}": {
    /** Dar de baja un perfil y su cuenta de comercio */
    params: {
      companyId: string
      profileId: string
    }
    response: undefined
  }

  "POST /companies/{companyId}/billing-profiles/{profileId}/primary": {
    /** Marcar como primario. Desmarca el anterior */
    params: {
      companyId: string
      profileId: string
    }
    response: {
      id: string
      alias: string
      addressId: string | null
      business?: unknown
      bank?: unknown
      representative?: unknown
      status: string
      verificationStatus: string
      canAcceptCharges: boolean
      canReceivePayouts: boolean
      isPrimary: boolean
      termsAcceptedAt: string | null
      notes: string | null
      createdAt: string
    }
  }

  "POST /companies/{companyId}/billing-profiles/{profileId}/verification-link": {
    /** Enlace al formulario de documentación del procesador */
    params: {
      companyId: string
      profileId: string
    }
    response: {
      url: string
    }
  }

  "POST /companies/{companyId}/categories": {
    /** Crear una categoría global */
    params: {
      companyId: string
    }
    body: {
      name: string
      parentId?: string | null
      service?: string | null
      keyname?: string | null
    }
    response: {
      id: string
      name: string
      slug: string | null
      parentId: string | null
      serviceId: string | null
      keyname: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/categories/{categoryId}": {
    /** Editar o re-parentar una categoría global */
    params: {
      companyId: string
      categoryId: string
    }
    body: {
      name?: string
      parentId?: string | null
      service?: string | null
    }
    response: {
      id: string
      name: string
      slug: string | null
      parentId: string | null
      serviceId: string | null
      keyname: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/categories/{categoryId}": {
    /** Eliminar una categoría global y su subárbol */
    params: {
      companyId: string
      categoryId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/categories/{categoryId}/scope": {
    /** Qué se lleva por delante eliminar esta categoría */
    params: {
      companyId: string
      categoryId: string
    }
    response: {
      categories: number
    }
  }

  "GET /companies/{companyId}/clients": {
    /** Listar clientes */
    params: {
      companyId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_alias?: string | Array<string>
      sort_createdAt?: string | Array<string>
      userId?: string | Array<string>
      counterpartyCompanyId?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        role: "client" | "provider"
        alias: string
        userId: string | null
        counterpartyCompanyId: string | null
        snapshot: Record<string, string>
        createdAt: string
        updatedAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "POST /companies/{companyId}/clients": {
    /** Dar de alta un cliente */
    params: {
      companyId: string
    }
    body: {
      alias: string
      email?: string
      snapshot?: {
        name?: string
        lastname?: string
        email?: string
        phone?: string
        companyName?: string
        taxId?: string
        address?: string
      }
    }
    response: {
      id: string
      role: "client" | "provider"
      alias: string
      userId: string | null
      counterpartyCompanyId: string | null
      snapshot: Record<string, string>
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/clients/{counterpartyId}": {
    /** Editar un cliente */
    params: {
      companyId: string
      counterpartyId: string
    }
    body: {
      alias?: string
      snapshot?: {
        name?: string
        lastname?: string
        email?: string
        phone?: string
        companyName?: string
        taxId?: string
        address?: string
      }
    }
    response: {
      id: string
      role: "client" | "provider"
      alias: string
      userId: string | null
      counterpartyCompanyId: string | null
      snapshot: Record<string, string>
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/clients/{counterpartyId}": {
    /** Dar de baja un cliente */
    params: {
      companyId: string
      counterpartyId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/entitlements": {
    /** Qué tiene contratado esta empresa */
    params: {
      companyId: string
    }
    response: {
      companyId: string
      services: Array<string>
      subscription: {
        id: string
        status: string
        planId: string
        planTier: number
        planTitle: string
        seats: number
        cancelAtPeriodEnd: boolean
        periodStart: string | null
        periodEnd: string | null
        gracePeriodEndsAt: string | null
        discountPercent: string | null
        promotionCode: string | null
        interval: string
        isOperating: boolean
      } | null
    }
  }

  "GET /companies/{companyId}/members": {
    /** Listar los miembros de una empresa */
    params: {
      companyId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_email?: string | Array<string>
      sort_createdAt?: string | Array<string>
      roleId?: string | Array<string>
      isActive?: string | Array<string>
      isOwner?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        userId: string
        email: string
        name: string
        lastname: string
        roleId: string | null
        roleName: string | null
        isOwner: boolean
        isActive: boolean
        createdAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "POST /companies/{companyId}/members": {
    /** Incorporar a alguien que ya tiene cuenta */
    params: {
      companyId: string
    }
    body: {
      email: string
      roleId?: string | null
    }
    response: {
      id: string
      userId: string
      email: string
      name: string
      lastname: string
      roleId: string | null
      roleName: string | null
      isOwner: boolean
      isActive: boolean
      createdAt: string
    }
  }

  "PATCH /companies/{companyId}/members/{memberId}": {
    /** Cambiar el rol, la actividad o la propiedad de un miembro */
    params: {
      companyId: string
      memberId: string
    }
    body: {
      roleId?: string | null
      isActive?: boolean
      isOwner?: boolean
    }
    response: {
      id: string
      userId: string
      email: string
      name: string
      lastname: string
      roleId: string | null
      roleName: string | null
      isOwner: boolean
      isActive: boolean
      createdAt: string
    }
  }

  "DELETE /companies/{companyId}/members/{memberId}": {
    /** Retirar a alguien de la empresa */
    params: {
      companyId: string
      memberId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/merchant-payments": {
    /** Libro de ingresos: lo que la empresa cobró de sus compradores */
    params: {
      companyId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      sort_createdAt?: string | Array<string>
      status?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        grossAmount: string
        platformFee: string
        netAmount: string
        currency: string
        method: string | null
        status: string
        merchantProfileId: string | null
        buyerId: string | null
        createdAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "GET /companies/{companyId}/providers": {
    /** Listar proveedores */
    params: {
      companyId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_alias?: string | Array<string>
      sort_createdAt?: string | Array<string>
      userId?: string | Array<string>
      counterpartyCompanyId?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        role: "client" | "provider"
        alias: string
        userId: string | null
        counterpartyCompanyId: string | null
        snapshot: Record<string, string>
        createdAt: string
        updatedAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "POST /companies/{companyId}/providers": {
    /** Dar de alta un proveedor */
    params: {
      companyId: string
    }
    body: {
      alias: string
      email?: string
      snapshot?: {
        name?: string
        lastname?: string
        email?: string
        phone?: string
        companyName?: string
        taxId?: string
        address?: string
      }
    }
    response: {
      id: string
      role: "client" | "provider"
      alias: string
      userId: string | null
      counterpartyCompanyId: string | null
      snapshot: Record<string, string>
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/providers/{counterpartyId}": {
    /** Editar un proveedor */
    params: {
      companyId: string
      counterpartyId: string
    }
    body: {
      alias?: string
      snapshot?: {
        name?: string
        lastname?: string
        email?: string
        phone?: string
        companyName?: string
        taxId?: string
        address?: string
      }
    }
    response: {
      id: string
      role: "client" | "provider"
      alias: string
      userId: string | null
      counterpartyCompanyId: string | null
      snapshot: Record<string, string>
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/providers/{counterpartyId}": {
    /** Dar de baja un proveedor */
    params: {
      companyId: string
      counterpartyId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/roles": {
    /** Listar los roles de una empresa */
    params: {
      companyId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        name: string
        permissions: Array<string>
        memberCount: number
        createdAt: string
        updatedAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "POST /companies/{companyId}/roles": {
    /** Crear un rol */
    params: {
      companyId: string
    }
    headers?: {
      "idempotency-key"?: string
    }
    body: {
      name: string
      permissions?: Array<string>
    }
    response: {
      id: string
      name: string
      permissions: Array<string>
      memberCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/roles/{roleId}": {
    /** Editar un rol */
    params: {
      companyId: string
      roleId: string
    }
    body: {
      name?: string
      permissions?: Array<string>
    }
    response: {
      id: string
      name: string
      permissions: Array<string>
      memberCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/roles/{roleId}": {
    /** Eliminar un rol */
    params: {
      companyId: string
      roleId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/shipments/{shipmentId}": {
    /** Ver un envío y su seguimiento */
    params: {
      companyId: string
      shipmentId: string
    }
    response: {
      id: string
      orderId: string
      orderReference: string
      mode: string
      cost: string
      status: "pending" | "shipped" | "in_transit" | "delivered" | "returned" | "canceled"
      carrier: string
      trackingNumber: string | null
      estimatedDeliveryAt: string | null
      deliveredAt: string | null
      notes: string | null
      createdAt: string
      updatedAt: string
      allowedTransitions: Array<"pending" | "shipped" | "in_transit" | "delivered" | "returned" | "canceled">
    }
  }

  "PATCH /companies/{companyId}/shipments/{shipmentId}": {
    /** Registrar paquetería, guía y fecha estimada */
    params: {
      companyId: string
      shipmentId: string
    }
    body: {
      carrier?: string
      trackingNumber?: string | null
      estimatedDeliveryAt?: string | null
      notes?: string | null
    }
    response: {
      id: string
      orderId: string
      orderReference: string
      mode: string
      cost: string
      status: "pending" | "shipped" | "in_transit" | "delivered" | "returned" | "canceled"
      carrier: string
      trackingNumber: string | null
      estimatedDeliveryAt: string | null
      deliveredAt: string | null
      notes: string | null
      createdAt: string
      updatedAt: string
      allowedTransitions: Array<"pending" | "shipped" | "in_transit" | "delivered" | "returned" | "canceled">
    }
  }

  "POST /companies/{companyId}/shipments/{shipmentId}/status": {
    /** Mover el envío por su ciclo de vida */
    params: {
      companyId: string
      shipmentId: string
    }
    body: {
      status: "pending" | "shipped" | "in_transit" | "delivered" | "returned" | "canceled"
    }
    response: {
      id: string
      orderId: string
      orderReference: string
      mode: string
      cost: string
      status: "pending" | "shipped" | "in_transit" | "delivered" | "returned" | "canceled"
      carrier: string
      trackingNumber: string | null
      estimatedDeliveryAt: string | null
      deliveredAt: string | null
      notes: string | null
      createdAt: string
      updatedAt: string
      allowedTransitions: Array<"pending" | "shipped" | "in_transit" | "delivered" | "returned" | "canceled">
    }
  }

  "POST /companies/{companyId}/shipping/estimate": {
    /** Calcular el costo de un envío */
    params: {
      companyId: string
    }
    body: {
      mode: "local" | "national" | "international" | "pickup"
      items: Array<{
        id: string
        quantity: number
        length?: string
        width?: string
        height?: string
        lengthUnit: "cm" | "m" | "in" | "ft"
        weight?: string
        weightUnit: "g" | "kg" | "lb" | "oz"
      }>
      toAddressId?: string
    }
    response: {
      version: 1
      mode: "local" | "national" | "international" | "pickup"
      realWeightKg: string
      volumetricWeightKg: string
      billableWeightKg: string
      itemCount: number
      distanceKm?: number
      base: string
      variable: string
      surcharges: Array<{
        kind: "distance" | "item_count"
        threshold: number
        amount: string
      }>
      surchargeTotal: string
      currency: string
      total: string
      sourceCurrency?: string
      sourceTotal?: string
      exchangeRate?: string
      requiresDeliveryAddress: boolean
    }
  }

  "GET /companies/{companyId}/shipping/rates": {
    /** Ver el cuadro de tarifas de envío de una empresa */
    params: {
      companyId: string
    }
    response: {
      currency: string
      volumetricDivisor: number
      localBase: string
      localPerKilogram: string
      nationalBase: string
      nationalPerKilogram: string
      internationalBase: string
      internationalPerKilogram: string
      distanceSurcharges: Array<{
        over: number
        amount: string
      }>
      itemSurcharges: Array<{
        over: number
        amount: string
      }>
      exchangeCurrency: string | null
      exchangeRate: string | null
      configured: boolean
    }
  }

  "PATCH /companies/{companyId}/shipping/rates": {
    /** Cambiar el cuadro de tarifas de envío */
    params: {
      companyId: string
    }
    body: {
      currency?: string
      volumetricDivisor?: number
      localBase?: string
      localPerKilogram?: string
      nationalBase?: string
      nationalPerKilogram?: string
      internationalBase?: string
      internationalPerKilogram?: string
      distanceSurcharges?: Array<{
        over: number
        amount: string
      }>
      itemSurcharges?: Array<{
        over: number
        amount: string
      }>
      exchangeCurrency?: string | null
      exchangeRate?: string | null
    }
    response: {
      currency: string
      volumetricDivisor: number
      localBase: string
      localPerKilogram: string
      nationalBase: string
      nationalPerKilogram: string
      internationalBase: string
      internationalPerKilogram: string
      distanceSurcharges: Array<{
        over: number
        amount: string
      }>
      itemSurcharges: Array<{
        over: number
        amount: string
      }>
      exchangeCurrency: string | null
      exchangeRate: string | null
      configured: boolean
    }
  }

  "POST /companies/{companyId}/subscription": {
    /** Contratar un plan */
    params: {
      companyId: string
    }
    body: {
      planId: string
      interval: "day" | "week" | "month" | "year"
      seats: number
      promotionCode?: string
    }
    response: {
      kind: "checkout" | "activada"
      url?: string
      subscription?: {
        id: string
        status: string
        planId: string
        planTier: number
        planTitle: string
        seats: number
        cancelAtPeriodEnd: boolean
        periodStart: string | null
        periodEnd: string | null
        gracePeriodEndsAt: string | null
        discountPercent: string | null
        promotionCode: string | null
        interval: string
        isOperating: boolean
      }
    }
  }

  "PATCH /companies/{companyId}/subscription": {
    /** Cambiar de plan, conservando los asientos */
    params: {
      companyId: string
    }
    body: {
      planId: string
      interval?: "day" | "week" | "month" | "year"
    }
    response: {
      kind: "aplicado" | "checkout"
      url?: string
      subscription?: {
        id: string
        status: string
        planId: string
        planTier: number
        planTitle: string
        seats: number
        cancelAtPeriodEnd: boolean
        periodStart: string | null
        periodEnd: string | null
        gracePeriodEndsAt: string | null
        discountPercent: string | null
        promotionCode: string | null
        interval: string
        isOperating: boolean
      }
      due?: string
      credit?: string
      charge?: string
    }
  }

  "POST /companies/{companyId}/subscription/cancel": {
    /** Cancelar al terminar el periodo pagado */
    params: {
      companyId: string
    }
    response: {
      id: string
      status: string
      planId: string
      planTier: number
      planTitle: string
      seats: number
      cancelAtPeriodEnd: boolean
      periodStart: string | null
      periodEnd: string | null
      gracePeriodEndsAt: string | null
      discountPercent: string | null
      promotionCode: string | null
      interval: string
      isOperating: boolean
    }
  }

  "GET /companies/{companyId}/subscription/payments": {
    /** Historial de cobros de la suscripción */
    params: {
      companyId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      sort_createdAt?: string | Array<string>
      succeeded?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        amount: string
        currency: string
        seats: number
        periodStart: string | null
        periodEnd: string | null
        succeeded: boolean
        externalInvoiceId: string | null
        createdAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "POST /companies/{companyId}/subscription/reactivate": {
    /** Revertir la cancelación mientras el periodo siga vigente */
    params: {
      companyId: string
    }
    response: {
      id: string
      status: string
      planId: string
      planTier: number
      planTitle: string
      seats: number
      cancelAtPeriodEnd: boolean
      periodStart: string | null
      periodEnd: string | null
      gracePeriodEndsAt: string | null
      discountPercent: string | null
      promotionCode: string | null
      interval: string
      isOperating: boolean
    }
  }

  "POST /companies/{companyId}/uploads": {
    /** Registrar un archivo y autorizar su escritura */
    params: {
      companyId: string
    }
    body: {
      fileName: string
      contentType: string
      byteSize: number
      kind?: "image" | "video" | "document" | "file" | "signature"
      derivativeContentType?: string
    }
    response: {
      upload: {
        id: string
        kind: "image" | "video" | "document" | "file" | "signature"
        status: "pending" | "uploaded" | "error"
        url: string
        variants: {
          thumbnail: string | null
          small: string | null
          medium: string | null
          large: string | null
        } | null
        fileName: string
        extension: string
        contentType: string
        byteSize: number
      }
      targets: Array<{
        variant: "original" | "thumbnail" | "small" | "medium" | "large"
        method: "PUT"
        url: string
        headers: Record<string, string>
        expiresAt: string
      }>
    }
  }

  "POST /companies/{companyId}/uploads/{uploadId}/confirm": {
    /** Decir qué se escribió de verdad */
    params: {
      companyId: string
      uploadId: string
    }
    body: {
      written: Array<"original" | "thumbnail" | "small" | "medium" | "large">
    } | {
      failed: true
      reason?: "decode" | "network" | "abandoned"
    }
    response: {
      id: string
      kind: "image" | "video" | "document" | "file" | "signature"
      status: "pending" | "uploaded" | "error"
      url: string
      variants: {
        thumbnail: string | null
        small: string | null
        medium: string | null
        large: string | null
      } | null
      fileName: string
      extension: string
      contentType: string
      byteSize: number
    }
  }

  "POST /companies/{companyId}/uploads/{uploadId}/targets": {
    /** Volver a autorizar la escritura de un archivo pendiente */
    params: {
      companyId: string
      uploadId: string
    }
    body: {
      derivativeContentType?: string
    }
    response: {
      upload: {
        id: string
        kind: "image" | "video" | "document" | "file" | "signature"
        status: "pending" | "uploaded" | "error"
        url: string
        variants: {
          thumbnail: string | null
          small: string | null
          medium: string | null
          large: string | null
        } | null
        fileName: string
        extension: string
        contentType: string
        byteSize: number
      }
      targets: Array<{
        variant: "original" | "thumbnail" | "small" | "medium" | "large"
        method: "PUT"
        url: string
        headers: Record<string, string>
        expiresAt: string
      }>
    }
  }

  "GET /companies/{companyId}/warehouses": {
    /** Listar los almacenes de una empresa */
    params: {
      companyId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_priority?: string | Array<string>
      sort_createdAt?: string | Array<string>
      isPublished?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        companyId: string
        name: string
        description: string
        slug: string | null
        isPublished: boolean
        priority: string
        imageUploadId: string | null
        imageUrl: string | null
        imageThumbnailUrl: string | null
        createdAt: string
        updatedAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "POST /companies/{companyId}/warehouses": {
    /** Crear un almacén */
    params: {
      companyId: string
    }
    body: {
      name: string
      description?: string
      priority?: string
      isPublished?: boolean
      imageUploadId?: string | null
    }
    response: {
      id: string
      companyId: string
      name: string
      description: string
      slug: string | null
      isPublished: boolean
      priority: string
      imageUploadId: string | null
      imageUrl: string | null
      imageThumbnailUrl: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}": {
    /** Ver un almacén */
    params: {
      companyId: string
      warehouseId: string
    }
    response: {
      id: string
      companyId: string
      name: string
      description: string
      slug: string | null
      isPublished: boolean
      priority: string
      imageUploadId: string | null
      imageUrl: string | null
      imageThumbnailUrl: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/warehouses/{warehouseId}": {
    /** Editar un almacén */
    params: {
      companyId: string
      warehouseId: string
    }
    body: {
      name?: string
      description?: string
      priority?: string
      isPublished?: boolean
      slug?: string
      imageUploadId?: string | null
    }
    response: {
      id: string
      companyId: string
      name: string
      description: string
      slug: string | null
      isPublished: boolean
      priority: string
      imageUploadId: string | null
      imageUrl: string | null
      imageThumbnailUrl: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/warehouses/{warehouseId}": {
    /** Dar de baja un almacén */
    params: {
      companyId: string
      warehouseId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/categories": {
    /** Listar categorías; sin «parentId», las raíces */
    params: {
      companyId: string
      warehouseId: string
    }
    query?: {
      parentId?: string
    }
    response: {
      items: Array<{
        id: string
        warehouseId: string
        parentId: string | null
        name: string
        description: string
        slug: string | null
        color: string | null
        icon: string | null
        childCount: number
        createdAt: string
        updatedAt: string
      }>
    }
  }

  "POST /companies/{companyId}/warehouses/{warehouseId}/categories": {
    /** Crear una categoría del almacén */
    params: {
      companyId: string
      warehouseId: string
    }
    body: {
      name: string
      description?: string
      parentId?: string | null
      color?: string
      icon?: string
    }
    response: {
      id: string
      warehouseId: string
      parentId: string | null
      name: string
      description: string
      slug: string | null
      color: string | null
      icon: string | null
      childCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/categories/{categoryId}": {
    /** Ver una categoría del almacén */
    params: {
      companyId: string
      warehouseId: string
      categoryId: string
    }
    response: {
      id: string
      warehouseId: string
      parentId: string | null
      name: string
      description: string
      slug: string | null
      color: string | null
      icon: string | null
      childCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/warehouses/{warehouseId}/categories/{categoryId}": {
    /** Editar o re-colgar una categoría */
    params: {
      companyId: string
      warehouseId: string
      categoryId: string
    }
    body: {
      name?: string
      description?: string
      parentId?: string | null
      color?: string | null
      icon?: string | null
    }
    response: {
      id: string
      warehouseId: string
      parentId: string | null
      name: string
      description: string
      slug: string | null
      color: string | null
      icon: string | null
      childCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/warehouses/{warehouseId}/categories/{categoryId}": {
    /** Eliminar una categoría y su subárbol */
    params: {
      companyId: string
      warehouseId: string
      categoryId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/categories/{categoryId}/path": {
    /** El camino desde la raíz hasta una categoría */
    params: {
      companyId: string
      warehouseId: string
      categoryId: string
    }
    response: {
      items: Array<{
        id: string
        warehouseId: string
        parentId: string | null
        name: string
        description: string
        slug: string | null
        color: string | null
        icon: string | null
        childCount: number
        createdAt: string
        updatedAt: string
      }>
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/categories/{categoryId}/scope": {
    /** Qué se lleva por delante eliminar la categoría */
    params: {
      companyId: string
      warehouseId: string
      categoryId: string
    }
    response: {
      categories: number
      products: number
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/measurements/{measurementId}/units": {
    /** Listar las unidades de una medida */
    params: {
      companyId: string
      warehouseId: string
      measurementId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      sort_code?: string | Array<string>
      sort_status?: string | Array<string>
      sort_createdAt?: string | Array<string>
      status?: string | Array<string>
      createdByReservation?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        measurementId: string
        code: string
        status: "available" | "in_quote" | "in_order" | "rented" | "sold" | "lost" | "damaged" | "robbed" | "incomplete" | "modified" | "expense"
        createdByReservation: boolean
        createdAt: string
        updatedAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "POST /companies/{companyId}/warehouses/{warehouseId}/measurements/{measurementId}/units": {
    /** Dar de alta unidades; una o varias, es la misma operación */
    params: {
      companyId: string
      warehouseId: string
      measurementId: string
    }
    body: {
      quantity: number
    }
    response: {
      items: Array<{
        id: string
        measurementId: string
        code: string
        status: "available" | "in_quote" | "in_order" | "rented" | "sold" | "lost" | "damaged" | "robbed" | "incomplete" | "modified" | "expense"
        createdByReservation: boolean
        createdAt: string
        updatedAt: string
      }>
    }
  }

  "PATCH /companies/{companyId}/warehouses/{warehouseId}/measurements/{measurementId}/units": {
    /** Cambiar el estado de unas unidades, o de todas las de la medida */
    params: {
      companyId: string
      warehouseId: string
      measurementId: string
    }
    body: {
      unitIds?: Array<string>
      status: "available" | "in_quote" | "in_order" | "rented" | "sold" | "lost" | "damaged" | "robbed" | "incomplete" | "modified" | "expense"
      note?: string
    }
    response: {
      items: Array<{
        id: string
        measurementId: string
        code: string
        status: "available" | "in_quote" | "in_order" | "rented" | "sold" | "lost" | "damaged" | "robbed" | "incomplete" | "modified" | "expense"
        createdByReservation: boolean
        createdAt: string
        updatedAt: string
      }>
    }
  }

  "DELETE /companies/{companyId}/warehouses/{warehouseId}/measurements/{measurementId}/units": {
    /** Dar de baja unidades */
    params: {
      companyId: string
      warehouseId: string
      measurementId: string
    }
    body: {
      unitIds: Array<string>
    }
    response: undefined
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/orders": {
    /** La bandeja de pedidos del almacén */
    params: {
      companyId: string
      warehouseId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_priority?: string | Array<string>
      sort_createdAt?: string | Array<string>
      sort_name?: string | Array<string>
      sort_code?: string | Array<string>
      status?: string | Array<string>
      type?: string | Array<string>
      origin?: string | Array<string>
      clientId?: string | Array<string>
      providerId?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        warehouseId: string
        code: string
        name: string
        observations: string
        origin: "production" | "storefront"
        type: "rent" | "sale"
        status: "pending" | "accepted" | "delivered" | "finished" | "canceled"
        quoteId: string | null
        purchaseOrderId: string | null
        buyerOrderId: string | null
        clientId: string | null
        providerId: string | null
        canceledAt: string | null
        canceledById: string | null
        cancelReason: string | null
        unread: number
        createdAt: string
        updatedAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "POST /companies/{companyId}/warehouses/{warehouseId}/orders": {
    /** Registrar un pedido */
    params: {
      companyId: string
      warehouseId: string
    }
    body: {
      origin: "production" | "storefront"
      type: "rent" | "sale"
      name?: string
      observations?: string
      clientId?: string
      providerId?: string
      purchaseOrderId?: string
      lines?: Array<{
        measurementId: string
        quantity: number
      }>
    }
    response: {
      id: string
      warehouseId: string
      code: string
      name: string
      observations: string
      origin: "production" | "storefront"
      type: "rent" | "sale"
      status: "pending" | "accepted" | "delivered" | "finished" | "canceled"
      quoteId: string | null
      purchaseOrderId: string | null
      buyerOrderId: string | null
      clientId: string | null
      providerId: string | null
      canceledAt: string | null
      canceledById: string | null
      cancelReason: string | null
      unread: number
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}": {
    /** Un pedido */
    params: {
      companyId: string
      warehouseId: string
      orderId: string
    }
    response: {
      id: string
      warehouseId: string
      code: string
      name: string
      observations: string
      origin: "production" | "storefront"
      type: "rent" | "sale"
      status: "pending" | "accepted" | "delivered" | "finished" | "canceled"
      quoteId: string | null
      purchaseOrderId: string | null
      buyerOrderId: string | null
      clientId: string | null
      providerId: string | null
      canceledAt: string | null
      canceledById: string | null
      cancelReason: string | null
      unread: number
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}": {
    /** Dar de baja un pedido */
    params: {
      companyId: string
      warehouseId: string
      orderId: string
    }
    response: undefined
  }

  "POST /companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}/acceptance": {
    /** Aceptar un pedido y generar su cotización */
    params: {
      companyId: string
      warehouseId: string
      orderId: string
    }
    body: {
      includeAll?: boolean
      allowMinting?: boolean
    }
    response: {
      order: {
        id: string
        warehouseId: string
        code: string
        name: string
        observations: string
        origin: "production" | "storefront"
        type: "rent" | "sale"
        status: "pending" | "accepted" | "delivered" | "finished" | "canceled"
        quoteId: string | null
        purchaseOrderId: string | null
        buyerOrderId: string | null
        clientId: string | null
        providerId: string | null
        canceledAt: string | null
        canceledById: string | null
        cancelReason: string | null
        unread: number
        createdAt: string
        updatedAt: string
      }
      quoteId: string
      excluded: Array<{
        lineId: string
        productName: string
        measurementName: string
        requested: number
        available: number
      }>
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}/lines": {
    /** Las líneas de un pedido, con la existencia libre de cada medida */
    params: {
      companyId: string
      warehouseId: string
      orderId: string
    }
    response: {
      items: Array<{
        id: string
        orderId: string
        measurementId: string
        measurementName: string
        productId: string
        productName: string
        productCode: string
        quantity: number
        available: number
        position: number
      }>
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}/messages": {
    /** La conversación del pedido */
    params: {
      companyId: string
      warehouseId: string
      orderId: string
    }
    query?: {
      before?: string
      since?: string
      limit?: number
    }
    response: {
      items: Array<{
        id: string
        orderId: string
        side: "client" | "provider" | "system"
        authorId: string | null
        authorName: string | null
        body: string
        replyToId: string | null
        readByClientAt: string | null
        readByProviderAt: string | null
        editedAt: string | null
        deletedAt: string | null
        createdAt: string
        updatedAt: string
      }>
      side: "client" | "provider" | "system"
      hasMore: boolean
      olderCursor: string | null
      syncCursor: string
      unread: number
    }
  }

  "POST /companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}/messages": {
    /** Escribir en la conversación */
    params: {
      companyId: string
      warehouseId: string
      orderId: string
    }
    body: {
      body: string
      replyToId?: string
      clientRef?: string
    }
    response: {
      message: {
        id: string
        orderId: string
        side: "client" | "provider" | "system"
        authorId: string | null
        authorName: string | null
        body: string
        replyToId: string | null
        readByClientAt: string | null
        readByProviderAt: string | null
        editedAt: string | null
        deletedAt: string | null
        createdAt: string
        updatedAt: string
      }
      clientRef: string | null
    }
  }

  "POST /companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}/messages/read": {
    /** Marcar como leído lo pendiente de este lado */
    params: {
      companyId: string
      warehouseId: string
      orderId: string
    }
    body: Record<string, never>
    response: {
      read: number
      unread: number
      syncCursor: string
    }
  }

  "PATCH /companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}/messages/{messageId}": {
    /** Editar un mensaje propio */
    params: {
      companyId: string
      warehouseId: string
      orderId: string
      messageId: string
    }
    body: {
      body: string
    }
    response: {
      id: string
      orderId: string
      side: "client" | "provider" | "system"
      authorId: string | null
      authorName: string | null
      body: string
      replyToId: string | null
      readByClientAt: string | null
      readByProviderAt: string | null
      editedAt: string | null
      deletedAt: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}/messages/{messageId}": {
    /** Borrar un mensaje propio */
    params: {
      companyId: string
      warehouseId: string
      orderId: string
      messageId: string
    }
    response: undefined
  }

  "POST /companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}/rejection": {
    /** Rechazar un pedido, con su motivo */
    params: {
      companyId: string
      warehouseId: string
      orderId: string
    }
    body: {
      reason: string
    }
    response: {
      id: string
      warehouseId: string
      code: string
      name: string
      observations: string
      origin: "production" | "storefront"
      type: "rent" | "sale"
      status: "pending" | "accepted" | "delivered" | "finished" | "canceled"
      quoteId: string | null
      purchaseOrderId: string | null
      buyerOrderId: string | null
      clientId: string | null
      providerId: string | null
      canceledAt: string | null
      canceledById: string | null
      cancelReason: string | null
      unread: number
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/warehouses/{warehouseId}/orders/{orderId}/status": {
    /** Avanzar el pedido */
    params: {
      companyId: string
      warehouseId: string
      orderId: string
    }
    body: {
      status: "pending" | "accepted" | "delivered" | "finished" | "canceled"
    }
    response: {
      id: string
      warehouseId: string
      code: string
      name: string
      observations: string
      origin: "production" | "storefront"
      type: "rent" | "sale"
      status: "pending" | "accepted" | "delivered" | "finished" | "canceled"
      quoteId: string | null
      purchaseOrderId: string | null
      buyerOrderId: string | null
      clientId: string | null
      providerId: string | null
      canceledAt: string | null
      canceledById: string | null
      cancelReason: string | null
      unread: number
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/price-lists": {
    /** Listar las listas de precios de un almacén */
    params: {
      companyId: string
      warehouseId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        warehouseId: string
        name: string
        description: string
        productCount: number
        createdAt: string
        updatedAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "POST /companies/{companyId}/warehouses/{warehouseId}/price-lists": {
    /** Crear una lista de precios */
    params: {
      companyId: string
      warehouseId: string
    }
    body: {
      name: string
      description?: string
    }
    response: {
      id: string
      warehouseId: string
      name: string
      description: string
      productCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/price-lists/{priceListId}": {
    /** Ver una lista de precios */
    params: {
      companyId: string
      warehouseId: string
      priceListId: string
    }
    response: {
      id: string
      warehouseId: string
      name: string
      description: string
      productCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/warehouses/{warehouseId}/price-lists/{priceListId}": {
    /** Editar una lista de precios */
    params: {
      companyId: string
      warehouseId: string
      priceListId: string
    }
    body: {
      name?: string
      description?: string
    }
    response: {
      id: string
      warehouseId: string
      name: string
      description: string
      productCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/warehouses/{warehouseId}/price-lists/{priceListId}": {
    /** Dar de baja una lista de precios */
    params: {
      companyId: string
      warehouseId: string
      priceListId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/price-lists/{priceListId}/prices": {
    /** Las tarifas de una lista */
    params: {
      companyId: string
      warehouseId: string
      priceListId: string
    }
    response: {
      items: Array<{
        id: string
        priceListId: string
        productId: string
        productName: string
        productCode: string
        sale: string
        rent: {
          isFixed: boolean
          fixed?: string
          daily?: string
          weekly?: string
          monthly?: string
        }
        penalty: {
          isFixed: boolean
          fixed?: string
          daily?: string
          weekly?: string
          monthly?: string
        }
        createdAt: string
        updatedAt: string
      }>
    }
  }

  "PUT /companies/{companyId}/warehouses/{warehouseId}/price-lists/{priceListId}/prices/{productId}": {
    /** Fijar la tarifa de un producto en una lista */
    params: {
      companyId: string
      warehouseId: string
      priceListId: string
      productId: string
    }
    body: {
      sale?: string
      rent?: {
        isFixed: boolean
        fixed?: string
        daily?: string
        weekly?: string
        monthly?: string
      }
      penalty?: {
        isFixed: boolean
        fixed?: string
        daily?: string
        weekly?: string
        monthly?: string
      }
    }
    response: {
      id: string
      priceListId: string
      productId: string
      productName: string
      productCode: string
      sale: string
      rent: {
        isFixed: boolean
        fixed?: string
        daily?: string
        weekly?: string
        monthly?: string
      }
      penalty: {
        isFixed: boolean
        fixed?: string
        daily?: string
        weekly?: string
        monthly?: string
      }
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/warehouses/{warehouseId}/price-lists/{priceListId}/prices/{productId}": {
    /** Retirar un producto de una lista */
    params: {
      companyId: string
      warehouseId: string
      priceListId: string
      productId: string
    }
    response: undefined
  }

  "PUT /companies/{companyId}/warehouses/{warehouseId}/price-lists/{priceListId}/products": {
    /** Establecer el conjunto de productos de una lista */
    params: {
      companyId: string
      warehouseId: string
      priceListId: string
    }
    body: {
      productIds: Array<string>
    }
    response: {
      added: number
      removed: number
      kept: number
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/price-lists/{priceListId}/scope": {
    /** Qué se lleva por delante dar de baja la lista */
    params: {
      companyId: string
      warehouseId: string
      priceListId: string
    }
    response: {
      products: number
      quotes: number
      openQuotes: number
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/products": {
    /** Listar el catálogo; sólo los productos raíz */
    params: {
      companyId: string
      warehouseId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_code?: string | Array<string>
      sort_createdAt?: string | Array<string>
      categoryId?: string | Array<string>
      globalCategoryId?: string | Array<string>
      storageId?: string | Array<string>
      isPublished?: string | Array<string>
      isProvisional?: string | Array<string>
      availableForSale?: string | Array<string>
      availableForRent?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        warehouseId: string
        parentId: string | null
        relationToParent: "variant" | "accessory" | null
        name: string
        description: string
        internalCode: string | null
        code: string
        cost: string
        price: string
        usesPriceLists: boolean
        availableForSale: boolean
        availableForRent: boolean
        storageId: string | null
        categoryId: string | null
        globalCategoryId: string | null
        responsibleId: string | null
        slug: string | null
        isPublished: boolean
        isProvisional: boolean
        coverUrl: string | null
        createdAt: string
        updatedAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "POST /companies/{companyId}/warehouses/{warehouseId}/products": {
    /** Crear un producto con toda su estructura, en una transacción */
    params: {
      companyId: string
      warehouseId: string
    }
    body: {
      name: string
      description?: string
      internalCode?: string
      cost?: string
      price?: string
      usesPriceLists?: boolean
      availableForSale?: boolean
      availableForRent?: boolean
      storageId?: string | null
      categoryId?: string | null
      globalCategoryId?: string | null
      responsibleId?: string | null
      isPublished?: boolean
      isProvisional?: boolean
      measurements?: Array<{
        name: string
        kind?: "box" | "envelope" | "clothing" | "accessory" | "other"
        priceDifference?: string
        dimensions?: {
          height?: number
          width?: number
          length?: number
          weight?: number
        }
        lengthUnit?: "cm" | "m" | "in" | "ft"
        massUnit?: "g" | "kg" | "lb" | "oz"
        clothing?: {
          garment?: string
          size?: string
          custom?: string
          measurements?: Record<string, number>
        }
        initialQuantity?: number
      }>
      variants?: Array<{
        name: string
        description?: string
        internalCode?: string
        cost?: string
        price?: string
        measurements?: Array<{
          name: string
          kind?: "box" | "envelope" | "clothing" | "accessory" | "other"
          priceDifference?: string
          dimensions?: {
            height?: number
            width?: number
            length?: number
            weight?: number
          }
          lengthUnit?: "cm" | "m" | "in" | "ft"
          massUnit?: "g" | "kg" | "lb" | "oz"
          clothing?: {
            garment?: string
            size?: string
            custom?: string
            measurements?: Record<string, number>
          }
          initialQuantity?: number
        }>
      }>
      accessories?: Array<{
        name: string
        description?: string
        internalCode?: string
        cost?: string
        price?: string
        measurements?: Array<{
          name: string
          kind?: "box" | "envelope" | "clothing" | "accessory" | "other"
          priceDifference?: string
          dimensions?: {
            height?: number
            width?: number
            length?: number
            weight?: number
          }
          lengthUnit?: "cm" | "m" | "in" | "ft"
          massUnit?: "g" | "kg" | "lb" | "oz"
          clothing?: {
            garment?: string
            size?: string
            custom?: string
            measurements?: Record<string, number>
          }
          initialQuantity?: number
        }>
      }>
    }
    response: {
      id: string
      warehouseId: string
      parentId: string | null
      relationToParent: "variant" | "accessory" | null
      name: string
      description: string
      internalCode: string | null
      code: string
      cost: string
      price: string
      usesPriceLists: boolean
      availableForSale: boolean
      availableForRent: boolean
      storageId: string | null
      categoryId: string | null
      globalCategoryId: string | null
      responsibleId: string | null
      slug: string | null
      isPublished: boolean
      isProvisional: boolean
      coverUrl: string | null
      createdAt: string
      updatedAt: string
      measurements: Array<{
        id: string
        productId: string
        name: string
        kind: "box" | "envelope" | "clothing" | "accessory" | "other"
        priceDifference: string
        dimensions: {
          height?: number
          width?: number
          length?: number
          weight?: number
        }
        lengthUnit: "cm" | "m" | "in" | "ft"
        massUnit: "g" | "kg" | "lb" | "oz"
        clothing: {
          garment?: string
          size?: string
          custom?: string
          measurements?: Record<string, number>
        } | null
        units: Record<string, number>
        createdAt: string
        updatedAt: string
      }>
      variants: Array<{
        id: string
        warehouseId: string
        parentId: string | null
        relationToParent: "variant" | "accessory" | null
        name: string
        description: string
        internalCode: string | null
        code: string
        cost: string
        price: string
        usesPriceLists: boolean
        availableForSale: boolean
        availableForRent: boolean
        storageId: string | null
        categoryId: string | null
        globalCategoryId: string | null
        responsibleId: string | null
        slug: string | null
        isPublished: boolean
        isProvisional: boolean
        coverUrl: string | null
        createdAt: string
        updatedAt: string
      }>
      accessories: Array<{
        id: string
        warehouseId: string
        parentId: string | null
        relationToParent: "variant" | "accessory" | null
        name: string
        description: string
        internalCode: string | null
        code: string
        cost: string
        price: string
        usesPriceLists: boolean
        availableForSale: boolean
        availableForRent: boolean
        storageId: string | null
        categoryId: string | null
        globalCategoryId: string | null
        responsibleId: string | null
        slug: string | null
        isPublished: boolean
        isProvisional: boolean
        coverUrl: string | null
        createdAt: string
        updatedAt: string
      }>
      images: Array<{
        uploadId: string
        url: string
        thumbnailUrl: string | null
        position: number
        isCover: boolean
      }>
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/products/{productId}": {
    /** Ver un producto con su estructura */
    params: {
      companyId: string
      warehouseId: string
      productId: string
    }
    response: {
      id: string
      warehouseId: string
      parentId: string | null
      relationToParent: "variant" | "accessory" | null
      name: string
      description: string
      internalCode: string | null
      code: string
      cost: string
      price: string
      usesPriceLists: boolean
      availableForSale: boolean
      availableForRent: boolean
      storageId: string | null
      categoryId: string | null
      globalCategoryId: string | null
      responsibleId: string | null
      slug: string | null
      isPublished: boolean
      isProvisional: boolean
      coverUrl: string | null
      createdAt: string
      updatedAt: string
      measurements: Array<{
        id: string
        productId: string
        name: string
        kind: "box" | "envelope" | "clothing" | "accessory" | "other"
        priceDifference: string
        dimensions: {
          height?: number
          width?: number
          length?: number
          weight?: number
        }
        lengthUnit: "cm" | "m" | "in" | "ft"
        massUnit: "g" | "kg" | "lb" | "oz"
        clothing: {
          garment?: string
          size?: string
          custom?: string
          measurements?: Record<string, number>
        } | null
        units: Record<string, number>
        createdAt: string
        updatedAt: string
      }>
      variants: Array<{
        id: string
        warehouseId: string
        parentId: string | null
        relationToParent: "variant" | "accessory" | null
        name: string
        description: string
        internalCode: string | null
        code: string
        cost: string
        price: string
        usesPriceLists: boolean
        availableForSale: boolean
        availableForRent: boolean
        storageId: string | null
        categoryId: string | null
        globalCategoryId: string | null
        responsibleId: string | null
        slug: string | null
        isPublished: boolean
        isProvisional: boolean
        coverUrl: string | null
        createdAt: string
        updatedAt: string
      }>
      accessories: Array<{
        id: string
        warehouseId: string
        parentId: string | null
        relationToParent: "variant" | "accessory" | null
        name: string
        description: string
        internalCode: string | null
        code: string
        cost: string
        price: string
        usesPriceLists: boolean
        availableForSale: boolean
        availableForRent: boolean
        storageId: string | null
        categoryId: string | null
        globalCategoryId: string | null
        responsibleId: string | null
        slug: string | null
        isPublished: boolean
        isProvisional: boolean
        coverUrl: string | null
        createdAt: string
        updatedAt: string
      }>
      images: Array<{
        uploadId: string
        url: string
        thumbnailUrl: string | null
        position: number
        isCover: boolean
      }>
    }
  }

  "PATCH /companies/{companyId}/warehouses/{warehouseId}/products/{productId}": {
    /** Editar un producto; reclasificarlo se propaga a sus hijos */
    params: {
      companyId: string
      warehouseId: string
      productId: string
    }
    body: {
      name?: string
      description?: string
      internalCode?: string | null
      cost?: string
      price?: string
      usesPriceLists?: boolean
      availableForSale?: boolean
      availableForRent?: boolean
      storageId?: string | null
      categoryId?: string | null
      globalCategoryId?: string | null
      responsibleId?: string | null
      isPublished?: boolean
      isProvisional?: boolean
      slug?: string
    }
    response: {
      id: string
      warehouseId: string
      parentId: string | null
      relationToParent: "variant" | "accessory" | null
      name: string
      description: string
      internalCode: string | null
      code: string
      cost: string
      price: string
      usesPriceLists: boolean
      availableForSale: boolean
      availableForRent: boolean
      storageId: string | null
      categoryId: string | null
      globalCategoryId: string | null
      responsibleId: string | null
      slug: string | null
      isPublished: boolean
      isProvisional: boolean
      coverUrl: string | null
      createdAt: string
      updatedAt: string
      measurements: Array<{
        id: string
        productId: string
        name: string
        kind: "box" | "envelope" | "clothing" | "accessory" | "other"
        priceDifference: string
        dimensions: {
          height?: number
          width?: number
          length?: number
          weight?: number
        }
        lengthUnit: "cm" | "m" | "in" | "ft"
        massUnit: "g" | "kg" | "lb" | "oz"
        clothing: {
          garment?: string
          size?: string
          custom?: string
          measurements?: Record<string, number>
        } | null
        units: Record<string, number>
        createdAt: string
        updatedAt: string
      }>
      variants: Array<{
        id: string
        warehouseId: string
        parentId: string | null
        relationToParent: "variant" | "accessory" | null
        name: string
        description: string
        internalCode: string | null
        code: string
        cost: string
        price: string
        usesPriceLists: boolean
        availableForSale: boolean
        availableForRent: boolean
        storageId: string | null
        categoryId: string | null
        globalCategoryId: string | null
        responsibleId: string | null
        slug: string | null
        isPublished: boolean
        isProvisional: boolean
        coverUrl: string | null
        createdAt: string
        updatedAt: string
      }>
      accessories: Array<{
        id: string
        warehouseId: string
        parentId: string | null
        relationToParent: "variant" | "accessory" | null
        name: string
        description: string
        internalCode: string | null
        code: string
        cost: string
        price: string
        usesPriceLists: boolean
        availableForSale: boolean
        availableForRent: boolean
        storageId: string | null
        categoryId: string | null
        globalCategoryId: string | null
        responsibleId: string | null
        slug: string | null
        isPublished: boolean
        isProvisional: boolean
        coverUrl: string | null
        createdAt: string
        updatedAt: string
      }>
      images: Array<{
        uploadId: string
        url: string
        thumbnailUrl: string | null
        position: number
        isCover: boolean
      }>
    }
  }

  "DELETE /companies/{companyId}/warehouses/{warehouseId}/products/{productId}": {
    /** Dar de baja un producto y su estructura */
    params: {
      companyId: string
      warehouseId: string
      productId: string
    }
    response: undefined
  }

  "POST /companies/{companyId}/warehouses/{warehouseId}/products/{productId}/children": {
    /** Añadir una variante o un accesorio a un producto que ya existe */
    params: {
      companyId: string
      warehouseId: string
      productId: string
    }
    body: {
      name: string
      description?: string
      internalCode?: string
      cost?: string
      price?: string
      measurements?: Array<{
        name: string
        kind?: "box" | "envelope" | "clothing" | "accessory" | "other"
        priceDifference?: string
        dimensions?: {
          height?: number
          width?: number
          length?: number
          weight?: number
        }
        lengthUnit?: "cm" | "m" | "in" | "ft"
        massUnit?: "g" | "kg" | "lb" | "oz"
        clothing?: {
          garment?: string
          size?: string
          custom?: string
          measurements?: Record<string, number>
        }
        initialQuantity?: number
      }>
      relation: "variant" | "accessory"
    }
    response: {
      id: string
      warehouseId: string
      parentId: string | null
      relationToParent: "variant" | "accessory" | null
      name: string
      description: string
      internalCode: string | null
      code: string
      cost: string
      price: string
      usesPriceLists: boolean
      availableForSale: boolean
      availableForRent: boolean
      storageId: string | null
      categoryId: string | null
      globalCategoryId: string | null
      responsibleId: string | null
      slug: string | null
      isPublished: boolean
      isProvisional: boolean
      coverUrl: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "PUT /companies/{companyId}/warehouses/{warehouseId}/products/{productId}/images": {
    /** Sustituir la galería de un producto */
    params: {
      companyId: string
      warehouseId: string
      productId: string
    }
    body: {
      uploadIds: Array<string>
      coverUploadId?: string | null
    }
    response: {
      id: string
      warehouseId: string
      parentId: string | null
      relationToParent: "variant" | "accessory" | null
      name: string
      description: string
      internalCode: string | null
      code: string
      cost: string
      price: string
      usesPriceLists: boolean
      availableForSale: boolean
      availableForRent: boolean
      storageId: string | null
      categoryId: string | null
      globalCategoryId: string | null
      responsibleId: string | null
      slug: string | null
      isPublished: boolean
      isProvisional: boolean
      coverUrl: string | null
      createdAt: string
      updatedAt: string
      measurements: Array<{
        id: string
        productId: string
        name: string
        kind: "box" | "envelope" | "clothing" | "accessory" | "other"
        priceDifference: string
        dimensions: {
          height?: number
          width?: number
          length?: number
          weight?: number
        }
        lengthUnit: "cm" | "m" | "in" | "ft"
        massUnit: "g" | "kg" | "lb" | "oz"
        clothing: {
          garment?: string
          size?: string
          custom?: string
          measurements?: Record<string, number>
        } | null
        units: Record<string, number>
        createdAt: string
        updatedAt: string
      }>
      variants: Array<{
        id: string
        warehouseId: string
        parentId: string | null
        relationToParent: "variant" | "accessory" | null
        name: string
        description: string
        internalCode: string | null
        code: string
        cost: string
        price: string
        usesPriceLists: boolean
        availableForSale: boolean
        availableForRent: boolean
        storageId: string | null
        categoryId: string | null
        globalCategoryId: string | null
        responsibleId: string | null
        slug: string | null
        isPublished: boolean
        isProvisional: boolean
        coverUrl: string | null
        createdAt: string
        updatedAt: string
      }>
      accessories: Array<{
        id: string
        warehouseId: string
        parentId: string | null
        relationToParent: "variant" | "accessory" | null
        name: string
        description: string
        internalCode: string | null
        code: string
        cost: string
        price: string
        usesPriceLists: boolean
        availableForSale: boolean
        availableForRent: boolean
        storageId: string | null
        categoryId: string | null
        globalCategoryId: string | null
        responsibleId: string | null
        slug: string | null
        isPublished: boolean
        isProvisional: boolean
        coverUrl: string | null
        createdAt: string
        updatedAt: string
      }>
      images: Array<{
        uploadId: string
        url: string
        thumbnailUrl: string | null
        position: number
        isCover: boolean
      }>
    }
  }

  "POST /companies/{companyId}/warehouses/{warehouseId}/products/{productId}/measurements": {
    /** Añadir una medida, con su cantidad inicial */
    params: {
      companyId: string
      warehouseId: string
      productId: string
    }
    body: {
      name: string
      kind?: "box" | "envelope" | "clothing" | "accessory" | "other"
      priceDifference?: string
      dimensions?: {
        height?: number
        width?: number
        length?: number
        weight?: number
      }
      lengthUnit?: "cm" | "m" | "in" | "ft"
      massUnit?: "g" | "kg" | "lb" | "oz"
      clothing?: {
        garment?: string
        size?: string
        custom?: string
        measurements?: Record<string, number>
      }
      initialQuantity?: number
    }
    response: {
      id: string
      productId: string
      name: string
      kind: "box" | "envelope" | "clothing" | "accessory" | "other"
      priceDifference: string
      dimensions: {
        height?: number
        width?: number
        length?: number
        weight?: number
      }
      lengthUnit: "cm" | "m" | "in" | "ft"
      massUnit: "g" | "kg" | "lb" | "oz"
      clothing: {
        garment?: string
        size?: string
        custom?: string
        measurements?: Record<string, number>
      } | null
      units: Record<string, number>
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/warehouses/{warehouseId}/products/{productId}/measurements/{measurementId}": {
    /** Corregir una medida, sin tocar sus unidades */
    params: {
      companyId: string
      warehouseId: string
      productId: string
      measurementId: string
    }
    body: {
      name?: string
      kind?: "box" | "envelope" | "clothing" | "accessory" | "other"
      priceDifference?: string
      dimensions?: {
        height?: number
        width?: number
        length?: number
        weight?: number
      }
      lengthUnit?: "cm" | "m" | "in" | "ft"
      massUnit?: "g" | "kg" | "lb" | "oz"
      clothing?: {
        garment?: string
        size?: string
        custom?: string
        measurements?: Record<string, number>
      }
    }
    response: {
      id: string
      productId: string
      name: string
      kind: "box" | "envelope" | "clothing" | "accessory" | "other"
      priceDifference: string
      dimensions: {
        height?: number
        width?: number
        length?: number
        weight?: number
      }
      lengthUnit: "cm" | "m" | "in" | "ft"
      massUnit: "g" | "kg" | "lb" | "oz"
      clothing: {
        garment?: string
        size?: string
        custom?: string
        measurements?: Record<string, number>
      } | null
      units: Record<string, number>
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/warehouses/{warehouseId}/products/{productId}/measurements/{measurementId}": {
    /** Eliminar una medida y sus unidades */
    params: {
      companyId: string
      warehouseId: string
      productId: string
      measurementId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/products/{productId}/price": {
    /** Resolver el precio de un producto con la precedencia declarada */
    params: {
      companyId: string
      warehouseId: string
      productId: string
    }
    query?: {
      mode?: "sale" | "rent"
      priceListId?: string
      frequency?: "daily" | "weekly" | "monthly"
      priceDifference?: string
    }
    response: {
      amount: string
      origin: "price_list" | "product" | "none"
      missing: boolean
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/products/{productId}/scope": {
    /** Qué se lleva por delante dar de baja el producto */
    params: {
      companyId: string
      warehouseId: string
      productId: string
    }
    response: {
      products: number
      measurements: number
      units: number
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/quotes": {
    /** Listar las cotizaciones de un almacén */
    params: {
      companyId: string
      warehouseId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_priority?: string | Array<string>
      sort_createdAt?: string | Array<string>
      sort_name?: string | Array<string>
      sort_folio?: string | Array<string>
      status?: string | Array<string>
      type?: string | Array<string>
      clientId?: string | Array<string>
      responsibleId?: string | Array<string>
      startsOn?: string | Array<string>
      endsOn?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        warehouseId: string
        orderId: string | null
        extendsQuoteId: string | null
        clientId: string | null
        responsibleId: string | null
        code: string
        folio: string
        name: string
        description: string
        type: "rent" | "sale"
        status: "pre_quote" | "pending" | "in_progress" | "in_rent" | "completed" | "sold" | "canceled"
        priority: string
        startsOn: string | null
        endsOn: string | null
        roundDays: boolean
        roundDirection: "up" | "down"
        clientContacts: Array<{
          name: string
          phone?: string
          position?: string
        }>
        sellerContacts: Array<{
          name: string
          phone?: string
          position?: string
        }>
        paymentTerms: {
          version: 1
          additionals?: Array<{
            name: string
            description?: string
            amount: string
          }>
          transferFeeRate?: string
          additionalFeeRate?: string
          spreadFeesAcrossLines?: boolean
          advance?: {
            amount: string
            method?: "card" | "cash" | "transfer"
            date?: string
          }
          deposit?: {
            amount: string
            method?: "card" | "cash" | "transfer"
            date?: string
          }
          fixedPrice?: string
          penalty?: {
            fixed?: string
            concept?: string
          }
          discount?: {
            type: "percent" | "amount"
            value: string
            perProduct?: boolean
          }
        } | null
        taxes: {
          version: 1
          iva?: {
            enabled: boolean
            rate: string
            concept?: string
            type: "trasladado" | "acreditable" | "exento"
          }
          isr?: {
            enabled: boolean
            rate: string
            concept?: string
            type: "retenido" | "directo"
          }
          ivaRetention?: {
            enabled: boolean
            rate: string
            concept?: string
          }
          isrRetention?: {
            enabled: boolean
            rate: string
            concept?: string
          }
          ieps?: {
            enabled: boolean
            rate: string
            concept?: string
          }
          isn?: {
            enabled: boolean
            rate: string
            concept?: string
          }
          hospitality?: {
            enabled: boolean
            rate: string
            concept?: string
          }
          frontier?: {
            enabled: boolean
            rate: string
            concept?: string
          }
          additional?: Array<{
            name: string
            enabled: boolean
            type: "percent" | "amount"
            value: string
            effect: "increase" | "decrease"
          }>
        } | null
        alert: string | null
        message: string | null
        terms: string | null
        observations: string | null
        createdAt: string
        updatedAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "POST /companies/{companyId}/warehouses/{warehouseId}/quotes": {
    /** Crear una cotización */
    params: {
      companyId: string
      warehouseId: string
    }
    body: {
      type: "rent" | "sale"
      clientId?: string
      responsibleId?: string
      name?: string
      description?: string
      startsOn?: string
      endsOn?: string
      roundDays?: boolean
      roundDirection?: "up" | "down"
      lines?: Array<{
        id?: string
        measurementId: string
        quantity: number
        frequency?: "daily" | "weekly" | "monthly"
        productPriceId?: string | null
        price?: string | null
        position?: number
        positionProduct?: number
      }>
      allowMinting?: boolean
    }
    response: {
      id: string
      warehouseId: string
      orderId: string | null
      extendsQuoteId: string | null
      clientId: string | null
      responsibleId: string | null
      code: string
      folio: string
      name: string
      description: string
      type: "rent" | "sale"
      status: "pre_quote" | "pending" | "in_progress" | "in_rent" | "completed" | "sold" | "canceled"
      priority: string
      startsOn: string | null
      endsOn: string | null
      roundDays: boolean
      roundDirection: "up" | "down"
      clientContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      sellerContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      paymentTerms: {
        version: 1
        additionals?: Array<{
          name: string
          description?: string
          amount: string
        }>
        transferFeeRate?: string
        additionalFeeRate?: string
        spreadFeesAcrossLines?: boolean
        advance?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        deposit?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        fixedPrice?: string
        penalty?: {
          fixed?: string
          concept?: string
        }
        discount?: {
          type: "percent" | "amount"
          value: string
          perProduct?: boolean
        }
      } | null
      taxes: {
        version: 1
        iva?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "trasladado" | "acreditable" | "exento"
        }
        isr?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "retenido" | "directo"
        }
        ivaRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isrRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        ieps?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isn?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        hospitality?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        frontier?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        additional?: Array<{
          name: string
          enabled: boolean
          type: "percent" | "amount"
          value: string
          effect: "increase" | "decrease"
        }>
      } | null
      alert: string | null
      message: string | null
      terms: string | null
      observations: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}": {
    /** Consultar una cotización */
    params: {
      companyId: string
      warehouseId: string
      quoteId: string
    }
    response: {
      id: string
      warehouseId: string
      orderId: string | null
      extendsQuoteId: string | null
      clientId: string | null
      responsibleId: string | null
      code: string
      folio: string
      name: string
      description: string
      type: "rent" | "sale"
      status: "pre_quote" | "pending" | "in_progress" | "in_rent" | "completed" | "sold" | "canceled"
      priority: string
      startsOn: string | null
      endsOn: string | null
      roundDays: boolean
      roundDirection: "up" | "down"
      clientContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      sellerContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      paymentTerms: {
        version: 1
        additionals?: Array<{
          name: string
          description?: string
          amount: string
        }>
        transferFeeRate?: string
        additionalFeeRate?: string
        spreadFeesAcrossLines?: boolean
        advance?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        deposit?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        fixedPrice?: string
        penalty?: {
          fixed?: string
          concept?: string
        }
        discount?: {
          type: "percent" | "amount"
          value: string
          perProduct?: boolean
        }
      } | null
      taxes: {
        version: 1
        iva?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "trasladado" | "acreditable" | "exento"
        }
        isr?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "retenido" | "directo"
        }
        ivaRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isrRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        ieps?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isn?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        hospitality?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        frontier?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        additional?: Array<{
          name: string
          enabled: boolean
          type: "percent" | "amount"
          value: string
          effect: "increase" | "decrease"
        }>
      } | null
      alert: string | null
      message: string | null
      terms: string | null
      observations: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}": {
    /** Editar la identidad de una cotización */
    params: {
      companyId: string
      warehouseId: string
      quoteId: string
    }
    body: {
      clientId?: string | null
      name?: string
      description?: string
      startsOn?: string | null
      endsOn?: string | null
      roundDays?: boolean
      roundDirection?: "up" | "down"
      alert?: string | null
      message?: string | null
      terms?: string | null
      observations?: string | null
    }
    response: {
      id: string
      warehouseId: string
      orderId: string | null
      extendsQuoteId: string | null
      clientId: string | null
      responsibleId: string | null
      code: string
      folio: string
      name: string
      description: string
      type: "rent" | "sale"
      status: "pre_quote" | "pending" | "in_progress" | "in_rent" | "completed" | "sold" | "canceled"
      priority: string
      startsOn: string | null
      endsOn: string | null
      roundDays: boolean
      roundDirection: "up" | "down"
      clientContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      sellerContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      paymentTerms: {
        version: 1
        additionals?: Array<{
          name: string
          description?: string
          amount: string
        }>
        transferFeeRate?: string
        additionalFeeRate?: string
        spreadFeesAcrossLines?: boolean
        advance?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        deposit?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        fixedPrice?: string
        penalty?: {
          fixed?: string
          concept?: string
        }
        discount?: {
          type: "percent" | "amount"
          value: string
          perProduct?: boolean
        }
      } | null
      taxes: {
        version: 1
        iva?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "trasladado" | "acreditable" | "exento"
        }
        isr?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "retenido" | "directo"
        }
        ivaRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isrRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        ieps?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isn?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        hospitality?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        frontier?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        additional?: Array<{
          name: string
          enabled: boolean
          type: "percent" | "amount"
          value: string
          effect: "increase" | "decrease"
        }>
      } | null
      alert: string | null
      message: string | null
      terms: string | null
      observations: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}": {
    /** Dar de baja una cotización */
    params: {
      companyId: string
      warehouseId: string
      quoteId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/breakdown": {
    /** Consultar los importes de una cotización */
    params: {
      companyId: string
      warehouseId: string
      quoteId: string
    }
    response: {
      version: 1
      days: number
      lines: Array<{
        lineId: string
        productId: string
        measurementId: string
        quantity: number
        frequency: "daily" | "weekly" | "monthly"
        appliedDays: string
        unitCost?: string
        unitDiscount?: string
        unitTotal?: string
        cost: string
        discount: string
        total: string
        penalty: string
        fee: string
        unitFee: string
        totalWithFee: string
        unpriced: boolean
      }>
      groups: Array<{
        productId: string
        lineIds: Array<string>
        subtotal: string
      }>
      linesTotal: string
      packagePrice?: string
      additionals: string
      subtotal: string
      discount: string
      base: string
      taxes: Array<{
        key: string
        concept?: string
        effect: "increase" | "decrease"
        rate?: string
        amount: string
      }>
      taxTotal: string
      net: string
      fees: string
      feesSpread: boolean
      gross: string
      advance: string
      total: string
      collected: string
      balance: string
      penalty: string
      deposit: string
    }
  }

  "PATCH /companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/contacts": {
    /** Establecer los contactos de las dos partes */
    params: {
      companyId: string
      warehouseId: string
      quoteId: string
    }
    body: {
      clientContacts?: Array<{
        name: string
        phone?: string
        position?: string
      }>
      sellerContacts?: Array<{
        name: string
        phone?: string
        position?: string
      }>
    }
    response: {
      id: string
      warehouseId: string
      orderId: string | null
      extendsQuoteId: string | null
      clientId: string | null
      responsibleId: string | null
      code: string
      folio: string
      name: string
      description: string
      type: "rent" | "sale"
      status: "pre_quote" | "pending" | "in_progress" | "in_rent" | "completed" | "sold" | "canceled"
      priority: string
      startsOn: string | null
      endsOn: string | null
      roundDays: boolean
      roundDirection: "up" | "down"
      clientContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      sellerContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      paymentTerms: {
        version: 1
        additionals?: Array<{
          name: string
          description?: string
          amount: string
        }>
        transferFeeRate?: string
        additionalFeeRate?: string
        spreadFeesAcrossLines?: boolean
        advance?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        deposit?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        fixedPrice?: string
        penalty?: {
          fixed?: string
          concept?: string
        }
        discount?: {
          type: "percent" | "amount"
          value: string
          perProduct?: boolean
        }
      } | null
      taxes: {
        version: 1
        iva?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "trasladado" | "acreditable" | "exento"
        }
        isr?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "retenido" | "directo"
        }
        ivaRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isrRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        ieps?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isn?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        hospitality?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        frontier?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        additional?: Array<{
          name: string
          enabled: boolean
          type: "percent" | "amount"
          value: string
          effect: "increase" | "decrease"
        }>
      } | null
      alert: string | null
      message: string | null
      terms: string | null
      observations: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/document": {
    /** Componer el documento de una cotización */
    params: {
      companyId: string
      warehouseId: string
      quoteId: string
    }
    response: {
      document: {
        kind: "quote"
        identity: {
          folio: string
          code: string
          name: string
          description: string
          status: "pre_quote" | "pending" | "in_progress" | "in_rent" | "completed" | "sold" | "canceled"
          issuedOn: string
          generatedAt: string
        }
        issuer: {
          name: string
          taxId?: string
          email?: string
          phone?: string
          address?: string
          contacts: Array<{
            name: string
            phone?: string
            position?: string
          }>
        }
        client: {
          name: string
          taxId?: string
          email?: string
          phone?: string
          address?: string
          contacts: Array<{
            name: string
            phone?: string
            position?: string
          }>
        } | null
        type: "rent" | "sale"
        period: {
          startsOn: string
          endsOn: string
          days: number
          frequencies: Array<"daily" | "weekly" | "monthly">
        } | null
        groups: Array<{
          productId: string
          productName: string
          productCode: string
          lines: Array<{
            lineId: string
            productName: string
            productCode: string
            measurementName: string
            quantity: number
            frequency: "daily" | "weekly" | "monthly"
            appliedDays?: string
            unitCost?: string
            total?: string
            discount?: string
            unpriced: boolean
          }>
          subtotal?: string
        }>
        showsLineAmounts: boolean
        linesTotal: string
        reconciles: boolean
        breakdown: {
          version: 1
          days: number
          lines: Array<{
            lineId: string
            productId: string
            measurementId: string
            quantity: number
            frequency: "daily" | "weekly" | "monthly"
            appliedDays: string
            unitCost?: string
            unitDiscount?: string
            unitTotal?: string
            cost: string
            discount: string
            total: string
            penalty: string
            fee: string
            unitFee: string
            totalWithFee: string
            unpriced: boolean
          }>
          groups: Array<{
            productId: string
            lineIds: Array<string>
            subtotal: string
          }>
          linesTotal: string
          packagePrice?: string
          additionals: string
          subtotal: string
          discount: string
          base: string
          taxes: Array<{
            key: string
            concept?: string
            effect: "increase" | "decrease"
            rate?: string
            amount: string
          }>
          taxTotal: string
          net: string
          fees: string
          feesSpread: boolean
          gross: string
          advance: string
          total: string
          collected: string
          balance: string
          penalty: string
          deposit: string
        }
        payment: {
          version: 1
          additionals?: Array<{
            name: string
            description?: string
            amount: string
          }>
          transferFeeRate?: string
          additionalFeeRate?: string
          spreadFeesAcrossLines?: boolean
          advance?: {
            amount: string
            method?: "card" | "cash" | "transfer"
            date?: string
          }
          deposit?: {
            amount: string
            method?: "card" | "cash" | "transfer"
            date?: string
          }
          fixedPrice?: string
          penalty?: {
            fixed?: string
            concept?: string
          }
          discount?: {
            type: "percent" | "amount"
            value: string
            perProduct?: boolean
          }
        } | null
        taxes: {
          version: 1
          iva?: {
            enabled: boolean
            rate: string
            concept?: string
            type: "trasladado" | "acreditable" | "exento"
          }
          isr?: {
            enabled: boolean
            rate: string
            concept?: string
            type: "retenido" | "directo"
          }
          ivaRetention?: {
            enabled: boolean
            rate: string
            concept?: string
          }
          isrRetention?: {
            enabled: boolean
            rate: string
            concept?: string
          }
          ieps?: {
            enabled: boolean
            rate: string
            concept?: string
          }
          isn?: {
            enabled: boolean
            rate: string
            concept?: string
          }
          hospitality?: {
            enabled: boolean
            rate: string
            concept?: string
          }
          frontier?: {
            enabled: boolean
            rate: string
            concept?: string
          }
          additional?: Array<{
            name: string
            enabled: boolean
            type: "percent" | "amount"
            value: string
            effect: "increase" | "decrease"
          }>
        } | null
        terms: string | null
        observations: string | null
        message: string | null
      }
      reference: string
    }
  }

  "POST /companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/extensions": {
    /** Extender una renta con el equipo que sigue fuera */
    params: {
      companyId: string
      warehouseId: string
      quoteId: string
    }
    body: {
      startsOn: string
      endsOn: string
      name?: string
      description?: string
      unitIds: Array<string>
    }
    response: {
      id: string
      warehouseId: string
      orderId: string | null
      extendsQuoteId: string | null
      clientId: string | null
      responsibleId: string | null
      code: string
      folio: string
      name: string
      description: string
      type: "rent" | "sale"
      status: "pre_quote" | "pending" | "in_progress" | "in_rent" | "completed" | "sold" | "canceled"
      priority: string
      startsOn: string | null
      endsOn: string | null
      roundDays: boolean
      roundDirection: "up" | "down"
      clientContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      sellerContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      paymentTerms: {
        version: 1
        additionals?: Array<{
          name: string
          description?: string
          amount: string
        }>
        transferFeeRate?: string
        additionalFeeRate?: string
        spreadFeesAcrossLines?: boolean
        advance?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        deposit?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        fixedPrice?: string
        penalty?: {
          fixed?: string
          concept?: string
        }
        discount?: {
          type: "percent" | "amount"
          value: string
          perProduct?: boolean
        }
      } | null
      taxes: {
        version: 1
        iva?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "trasladado" | "acreditable" | "exento"
        }
        isr?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "retenido" | "directo"
        }
        ivaRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isrRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        ieps?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isn?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        hospitality?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        frontier?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        additional?: Array<{
          name: string
          enabled: boolean
          type: "percent" | "amount"
          value: string
          effect: "increase" | "decrease"
        }>
      } | null
      alert: string | null
      message: string | null
      terms: string | null
      observations: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/lines": {
    /** Listar las líneas de una cotización */
    params: {
      companyId: string
      warehouseId: string
      quoteId: string
    }
    response: {
      items: Array<{
        id: string
        quoteId: string
        measurementId: string
        measurementName: string
        productId: string
        productName: string
        productCode: string
        productPriceId: string | null
        frequency: "daily" | "weekly" | "monthly"
        price: string | null
        basePrice: string
        rent?: {
          isFixed: boolean
          fixed?: string
          daily?: string
          weekly?: string
          monthly?: string
        }
        penalty?: {
          isFixed: boolean
          fixed?: string
          daily?: string
          weekly?: string
          monthly?: string
        }
        available: number
        quantity: number
        unitIds: Array<string>
        position: number
        positionProduct: number
      }>
    }
  }

  "PUT /companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/lines": {
    /** Establecer el conjunto de líneas de una cotización */
    params: {
      companyId: string
      warehouseId: string
      quoteId: string
    }
    body: {
      lines: Array<{
        id?: string
        measurementId: string
        quantity: number
        frequency?: "daily" | "weekly" | "monthly"
        productPriceId?: string | null
        price?: string | null
        position?: number
        positionProduct?: number
      }>
      allowMinting?: boolean
    }
    response: {
      items: Array<{
        id: string
        quoteId: string
        measurementId: string
        measurementName: string
        productId: string
        productName: string
        productCode: string
        productPriceId: string | null
        frequency: "daily" | "weekly" | "monthly"
        price: string | null
        basePrice: string
        rent?: {
          isFixed: boolean
          fixed?: string
          daily?: string
          weekly?: string
          monthly?: string
        }
        penalty?: {
          isFixed: boolean
          fixed?: string
          daily?: string
          weekly?: string
          monthly?: string
        }
        available: number
        quantity: number
        unitIds: Array<string>
        position: number
        positionProduct: number
      }>
    }
  }

  "PUT /companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/payment-terms": {
    /** Establecer las condiciones de pago */
    params: {
      companyId: string
      warehouseId: string
      quoteId: string
    }
    body: {
      version: 1
      additionals?: Array<{
        name: string
        description?: string
        amount: string
      }>
      transferFeeRate?: string
      additionalFeeRate?: string
      spreadFeesAcrossLines?: boolean
      advance?: {
        amount: string
        method?: "card" | "cash" | "transfer"
        date?: string
      }
      deposit?: {
        amount: string
        method?: "card" | "cash" | "transfer"
        date?: string
      }
      fixedPrice?: string
      penalty?: {
        fixed?: string
        concept?: string
      }
      discount?: {
        type: "percent" | "amount"
        value: string
        perProduct?: boolean
      }
    } | null
    response: {
      id: string
      warehouseId: string
      orderId: string | null
      extendsQuoteId: string | null
      clientId: string | null
      responsibleId: string | null
      code: string
      folio: string
      name: string
      description: string
      type: "rent" | "sale"
      status: "pre_quote" | "pending" | "in_progress" | "in_rent" | "completed" | "sold" | "canceled"
      priority: string
      startsOn: string | null
      endsOn: string | null
      roundDays: boolean
      roundDirection: "up" | "down"
      clientContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      sellerContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      paymentTerms: {
        version: 1
        additionals?: Array<{
          name: string
          description?: string
          amount: string
        }>
        transferFeeRate?: string
        additionalFeeRate?: string
        spreadFeesAcrossLines?: boolean
        advance?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        deposit?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        fixedPrice?: string
        penalty?: {
          fixed?: string
          concept?: string
        }
        discount?: {
          type: "percent" | "amount"
          value: string
          perProduct?: boolean
        }
      } | null
      taxes: {
        version: 1
        iva?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "trasladado" | "acreditable" | "exento"
        }
        isr?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "retenido" | "directo"
        }
        ivaRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isrRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        ieps?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isn?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        hospitality?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        frontier?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        additional?: Array<{
          name: string
          enabled: boolean
          type: "percent" | "amount"
          value: string
          effect: "increase" | "decrease"
        }>
      } | null
      alert: string | null
      message: string | null
      terms: string | null
      observations: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/payments": {
    /** Los pagos cobrados contra la cotización */
    params: {
      companyId: string
      warehouseId: string
      quoteId: string
    }
    response: {
      items: Array<{
        id: string
        quoteId: string
        amount: string
        method: "card" | "cash" | "transfer"
        description: string | null
        paidById: string | null
        paidByName: string | null
        createdAt: string
      }>
    }
  }

  "POST /companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/payments": {
    /** Registrar un pago cobrado */
    params: {
      companyId: string
      warehouseId: string
      quoteId: string
    }
    body: {
      amount: string
      method: "card" | "cash" | "transfer"
      description?: string
    }
    response: {
      id: string
      quoteId: string
      amount: string
      method: "card" | "cash" | "transfer"
      description: string | null
      paidById: string | null
      paidByName: string | null
      createdAt: string
    }
  }

  "DELETE /companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/payments/{paymentId}": {
    /** Dar de baja un pago mal registrado */
    params: {
      companyId: string
      warehouseId: string
      quoteId: string
      paymentId: string
    }
    response: undefined
  }

  "PATCH /companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/responsible": {
    /** Cambiar el responsable de una cotización */
    params: {
      companyId: string
      warehouseId: string
      quoteId: string
    }
    body: {
      responsibleId: string
    }
    response: {
      id: string
      warehouseId: string
      orderId: string | null
      extendsQuoteId: string | null
      clientId: string | null
      responsibleId: string | null
      code: string
      folio: string
      name: string
      description: string
      type: "rent" | "sale"
      status: "pre_quote" | "pending" | "in_progress" | "in_rent" | "completed" | "sold" | "canceled"
      priority: string
      startsOn: string | null
      endsOn: string | null
      roundDays: boolean
      roundDirection: "up" | "down"
      clientContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      sellerContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      paymentTerms: {
        version: 1
        additionals?: Array<{
          name: string
          description?: string
          amount: string
        }>
        transferFeeRate?: string
        additionalFeeRate?: string
        spreadFeesAcrossLines?: boolean
        advance?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        deposit?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        fixedPrice?: string
        penalty?: {
          fixed?: string
          concept?: string
        }
        discount?: {
          type: "percent" | "amount"
          value: string
          perProduct?: boolean
        }
      } | null
      taxes: {
        version: 1
        iva?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "trasladado" | "acreditable" | "exento"
        }
        isr?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "retenido" | "directo"
        }
        ivaRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isrRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        ieps?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isn?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        hospitality?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        frontier?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        additional?: Array<{
          name: string
          enabled: boolean
          type: "percent" | "amount"
          value: string
          effect: "increase" | "decrease"
        }>
      } | null
      alert: string | null
      message: string | null
      terms: string | null
      observations: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "POST /companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/returns": {
    /** Registrar el retorno del equipo rentado */
    params: {
      companyId: string
      warehouseId: string
      quoteId: string
    }
    body: {
      units: Array<{
        unitId: string
        status: "available" | "in_quote" | "in_order" | "rented" | "sold" | "lost" | "damaged" | "robbed" | "incomplete" | "modified" | "expense"
        note?: string
      }>
    }
    response: {
      id: string
      warehouseId: string
      orderId: string | null
      extendsQuoteId: string | null
      clientId: string | null
      responsibleId: string | null
      code: string
      folio: string
      name: string
      description: string
      type: "rent" | "sale"
      status: "pre_quote" | "pending" | "in_progress" | "in_rent" | "completed" | "sold" | "canceled"
      priority: string
      startsOn: string | null
      endsOn: string | null
      roundDays: boolean
      roundDirection: "up" | "down"
      clientContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      sellerContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      paymentTerms: {
        version: 1
        additionals?: Array<{
          name: string
          description?: string
          amount: string
        }>
        transferFeeRate?: string
        additionalFeeRate?: string
        spreadFeesAcrossLines?: boolean
        advance?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        deposit?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        fixedPrice?: string
        penalty?: {
          fixed?: string
          concept?: string
        }
        discount?: {
          type: "percent" | "amount"
          value: string
          perProduct?: boolean
        }
      } | null
      taxes: {
        version: 1
        iva?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "trasladado" | "acreditable" | "exento"
        }
        isr?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "retenido" | "directo"
        }
        ivaRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isrRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        ieps?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isn?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        hospitality?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        frontier?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        additional?: Array<{
          name: string
          enabled: boolean
          type: "percent" | "amount"
          value: string
          effect: "increase" | "decrease"
        }>
      } | null
      alert: string | null
      message: string | null
      terms: string | null
      observations: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/status": {
    /** Cambiar el estado de una cotización */
    params: {
      companyId: string
      warehouseId: string
      quoteId: string
    }
    body: {
      status: "pre_quote" | "pending" | "in_progress" | "in_rent" | "completed" | "sold" | "canceled"
    }
    response: {
      id: string
      warehouseId: string
      orderId: string | null
      extendsQuoteId: string | null
      clientId: string | null
      responsibleId: string | null
      code: string
      folio: string
      name: string
      description: string
      type: "rent" | "sale"
      status: "pre_quote" | "pending" | "in_progress" | "in_rent" | "completed" | "sold" | "canceled"
      priority: string
      startsOn: string | null
      endsOn: string | null
      roundDays: boolean
      roundDirection: "up" | "down"
      clientContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      sellerContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      paymentTerms: {
        version: 1
        additionals?: Array<{
          name: string
          description?: string
          amount: string
        }>
        transferFeeRate?: string
        additionalFeeRate?: string
        spreadFeesAcrossLines?: boolean
        advance?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        deposit?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        fixedPrice?: string
        penalty?: {
          fixed?: string
          concept?: string
        }
        discount?: {
          type: "percent" | "amount"
          value: string
          perProduct?: boolean
        }
      } | null
      taxes: {
        version: 1
        iva?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "trasladado" | "acreditable" | "exento"
        }
        isr?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "retenido" | "directo"
        }
        ivaRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isrRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        ieps?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isn?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        hospitality?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        frontier?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        additional?: Array<{
          name: string
          enabled: boolean
          type: "percent" | "amount"
          value: string
          effect: "increase" | "decrease"
        }>
      } | null
      alert: string | null
      message: string | null
      terms: string | null
      observations: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "PUT /companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/taxes": {
    /** Establecer el bloque de impuestos */
    params: {
      companyId: string
      warehouseId: string
      quoteId: string
    }
    body: {
      version: 1
      iva?: {
        enabled: boolean
        rate: string
        concept?: string
        type: "trasladado" | "acreditable" | "exento"
      }
      isr?: {
        enabled: boolean
        rate: string
        concept?: string
        type: "retenido" | "directo"
      }
      ivaRetention?: {
        enabled: boolean
        rate: string
        concept?: string
      }
      isrRetention?: {
        enabled: boolean
        rate: string
        concept?: string
      }
      ieps?: {
        enabled: boolean
        rate: string
        concept?: string
      }
      isn?: {
        enabled: boolean
        rate: string
        concept?: string
      }
      hospitality?: {
        enabled: boolean
        rate: string
        concept?: string
      }
      frontier?: {
        enabled: boolean
        rate: string
        concept?: string
      }
      additional?: Array<{
        name: string
        enabled: boolean
        type: "percent" | "amount"
        value: string
        effect: "increase" | "decrease"
      }>
    } | null
    response: {
      id: string
      warehouseId: string
      orderId: string | null
      extendsQuoteId: string | null
      clientId: string | null
      responsibleId: string | null
      code: string
      folio: string
      name: string
      description: string
      type: "rent" | "sale"
      status: "pre_quote" | "pending" | "in_progress" | "in_rent" | "completed" | "sold" | "canceled"
      priority: string
      startsOn: string | null
      endsOn: string | null
      roundDays: boolean
      roundDirection: "up" | "down"
      clientContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      sellerContacts: Array<{
        name: string
        phone?: string
        position?: string
      }>
      paymentTerms: {
        version: 1
        additionals?: Array<{
          name: string
          description?: string
          amount: string
        }>
        transferFeeRate?: string
        additionalFeeRate?: string
        spreadFeesAcrossLines?: boolean
        advance?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        deposit?: {
          amount: string
          method?: "card" | "cash" | "transfer"
          date?: string
        }
        fixedPrice?: string
        penalty?: {
          fixed?: string
          concept?: string
        }
        discount?: {
          type: "percent" | "amount"
          value: string
          perProduct?: boolean
        }
      } | null
      taxes: {
        version: 1
        iva?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "trasladado" | "acreditable" | "exento"
        }
        isr?: {
          enabled: boolean
          rate: string
          concept?: string
          type: "retenido" | "directo"
        }
        ivaRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isrRetention?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        ieps?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        isn?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        hospitality?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        frontier?: {
          enabled: boolean
          rate: string
          concept?: string
        }
        additional?: Array<{
          name: string
          enabled: boolean
          type: "percent" | "amount"
          value: string
          effect: "increase" | "decrease"
        }>
      } | null
      alert: string | null
      message: string | null
      terms: string | null
      observations: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/quotes/{quoteId}/units": {
    /** Las unidades que la cotización tiene apartadas */
    params: {
      companyId: string
      warehouseId: string
      quoteId: string
    }
    response: {
      items: Array<{
        id: string
        code: string
        status: "available" | "in_quote" | "in_order" | "rented" | "sold" | "lost" | "damaged" | "robbed" | "incomplete" | "modified" | "expense"
        productName: string
        measurementName: string
      }>
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/rates": {
    /** Las medidas del almacén con su tarifa resuelta y su existencia libre */
    params: {
      companyId: string
      warehouseId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_code?: string | Array<string>
      sort_measurement?: string | Array<string>
      productId?: string | Array<string>
      measurementId?: string | Array<string>
      categoryId?: string | Array<string>
      availableForRent?: string | Array<string>
      availableForSale?: string | Array<string>
      priceListId?: string
    }
    response: {
      items: Array<{
        measurementId: string
        measurementName: string
        productId: string
        productName: string
        productCode: string
        productPriceId: string | null
        basePrice: string
        rent?: {
          isFixed: boolean
          fixed?: string
          daily?: string
          weekly?: string
          monthly?: string
        }
        penalty?: {
          isFixed: boolean
          fixed?: string
          daily?: string
          weekly?: string
          monthly?: string
        }
        available: number
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/reservation-coherence": {
    /** Verificar que las reservas y el inventario dicen lo mismo */
    params: {
      companyId: string
      warehouseId: string
    }
    response: {
      items: Array<{
        unitId: string
        code: string
        status: "available" | "in_quote" | "in_order" | "rented" | "sold" | "lost" | "damaged" | "robbed" | "incomplete" | "modified" | "expense"
        reason: "committed_without_link" | "link_without_projection"
        quoteId: string | null
      }>
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/scope": {
    /** Qué se lleva por delante dar de baja el almacén */
    params: {
      companyId: string
      warehouseId: string
    }
    response: {
      storages: number
      categories: number
      products: number
      priceLists: number
      quotes: number
      orders: number
      openQuotes: number
      openOrders: number
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/storages": {
    /** Listar ubicaciones; sin «parentId», las raíces */
    params: {
      companyId: string
      warehouseId: string
    }
    query?: {
      parentId?: string
    }
    response: {
      items: Array<{
        id: string
        warehouseId: string
        parentId: string | null
        kind: "floor" | "area" | "aisle" | "section" | "bay" | "rack" | "shelf" | "pallet" | "box" | "bin"
        code: string
        name: string
        color: string | null
        icon: string | null
        imageUploadId: string | null
        imageUrl: string | null
        imageThumbnailUrl: string | null
        childCount: number
        productCount: number
        createdAt: string
        updatedAt: string
      }>
    }
  }

  "POST /companies/{companyId}/warehouses/{warehouseId}/storages": {
    /** Crear una ubicación */
    params: {
      companyId: string
      warehouseId: string
    }
    body: {
      name: string
      kind?: "floor" | "area" | "aisle" | "section" | "bay" | "rack" | "shelf" | "pallet" | "box" | "bin"
      parentId?: string | null
      color?: string
      icon?: string
      imageUploadId?: string | null
    }
    response: {
      id: string
      warehouseId: string
      parentId: string | null
      kind: "floor" | "area" | "aisle" | "section" | "bay" | "rack" | "shelf" | "pallet" | "box" | "bin"
      code: string
      name: string
      color: string | null
      icon: string | null
      imageUploadId: string | null
      imageUrl: string | null
      imageThumbnailUrl: string | null
      childCount: number
      productCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/warehouses/{warehouseId}/storages/{storageId}": {
    /** Editar una ubicación; cambiar el tipo regenera el código */
    params: {
      companyId: string
      warehouseId: string
      storageId: string
    }
    body: {
      name?: string
      kind?: "floor" | "area" | "aisle" | "section" | "bay" | "rack" | "shelf" | "pallet" | "box" | "bin"
      parentId?: string | null
      color?: string | null
      icon?: string | null
      imageUploadId?: string | null
    }
    response: {
      id: string
      warehouseId: string
      parentId: string | null
      kind: "floor" | "area" | "aisle" | "section" | "bay" | "rack" | "shelf" | "pallet" | "box" | "bin"
      code: string
      name: string
      color: string | null
      icon: string | null
      imageUploadId: string | null
      imageUrl: string | null
      imageThumbnailUrl: string | null
      childCount: number
      productCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/warehouses/{warehouseId}/storages/{storageId}": {
    /** Eliminar una ubicación y su subárbol */
    params: {
      companyId: string
      warehouseId: string
      storageId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/storages/{storageId}/path": {
    /** El camino desde la raíz hasta una ubicación */
    params: {
      companyId: string
      warehouseId: string
      storageId: string
    }
    response: {
      items: Array<{
        id: string
        warehouseId: string
        parentId: string | null
        kind: "floor" | "area" | "aisle" | "section" | "bay" | "rack" | "shelf" | "pallet" | "box" | "bin"
        code: string
        name: string
        color: string | null
        icon: string | null
        imageUploadId: string | null
        imageUrl: string | null
        imageThumbnailUrl: string | null
        childCount: number
        productCount: number
        createdAt: string
        updatedAt: string
      }>
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/storages/{storageId}/scope": {
    /** Qué se lleva por delante eliminar la ubicación */
    params: {
      companyId: string
      warehouseId: string
      storageId: string
    }
    response: {
      storages: number
      products: number
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/units/by-code/{code}": {
    /** Localizar una unidad por el código de su etiqueta */
    params: {
      companyId: string
      warehouseId: string
      code: string
    }
    response: {
      id: string
      measurementId: string
      code: string
      status: "available" | "in_quote" | "in_order" | "rented" | "sold" | "lost" | "damaged" | "robbed" | "incomplete" | "modified" | "expense"
      createdByReservation: boolean
      createdAt: string
      updatedAt: string
      measurementName: string
      productId: string
      productName: string
      productCode: string
      storageId: string | null
      storageCode: string | null
      storageName: string | null
    }
  }

  "GET /companies/{companyId}/warehouses/{warehouseId}/units/{unitId}/history": {
    /** El historial de estado de una unidad */
    params: {
      companyId: string
      warehouseId: string
      unitId: string
    }
    response: {
      items: Array<{
        id: string
        fromStatus: "available" | "in_quote" | "in_order" | "rented" | "sold" | "lost" | "damaged" | "robbed" | "incomplete" | "modified" | "expense" | null
        toStatus: "available" | "in_quote" | "in_order" | "rented" | "sold" | "lost" | "damaged" | "robbed" | "incomplete" | "modified" | "expense"
        reason: "manual" | "quote_reservation" | "quote_release" | "quote_status" | "order" | "storefront_sale" | "rental_return" | "created"
        actorId: string | null
        actorName: string | null
        causeId: string | null
        note: string | null
        occurredAt: string
      }>
    }
  }

  "GET /companies/{companyId}/websites": {
    /** Listar los sitios de una empresa */
    params: {
      companyId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_createdAt?: string | Array<string>
      isPublished?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        companyId: string
        name: string
        description: string
        slug: string
        isPublished: boolean
        categoryId: string | null
        vertical: "warehouse" | "mosaic" | "under-construction"
        warehouseId: string | null
        pixitStoreId: string | null
        logoUploadId: string | null
        logoUrl: string | null
        iconUploadId: string | null
        iconUrl: string | null
        subdomain: string
        address: string
        createdAt: string
        updatedAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "POST /companies/{companyId}/websites": {
    /** Crear un sitio */
    params: {
      companyId: string
    }
    body: {
      name: string
      description?: string
      categoryId?: string | null
      warehouseId?: string | null
      pixitStoreId?: string | null
      logoUploadId?: string | null
      iconUploadId?: string | null
      isPublished?: boolean
    }
    response: {
      id: string
      companyId: string
      name: string
      description: string
      slug: string
      isPublished: boolean
      categoryId: string | null
      vertical: "warehouse" | "mosaic" | "under-construction"
      warehouseId: string | null
      pixitStoreId: string | null
      logoUploadId: string | null
      logoUrl: string | null
      iconUploadId: string | null
      iconUrl: string | null
      subdomain: string
      address: string
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/websites/slug-available": {
    /** Comprobar si un identificador legible está libre */
    params: {
      companyId: string
    }
    query?: {
      slug: string
    }
    response: {
      slug: string
      available: boolean
    }
  }

  "GET /companies/{companyId}/websites/{websiteId}": {
    /** Ver un sitio */
    params: {
      companyId: string
      websiteId: string
    }
    response: {
      id: string
      companyId: string
      name: string
      description: string
      slug: string
      isPublished: boolean
      categoryId: string | null
      vertical: "warehouse" | "mosaic" | "under-construction"
      warehouseId: string | null
      pixitStoreId: string | null
      logoUploadId: string | null
      logoUrl: string | null
      iconUploadId: string | null
      iconUrl: string | null
      subdomain: string
      address: string
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/websites/{websiteId}": {
    /** Modificar un sitio, publicarlo o despublicarlo */
    params: {
      companyId: string
      websiteId: string
    }
    body: {
      name?: string
      description?: string
      slug?: string
      categoryId?: string | null
      warehouseId?: string | null
      pixitStoreId?: string | null
      logoUploadId?: string | null
      iconUploadId?: string | null
      isPublished?: boolean
    }
    response: {
      id: string
      companyId: string
      name: string
      description: string
      slug: string
      isPublished: boolean
      categoryId: string | null
      vertical: "warehouse" | "mosaic" | "under-construction"
      warehouseId: string | null
      pixitStoreId: string | null
      logoUploadId: string | null
      logoUrl: string | null
      iconUploadId: string | null
      iconUrl: string | null
      subdomain: string
      address: string
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/websites/{websiteId}": {
    /** Dar de baja un sitio */
    params: {
      companyId: string
      websiteId: string
    }
    response: undefined
  }

  "GET /health": {
    /** Comprobación de salud */
    response: {
      status: "ok" | "degraded"
      database: "up" | "down"
      at: string
    }
  }

  "GET /me/activity": {
    /** Mi actividad, en todas mis empresas */
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_createdAt?: string | Array<string>
      action?: string | Array<string>
      entity?: string | Array<string>
      serviceId?: string | Array<string>
      performedById?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        companyId: string
        companyName: string
        action: "create" | "update" | "delete"
        entity: string
        entityId: string | null
        entityLabel: string
        title: string
        description: string
        url: string
        origin: string
        permissions: Array<string>
        performedById: string | null
        performedBy: string
        performedAsPlatformAdmin: boolean
        createdAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "GET /me/addresses": {
    /** Mi libreta de direcciones */
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_label?: string | Array<string>
      sort_city?: string | Array<string>
      sort_isPrimary?: string | Array<string>
      sort_createdAt?: string | Array<string>
      isPrimary?: string | Array<string>
      city?: string | Array<string>
      countryCode?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        label: string
        street: string
        number: string
        colony: string
        city: string
        state: string
        country: string
        countryCode: string
        postalCode: string
        latitude: string | null
        longitude: string | null
        isPrimary: boolean
        createdAt: string
        updatedAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "POST /me/addresses": {
    /** Añadir una dirección propia */
    body: {
      label?: string
      street?: string
      number?: string
      colony?: string
      city?: string
      state?: string
      country?: string
      countryCode?: string
      postalCode?: string
      latitude?: string | null
      longitude?: string | null
      isPrimary?: boolean
    }
    response: {
      id: string
      label: string
      street: string
      number: string
      colony: string
      city: string
      state: string
      country: string
      countryCode: string
      postalCode: string
      latitude: string | null
      longitude: string | null
      isPrimary: boolean
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /me/addresses/{addressId}": {
    /** Editar una dirección propia */
    params: {
      addressId: string
    }
    body: {
      label?: string
      street?: string
      number?: string
      colony?: string
      city?: string
      state?: string
      country?: string
      countryCode?: string
      postalCode?: string
      latitude?: string | null
      longitude?: string | null
      isPrimary?: boolean
    }
    response: {
      id: string
      label: string
      street: string
      number: string
      colony: string
      city: string
      state: string
      country: string
      countryCode: string
      postalCode: string
      latitude: string | null
      longitude: string | null
      isPrimary: boolean
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /me/addresses/{addressId}": {
    /** Eliminar una dirección propia */
    params: {
      addressId: string
    }
    response: undefined
  }

  "GET /me/notification-preferences": {
    /** Por qué canales quiero enterarme */
    response: {
      items: Array<{
        category: "account" | "activity" | "billing" | "stock"
        channel: "inbox" | "push" | "email"
        enabled: boolean
        editable: boolean
      }>
      available: Array<"inbox" | "push" | "email">
    }
  }

  "PUT /me/notification-preferences": {
    /** Encender o apagar un canal para una categoría */
    body: {
      category: "account" | "activity" | "billing" | "stock"
      channel: "inbox" | "push" | "email"
      enabled: boolean
    }
    response: {
      category: "account" | "activity" | "billing" | "stock"
      channel: "inbox" | "push" | "email"
      enabled: boolean
      editable: boolean
    }
  }

  "GET /me/notifications": {
    /** Mi bandeja */
    query?: {
      filter?: "unread" | "read" | "archived" | "all"
      page?: string
      limit?: string
    }
    response: {
      items: Array<{
        id: string
        kind: string
        title: string
        body: string
        url: string
        readAt: string | null
        archivedAt: string | null
        createdAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "GET /me/notifications/counts": {
    /** Cuántas sin leer, y cuántas nuevas desde la última vez */
    response: {
      unread: number
      news: number
    }
  }

  "POST /me/notifications/open": {
    /** Marcar la bandeja como vista */
    response: {
      unread: number
      news: number
    }
  }

  "POST /me/notifications/{notificationId}/archive": {
    /** Archivar o desarchivar */
    params: {
      notificationId: string
    }
    body: {
      archived: boolean
    }
    response: {
      id: string
      kind: string
      title: string
      body: string
      url: string
      readAt: string | null
      archivedAt: string | null
      createdAt: string
    }
  }

  "POST /me/notifications/{notificationId}/read": {
    /** Marcar como leída, o como no leída */
    params: {
      notificationId: string
    }
    body: {
      read: boolean
    }
    response: {
      id: string
      kind: string
      title: string
      body: string
      url: string
      readAt: string | null
      archivedAt: string | null
      createdAt: string
    }
  }

  "GET /me/push-devices": {
    /** Mis navegadores registrados */
    response: {
      items: Array<{
        id: string
        userAgent: string | null
        lastSeenAt: string | null
        createdAt: string
      }>
    }
  }

  "POST /me/push-devices": {
    /** Registrar este navegador para avisos */
    body: {
      token: string
      userAgent?: string
    }
    response: {
      id: string
      userAgent: string | null
      lastSeenAt: string | null
      createdAt: string
    }
  }

  "DELETE /me/push-devices/{deviceId}": {
    /** Dejar de recibir avisos en este navegador */
    params: {
      deviceId: string
    }
    response: undefined
  }

  "POST /payments/events": {
    /** Recibir un evento del procesador de pagos */
    response: {
      received: true
    }
  }

  "GET /permissions": {
    /** Catálogo de claves de permiso */
    response: {
      total: number
      services: Record<string, Record<string, Array<string>>>
      keys: Array<string>
    }
  }

  "GET /plans": {
    /** Catálogo de planes con sus precios vigentes */
    response: {
      items: Array<{
        id: string
        tier: number
        title: string
        description: string
        isIndividual: boolean
        isRecommended: boolean
        features: Array<unknown>
        prices: Array<{
          id: string
          interval: string
          intervalCount: number
          unitAmount: string
          currency: string
        }>
      }>
    }
  }

  "GET /plans/free-availability": {
    /** ¿Le queda al solicitante el plan gratuito? */
    response: {
      available: boolean
    }
  }

  "GET /prospects": {
    /** La bandeja de contactos pendientes */
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_createdAt?: string | Array<string>
      sort_name?: string | Array<string>
      sort_email?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        name: string
        lastname: string
        email: string
        phone: string | null
        companyName: string
        message: string
        acceptedAt: string | null
        acceptedById: string | null
        userId: string | null
        createdAt: string
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "POST /prospects": {
    /** Dejar los datos de contacto sin crear cuenta */
    body: {
      name: string
      lastname?: string
      email: string
      phone?: string
      companyName?: string
      message?: string
    }
    response: {
      message: string
    }
  }

  "PATCH /prospects/{prospectId}": {
    /** Corregir lo que llegó mal escrito */
    params: {
      prospectId: string
    }
    body: {
      name?: string
      lastname?: string
      email?: string
      phone?: string | null
      companyName?: string
      message?: string
    }
    response: {
      id: string
      name: string
      lastname: string
      email: string
      phone: string | null
      companyName: string
      message: string
      acceptedAt: string | null
      acceptedById: string | null
      userId: string | null
      createdAt: string
    }
  }

  "DELETE /prospects/{prospectId}": {
    /** Descartar un contacto */
    params: {
      prospectId: string
    }
    response: undefined
  }

  "POST /prospects/{prospectId}/acceptance": {
    /** Convertir el prospecto en cuenta */
    params: {
      prospectId: string
    }
    response: {
      userId: string
      prospect: {
        id: string
        name: string
        lastname: string
        email: string
        phone: string | null
        companyName: string
        message: string
        acceptedAt: string | null
        acceptedById: string | null
        userId: string | null
        createdAt: string
      }
    }
  }

  "GET /public/documents/{reference}": {
    /** Consultar un documento por su enlace público */
    params: {
      reference: string
    }
    response: {
      document: {
        kind: "quote"
        identity: {
          folio: string
          code: string
          name: string
          description: string
          status: "pre_quote" | "pending" | "in_progress" | "in_rent" | "completed" | "sold" | "canceled"
          issuedOn: string
          generatedAt: string
        }
        issuer: {
          name: string
          taxId?: string
          email?: string
          phone?: string
          address?: string
          contacts: Array<{
            name: string
            phone?: string
            position?: string
          }>
        }
        client: {
          name: string
          taxId?: string
          email?: string
          phone?: string
          address?: string
          contacts: Array<{
            name: string
            phone?: string
            position?: string
          }>
        } | null
        type: "rent" | "sale"
        period: {
          startsOn: string
          endsOn: string
          days: number
          frequencies: Array<"daily" | "weekly" | "monthly">
        } | null
        groups: Array<{
          productId: string
          productName: string
          productCode: string
          lines: Array<{
            lineId: string
            productName: string
            productCode: string
            measurementName: string
            quantity: number
            frequency: "daily" | "weekly" | "monthly"
            appliedDays?: string
            unitCost?: string
            total?: string
            discount?: string
            unpriced: boolean
          }>
          subtotal?: string
        }>
        showsLineAmounts: boolean
        linesTotal: string
        reconciles: boolean
        breakdown: {
          version: 1
          days: number
          lines: Array<{
            lineId: string
            productId: string
            measurementId: string
            quantity: number
            frequency: "daily" | "weekly" | "monthly"
            appliedDays: string
            unitCost?: string
            unitDiscount?: string
            unitTotal?: string
            cost: string
            discount: string
            total: string
            penalty: string
            fee: string
            unitFee: string
            totalWithFee: string
            unpriced: boolean
          }>
          groups: Array<{
            productId: string
            lineIds: Array<string>
            subtotal: string
          }>
          linesTotal: string
          packagePrice?: string
          additionals: string
          subtotal: string
          discount: string
          base: string
          taxes: Array<{
            key: string
            concept?: string
            effect: "increase" | "decrease"
            rate?: string
            amount: string
          }>
          taxTotal: string
          net: string
          fees: string
          feesSpread: boolean
          gross: string
          advance: string
          total: string
          collected: string
          balance: string
          penalty: string
          deposit: string
        }
        payment: {
          version: 1
          additionals?: Array<{
            name: string
            description?: string
            amount: string
          }>
          transferFeeRate?: string
          additionalFeeRate?: string
          spreadFeesAcrossLines?: boolean
          advance?: {
            amount: string
            method?: "card" | "cash" | "transfer"
            date?: string
          }
          deposit?: {
            amount: string
            method?: "card" | "cash" | "transfer"
            date?: string
          }
          fixedPrice?: string
          penalty?: {
            fixed?: string
            concept?: string
          }
          discount?: {
            type: "percent" | "amount"
            value: string
            perProduct?: boolean
          }
        } | null
        taxes: {
          version: 1
          iva?: {
            enabled: boolean
            rate: string
            concept?: string
            type: "trasladado" | "acreditable" | "exento"
          }
          isr?: {
            enabled: boolean
            rate: string
            concept?: string
            type: "retenido" | "directo"
          }
          ivaRetention?: {
            enabled: boolean
            rate: string
            concept?: string
          }
          isrRetention?: {
            enabled: boolean
            rate: string
            concept?: string
          }
          ieps?: {
            enabled: boolean
            rate: string
            concept?: string
          }
          isn?: {
            enabled: boolean
            rate: string
            concept?: string
          }
          hospitality?: {
            enabled: boolean
            rate: string
            concept?: string
          }
          frontier?: {
            enabled: boolean
            rate: string
            concept?: string
          }
          additional?: Array<{
            name: string
            enabled: boolean
            type: "percent" | "amount"
            value: string
            effect: "increase" | "decrease"
          }>
        } | null
        terms: string | null
        observations: string | null
        message: string | null
      }
    }
  }

  "GET /public/sites/{slug}": {
    /** Resolver la tienda que sirve un subdominio */
    params: {
      slug: string
    }
    response: {
      status: "ready"
      site: {
        slug: string
        name: string
        description: string
        vertical: "warehouse" | "mosaic" | "under-construction"
        logoUrl: string | null
        iconUrl: string | null
        categories: Array<{
          id: string
          parentId: string | null
          name: string
          slug: string | null
        }>
      }
    } | {
      status: "unavailable"
      reason: "subscription" | "service"
    }
  }

  "GET /public/sites/{slug}/products": {
    /** Catálogo publicado de una tienda */
    params: {
      slug: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_createdAt?: string | Array<string>
      categoryId?: string | Array<string>
      availableForSale?: string | Array<string>
      availableForRent?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        slug: string | null
        name: string
        description: string
        price: string | null
        availableForSale: boolean
        availableForRent: boolean
        categoryId: string | null
        coverUrl: string | null
      }>
      page: number
      limit: number
      totalItems: number
      totalPages: number
      hasPrevious: boolean
      hasNext: boolean
      previousPage: number | null
      nextPage: number | null
    }
  }

  "GET /public/sites/{slug}/products/{handle}": {
    /** Ficha pública de un producto */
    params: {
      slug: string
      handle: string
    }
    response: {
      id: string
      slug: string | null
      name: string
      description: string
      price: string | null
      availableForSale: boolean
      availableForRent: boolean
      categoryId: string | null
      coverUrl: string | null
      images: Array<{
        url: string
        thumbnailUrl: string | null
        position: number
        isCover: boolean
      }>
      measurements: Array<{
        id: string
        name: string
      }>
      variants: Array<{
        id: string
        slug: string | null
        name: string
        description: string
        price: string | null
        availableForSale: boolean
        availableForRent: boolean
        categoryId: string | null
        coverUrl: string | null
      }>
      accessories: Array<{
        id: string
        slug: string | null
        name: string
        description: string
        price: string | null
        availableForSale: boolean
        availableForRent: boolean
        categoryId: string | null
        coverUrl: string | null
      }>
    }
  }
}

/** Todo endpoint del contrato, como `"POST /companies"`. */
export type ApiEndpoint = keyof ApiEndpoints

/** Lo que hay que aportar para llamar a un endpoint. */
export type ApiInput<E extends ApiEndpoint> = Omit<ApiEndpoints[E], "response">

/** Lo que devuelve. */
export type ApiOutput<E extends ApiEndpoint> = ApiEndpoints[E] extends { response: infer R }
  ? R
  : undefined
