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
        messageKey: string
        messageParams: Record<string, string | number>
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

  "GET /companies/{companyId}/production-items/by-code/{code}": {
    /** Localizar un artículo por el código de su etiqueta */
    params: {
      companyId: string
      code: string
    }
    response: {
      id: string
      productionId: string
      categoryId: string | null
      categoryName: string | null
      shoppingId: string | null
      name: string
      description: string
      code: string
      status: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
      isInventoriable: boolean
      allowedStatuses: Array<"available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed">
      images: Array<{
        uploadId: string
        url: string
        thumbnailUrl: string | null
        position: number
      }>
      createdAt: string
      updatedAt: string
      productionName: string
    }
  }

  "GET /companies/{companyId}/productions": {
    /** Listar las producciones de una empresa */
    params: {
      companyId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_startsOn?: string | Array<string>
      sort_endsOn?: string | Array<string>
      sort_createdAt?: string | Array<string>
      isPublished?: string | Array<string>
      startsOn?: string | Array<string>
      endsOn?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        companyId: string
        name: string
        description: string
        slug: string | null
        isPublished: boolean
        startsOn: string | null
        endsOn: string | null
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

  "POST /companies/{companyId}/productions": {
    /** Crear una producción */
    params: {
      companyId: string
    }
    body: {
      name: string
      description?: string
      startsOn?: string | null
      endsOn?: string | null
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
      startsOn: string | null
      endsOn: string | null
      imageUploadId: string | null
      imageUrl: string | null
      imageThumbnailUrl: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}": {
    /** Ver una producción */
    params: {
      companyId: string
      productionId: string
    }
    response: {
      id: string
      companyId: string
      name: string
      description: string
      slug: string | null
      isPublished: boolean
      startsOn: string | null
      endsOn: string | null
      imageUploadId: string | null
      imageUrl: string | null
      imageThumbnailUrl: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/productions/{productionId}": {
    /** Editar una producción */
    params: {
      companyId: string
      productionId: string
    }
    body: {
      name?: string
      description?: string
      startsOn?: string | null
      endsOn?: string | null
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
      startsOn: string | null
      endsOn: string | null
      imageUploadId: string | null
      imageUrl: string | null
      imageThumbnailUrl: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}": {
    /** Dar de baja una producción */
    params: {
      companyId: string
      productionId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/productions/{productionId}/anchors": {
    /** Listar las partidas presupuestadas de una producción */
    params: {
      companyId: string
      productionId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_amount?: string | Array<string>
      sort_createdAt?: string | Array<string>
      categoryId?: string | Array<string>
      responsibleId?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        productionId: string
        name: string
        description: string
        amount: string
        categoryId: string | null
        categoryName: string | null
        responsibleId: string | null
        responsibleName: string | null
        attachments: Array<{
          id: string
          uploadId: string
          name: string
          url: string
          kind: string
          createdAt: string
        }>
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

  "POST /companies/{companyId}/productions/{productionId}/anchors": {
    /** Registrar una partida presupuestada */
    params: {
      companyId: string
      productionId: string
    }
    body: {
      name: string
      description?: string
      amount: string
      categoryId?: string | null
      responsibleId?: string | null
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      amount: string
      categoryId: string | null
      categoryName: string | null
      responsibleId: string | null
      responsibleName: string | null
      attachments: Array<{
        id: string
        uploadId: string
        name: string
        url: string
        kind: string
        createdAt: string
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/anchors/{anchorId}": {
    /** Consultar una partida presupuestada */
    params: {
      companyId: string
      productionId: string
      anchorId: string
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      amount: string
      categoryId: string | null
      categoryName: string | null
      responsibleId: string | null
      responsibleName: string | null
      attachments: Array<{
        id: string
        uploadId: string
        name: string
        url: string
        kind: string
        createdAt: string
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/productions/{productionId}/anchors/{anchorId}": {
    /** Editar una partida presupuestada */
    params: {
      companyId: string
      productionId: string
      anchorId: string
    }
    body: {
      name?: string
      description?: string
      amount?: string
      categoryId?: string | null
      responsibleId?: string | null
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      amount: string
      categoryId: string | null
      categoryName: string | null
      responsibleId: string | null
      responsibleName: string | null
      attachments: Array<{
        id: string
        uploadId: string
        name: string
        url: string
        kind: string
        createdAt: string
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/anchors/{anchorId}": {
    /** Dar de baja una partida presupuestada */
    params: {
      companyId: string
      productionId: string
      anchorId: string
    }
    response: undefined
  }

  "POST /companies/{companyId}/productions/{productionId}/anchors/{anchorId}/attachments": {
    /** Colgar un comprobante de una partida */
    params: {
      companyId: string
      productionId: string
      anchorId: string
    }
    body: {
      uploadId: string
    }
    response: {
      id: string
      uploadId: string
      name: string
      url: string
      kind: string
      createdAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/anchors/{anchorId}/attachments/{attachmentId}": {
    /** Retirar un comprobante de una partida */
    params: {
      companyId: string
      productionId: string
      anchorId: string
      attachmentId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/productions/{productionId}/breakdown": {
    /** La estructura completa de la producción, como índice navegable */
    params: {
      companyId: string
      productionId: string
    }
    response: {
      chapters: Array<{
        id: string
        productionId: string
        scriptId: string | null
        name: string
        synopsis: string
        index: number
        responsibleId: string | null
        responsibleName: string | null
        sceneCount: number
        createdAt: string
        updatedAt: string
        scenes: Array<{
          id: string
          chapterId: string
          chapterIndex: number
          name: string
          synopsis: string
          index: number
          label: string
          workflowCount: number
          synopsisEditedAt: string | null
          missingFromLastSync: boolean
          createdAt: string
          updatedAt: string
        }>
      }>
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/budget": {
    /** Consultar el presupuesto de una producción, derivado en el momento */
    params: {
      companyId: string
      productionId: string
    }
    query?: {
      anchor_page?: string | Array<string>
      anchor_limit?: string | Array<string>
      anchor_offset?: string | Array<string>
      anchor_search?: string | Array<string>
      anchor_sort_name?: string | Array<string>
      anchor_sort_amount?: string | Array<string>
      anchor_sort_createdAt?: string | Array<string>
      anchor_categoryId?: string | Array<string>
      anchor_responsibleId?: string | Array<string>
      anchor_createdAt?: string | Array<string>
      shopping_page?: string | Array<string>
      shopping_limit?: string | Array<string>
      shopping_offset?: string | Array<string>
      shopping_search?: string | Array<string>
      shopping_sort_name?: string | Array<string>
      shopping_sort_amount?: string | Array<string>
      shopping_sort_occurredOn?: string | Array<string>
      shopping_sort_createdAt?: string | Array<string>
      shopping_categoryId?: string | Array<string>
      shopping_responsibleId?: string | Array<string>
      shopping_providerId?: string | Array<string>
      shopping_kind?: string | Array<string>
      shopping_method?: string | Array<string>
      shopping_isDeductible?: string | Array<string>
      shopping_occurredOn?: string | Array<string>
    }
    response: {
      anchors: Array<{
        id: string
        productionId: string
        name: string
        description: string
        amount: string
        categoryId: string | null
        categoryName: string | null
        responsibleId: string | null
        responsibleName: string | null
        attachments: Array<{
          id: string
          uploadId: string
          name: string
          url: string
          kind: string
          createdAt: string
        }>
        createdAt: string
        updatedAt: string
      }>
      shoppings: Array<{
        id: string
        productionId: string
        name: string
        observations: string
        amount: string
        kind: "shopping" | "expense" | "payment" | "rent" | "transfer"
        method: "cash" | "card" | "transfer"
        cardLast4: string | null
        isDeductible: boolean
        occurredOn: string | null
        providerId: string | null
        providerName: string | null
        categoryId: string | null
        categoryName: string | null
        responsibleId: string | null
        responsibleName: string | null
        warehouseOrderId: string | null
        items: Array<{
          id: string
          name: string
          code: string
        }>
        attachments: Array<{
          id: string
          uploadId: string
          name: string
          url: string
          kind: string
          createdAt: string
        }>
        createdAt: string
        updatedAt: string
      }>
      filtered: {
        totalPresupuestado: string
        totalGastado: string
        diferencia: string
        isUnfavorable: boolean
      }
      overall: {
        totalPresupuestado: string
        totalGastado: string
        diferencia: string
        isUnfavorable: boolean
      }
      categories: Array<{
        categoryId: string | null
        categoryName: string | null
        budgeted: string
        spent: string
        difference: string
        isUnfavorable: boolean
      }>
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/budget/document": {
    /** Componer el documento del presupuesto de una producción */
    params: {
      companyId: string
      productionId: string
    }
    response: {
      document: {
        kind: "budget"
        identity: {
          productionName: string
          startsOn: string | null
          endsOn: string | null
          generatedAt: string
        }
        issuer: {
          name: string
        }
        production: {
          id: string
          name: string
        }
        anchors: Array<{
          id: string
          name: string
          description: string
          amount: string
          categoryId: string | null
          categoryName: string | null
          responsibleName: string | null
        }>
        shoppings: Array<{
          id: string
          name: string
          observations: string
          amount: string
          kind: "shopping" | "expense" | "payment" | "rent" | "transfer"
          method: "cash" | "card" | "transfer"
          cardLast4: string | null
          isDeductible: boolean
          occurredOn: string | null
          providerName: string | null
          categoryId: string | null
          categoryName: string | null
          responsibleName: string | null
          itemCount: number
        }>
        amounts: {
          totalPresupuestado: string
          totalGastado: string
          diferencia: string
          isUnfavorable: boolean
        }
        categories: Array<{
          categoryId: string | null
          categoryName: string | null
          budgeted: string
          spent: string
          difference: string
          isUnfavorable: boolean
        }>
      }
      reference: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/calendar": {
    /** El calendario de la producción: jornadas, planes y tareas en un solo flujo */
    params: {
      companyId: string
      productionId: string
    }
    query?: {
      view?: "year" | "month" | "week" | "day"
      date?: string
      today?: string
      characterId?: string
      categoryId?: string
      kinds?: string
    }
    response: {
      view: "year" | "month" | "week" | "day"
      landing: {
        date: string
        reason: "before" | "during" | "after" | "empty"
      }
      range: {
        from: string
        to: string
      }
      events: Array<{
        kind: "recording" | "workflow" | "task"
        id: string
        day: string
        startsAt: string | null
        endsAt: string | null
        title: string
        status: string
        workflowId: string | null
        sceneId: string | null
        sceneLabel: string | null
        categoryId: string | null
        categoryName: string | null
        characterId: string | null
        characterName: string | null
        responsibleName: string | null
      }>
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/calendar/plans": {
    /** Planes con sus tareas filtradas; los que no tienen ninguna no aparecen */
    params: {
      companyId: string
      productionId: string
    }
    query?: {
      categoryId?: string
      characterId?: string
    }
    response: {
      items: Array<{
        id: string
        code: string
        observations: string
        status: string
        scheduledFor: string | null
        sceneId: string | null
        tasks: Array<{
          id: string
          title: string
          status: string
          categoryId: string | null
          characterId: string | null
          scheduledFor: string | null
        }>
      }>
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/categories": {
    /** Listar categorías; sin «parentId», las raíces */
    params: {
      companyId: string
      productionId: string
    }
    query?: {
      parentId?: string
    }
    response: {
      items: Array<{
        id: string
        productionId: string
        parentId: string | null
        roleId: string | null
        roleName: string | null
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

  "POST /companies/{companyId}/productions/{productionId}/categories": {
    /** Crear una categoría de la producción */
    params: {
      companyId: string
      productionId: string
    }
    body: {
      name: string
      description?: string
      parentId?: string | null
      roleId?: string | null
      color?: string
      icon?: string
    }
    response: {
      id: string
      productionId: string
      parentId: string | null
      roleId: string | null
      roleName: string | null
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

  "GET /companies/{companyId}/productions/{productionId}/categories/{categoryId}": {
    /** Ver una categoría de la producción */
    params: {
      companyId: string
      productionId: string
      categoryId: string
    }
    response: {
      id: string
      productionId: string
      parentId: string | null
      roleId: string | null
      roleName: string | null
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

  "PATCH /companies/{companyId}/productions/{productionId}/categories/{categoryId}": {
    /** Editar una categoría; «roleId» nulo la desvincula de su equipo */
    params: {
      companyId: string
      productionId: string
      categoryId: string
    }
    body: {
      name?: string
      description?: string
      parentId?: string | null
      roleId?: string | null
      color?: string | null
      icon?: string | null
    }
    response: {
      id: string
      productionId: string
      parentId: string | null
      roleId: string | null
      roleName: string | null
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

  "DELETE /companies/{companyId}/productions/{productionId}/categories/{categoryId}": {
    /** Eliminar una categoría y su subárbol */
    params: {
      companyId: string
      productionId: string
      categoryId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/productions/{productionId}/categories/{categoryId}/path": {
    /** El camino desde la raíz hasta una categoría */
    params: {
      companyId: string
      productionId: string
      categoryId: string
    }
    response: {
      items: Array<{
        id: string
        productionId: string
        parentId: string | null
        roleId: string | null
        roleName: string | null
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

  "GET /companies/{companyId}/productions/{productionId}/categories/{categoryId}/scope": {
    /** Qué se lleva por delante eliminar la categoría */
    params: {
      companyId: string
      productionId: string
      categoryId: string
    }
    response: {
      categories: number
      items: number
      videos: number
      tasks: number
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/chapters": {
    /** Listar los capítulos de una producción */
    params: {
      companyId: string
      productionId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_index?: string | Array<string>
      sort_name?: string | Array<string>
      sort_createdAt?: string | Array<string>
      scriptId?: string | Array<string>
      responsibleId?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        productionId: string
        scriptId: string | null
        name: string
        synopsis: string
        index: number
        responsibleId: string | null
        responsibleName: string | null
        sceneCount: number
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

  "POST /companies/{companyId}/productions/{productionId}/chapters": {
    /** Crear un capítulo */
    params: {
      companyId: string
      productionId: string
    }
    body: {
      name: string
      index: number
      synopsis?: string
      scriptId?: string | null
      responsibleId?: string | null
    }
    response: {
      id: string
      productionId: string
      scriptId: string | null
      name: string
      synopsis: string
      index: number
      responsibleId: string | null
      responsibleName: string | null
      sceneCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/chapters/indices": {
    /** Último índice de capítulo usado, y si uno concreto está libre */
    params: {
      companyId: string
      productionId: string
    }
    query?: {
      index?: string
    }
    response: {
      lastIndex: number | null
      nextIndex: number
      available: boolean | null
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/chapters/{chapterId}": {
    /** Ver un capítulo */
    params: {
      companyId: string
      productionId: string
      chapterId: string
    }
    response: {
      id: string
      productionId: string
      scriptId: string | null
      name: string
      synopsis: string
      index: number
      responsibleId: string | null
      responsibleName: string | null
      sceneCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/productions/{productionId}/chapters/{chapterId}": {
    /** Editar un capítulo */
    params: {
      companyId: string
      productionId: string
      chapterId: string
    }
    body: {
      name?: string
      index?: number
      synopsis?: string
      scriptId?: string | null
      responsibleId?: string | null
    }
    response: {
      id: string
      productionId: string
      scriptId: string | null
      name: string
      synopsis: string
      index: number
      responsibleId: string | null
      responsibleName: string | null
      sceneCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/chapters/{chapterId}": {
    /** Dar de baja un capítulo y sus escenas */
    params: {
      companyId: string
      productionId: string
      chapterId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/productions/{productionId}/chapters/{chapterId}/scenes": {
    /** Listar las escenas de un capítulo */
    params: {
      companyId: string
      productionId: string
      chapterId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_index?: string | Array<string>
      sort_name?: string | Array<string>
      sort_createdAt?: string | Array<string>
      missingFromLastSync?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        chapterId: string
        chapterIndex: number
        name: string
        synopsis: string
        index: number
        label: string
        workflowCount: number
        synopsisEditedAt: string | null
        missingFromLastSync: boolean
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

  "POST /companies/{companyId}/productions/{productionId}/chapters/{chapterId}/scenes": {
    /** Crear una escena en un capítulo */
    params: {
      companyId: string
      productionId: string
      chapterId: string
    }
    body: {
      name: string
      index: number
      synopsis?: string
    }
    response: {
      id: string
      chapterId: string
      chapterIndex: number
      name: string
      synopsis: string
      index: number
      label: string
      workflowCount: number
      synopsisEditedAt: string | null
      missingFromLastSync: boolean
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/chapters/{chapterId}/scenes/indices": {
    /** Último índice de escena usado en el capítulo, y si uno concreto está libre */
    params: {
      companyId: string
      productionId: string
      chapterId: string
    }
    query?: {
      index?: string
    }
    response: {
      lastIndex: number | null
      nextIndex: number
      available: boolean | null
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/chapters/{chapterId}/scenes/{sceneId}": {
    /** Ver una escena */
    params: {
      companyId: string
      productionId: string
      chapterId: string
      sceneId: string
    }
    response: {
      id: string
      chapterId: string
      chapterIndex: number
      name: string
      synopsis: string
      index: number
      label: string
      workflowCount: number
      synopsisEditedAt: string | null
      missingFromLastSync: boolean
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/productions/{productionId}/chapters/{chapterId}/scenes/{sceneId}": {
    /** Editar una escena */
    params: {
      companyId: string
      productionId: string
      chapterId: string
      sceneId: string
    }
    body: {
      name?: string
      index?: number
      synopsis?: string
    }
    response: {
      id: string
      chapterId: string
      chapterIndex: number
      name: string
      synopsis: string
      index: number
      label: string
      workflowCount: number
      synopsisEditedAt: string | null
      missingFromLastSync: boolean
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/chapters/{chapterId}/scenes/{sceneId}": {
    /** Dar de baja una escena */
    params: {
      companyId: string
      productionId: string
      chapterId: string
      sceneId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/productions/{productionId}/chapters/{chapterId}/scenes/{sceneId}/scope": {
    /** Qué se queda sin escena al dar de baja ésta */
    params: {
      companyId: string
      productionId: string
      chapterId: string
      sceneId: string
    }
    response: {
      recordings: number
      workflows: number
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/chapters/{chapterId}/scope": {
    /** Qué se lleva por delante dar de baja el capítulo */
    params: {
      companyId: string
      productionId: string
      chapterId: string
    }
    response: {
      scenes: number
      recordings: number
      workflows: number
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/characters": {
    /** Listar los personajes de una producción */
    params: {
      companyId: string
      productionId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_createdAt?: string | Array<string>
      responsibleId?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        productionId: string
        name: string
        description: string
        imageUploadId: string | null
        imageUrl: string | null
        imageThumbnailUrl: string | null
        responsibleId: string | null
        responsibleName: string | null
        continuityCount: number
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

  "POST /companies/{companyId}/productions/{productionId}/characters": {
    /** Registrar un personaje */
    params: {
      companyId: string
      productionId: string
    }
    body: {
      name: string
      description?: string
      imageUploadId?: string | null
      responsibleId?: string | null
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      imageUploadId: string | null
      imageUrl: string | null
      imageThumbnailUrl: string | null
      responsibleId: string | null
      responsibleName: string | null
      continuityCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/characters/{characterId}": {
    /** Ver un personaje */
    params: {
      companyId: string
      productionId: string
      characterId: string
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      imageUploadId: string | null
      imageUrl: string | null
      imageThumbnailUrl: string | null
      responsibleId: string | null
      responsibleName: string | null
      continuityCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/productions/{productionId}/characters/{characterId}": {
    /** Editar un personaje */
    params: {
      companyId: string
      productionId: string
      characterId: string
    }
    body: {
      name?: string
      description?: string
      imageUploadId?: string | null
      responsibleId?: string | null
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      imageUploadId: string | null
      imageUrl: string | null
      imageThumbnailUrl: string | null
      responsibleId: string | null
      responsibleName: string | null
      continuityCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/characters/{characterId}": {
    /** Dar de baja un personaje */
    params: {
      companyId: string
      productionId: string
      characterId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/productions/{productionId}/characters/{characterId}/continuity": {
    /** Ver cómo apareció un personaje a lo largo del rodaje */
    params: {
      companyId: string
      productionId: string
      characterId: string
    }
    response: {
      characterId: string
      characterName: string
      recordings: Array<{
        recordingId: string
        recordingName: string
        kind: "record" | "re_record"
        status: "draft" | "ongoing" | "completed"
        sceneId: string | null
        sceneName: string | null
        chapterName: string | null
        continuityId: string
        props: Array<{
          id: string
          continuityId: string
          kind: "item" | "video"
          itemId: string | null
          videoId: string | null
          name: string
          code: string | null
          createdAt: string
        }>
      }>
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/deliveries": {
    /** Listar las notas de entrega de una producción */
    params: {
      companyId: string
      productionId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_status?: string | Array<string>
      sort_createdAt?: string | Array<string>
      status?: string | Array<string>
      direction?: string | Array<string>
      responsibleId?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        productionId: string
        name: string
        description: string
        status: "pending" | "in_progress" | "completed" | "canceled"
        direction: "outbound" | "inbound"
        responsibleId: string | null
        responsibleName: string | null
        signedById: string | null
        signedByName: string | null
        signatureUploadId: string | null
        receiverName: string | null
        receiverSignatureUploadId: string | null
        signedAt: string | null
        isSigned: boolean
        counts: {
          total: number
          verified: number
          pending: number
        }
        lines: Array<{
          id: string
          deliveryId: string
          itemId: string
          itemName: string
          itemCode: string
          itemStatus: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
          isVerified: boolean
          verifiedById: string | null
          verifiedByName: string | null
          verifiedAt: string | null
          returnCondition: "returned" | "damaged" | "incomplete" | "lost" | "robbed" | null
        }>
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

  "POST /companies/{companyId}/productions/{productionId}/deliveries": {
    /** Abrir una nota de entrega */
    params: {
      companyId: string
      productionId: string
    }
    body: {
      name: string
      description?: string
      direction?: "outbound" | "inbound"
      responsibleId?: string | null
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      status: "pending" | "in_progress" | "completed" | "canceled"
      direction: "outbound" | "inbound"
      responsibleId: string | null
      responsibleName: string | null
      signedById: string | null
      signedByName: string | null
      signatureUploadId: string | null
      receiverName: string | null
      receiverSignatureUploadId: string | null
      signedAt: string | null
      isSigned: boolean
      counts: {
        total: number
        verified: number
        pending: number
      }
      lines: Array<{
        id: string
        deliveryId: string
        itemId: string
        itemName: string
        itemCode: string
        itemStatus: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
        isVerified: boolean
        verifiedById: string | null
        verifiedByName: string | null
        verifiedAt: string | null
        returnCondition: "returned" | "damaged" | "incomplete" | "lost" | "robbed" | null
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}": {
    /** Ver una nota de entrega */
    params: {
      companyId: string
      productionId: string
      deliveryId: string
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      status: "pending" | "in_progress" | "completed" | "canceled"
      direction: "outbound" | "inbound"
      responsibleId: string | null
      responsibleName: string | null
      signedById: string | null
      signedByName: string | null
      signatureUploadId: string | null
      receiverName: string | null
      receiverSignatureUploadId: string | null
      signedAt: string | null
      isSigned: boolean
      counts: {
        total: number
        verified: number
        pending: number
      }
      lines: Array<{
        id: string
        deliveryId: string
        itemId: string
        itemName: string
        itemCode: string
        itemStatus: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
        isVerified: boolean
        verifiedById: string | null
        verifiedByName: string | null
        verifiedAt: string | null
        returnCondition: "returned" | "damaged" | "incomplete" | "lost" | "robbed" | null
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}": {
    /** Editar el encabezado de una nota */
    params: {
      companyId: string
      productionId: string
      deliveryId: string
    }
    body: {
      name?: string
      description?: string
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      status: "pending" | "in_progress" | "completed" | "canceled"
      direction: "outbound" | "inbound"
      responsibleId: string | null
      responsibleName: string | null
      signedById: string | null
      signedByName: string | null
      signatureUploadId: string | null
      receiverName: string | null
      receiverSignatureUploadId: string | null
      signedAt: string | null
      isSigned: boolean
      counts: {
        total: number
        verified: number
        pending: number
      }
      lines: Array<{
        id: string
        deliveryId: string
        itemId: string
        itemName: string
        itemCode: string
        itemStatus: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
        isVerified: boolean
        verifiedById: string | null
        verifiedByName: string | null
        verifiedAt: string | null
        returnCondition: "returned" | "damaged" | "incomplete" | "lost" | "robbed" | null
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}": {
    /** Dar de baja una nota de entrega */
    params: {
      companyId: string
      productionId: string
      deliveryId: string
    }
    response: undefined
  }

  "POST /companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}/cancellation": {
    /** Cancelar una nota de entrega */
    params: {
      companyId: string
      productionId: string
      deliveryId: string
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      status: "pending" | "in_progress" | "completed" | "canceled"
      direction: "outbound" | "inbound"
      responsibleId: string | null
      responsibleName: string | null
      signedById: string | null
      signedByName: string | null
      signatureUploadId: string | null
      receiverName: string | null
      receiverSignatureUploadId: string | null
      signedAt: string | null
      isSigned: boolean
      counts: {
        total: number
        verified: number
        pending: number
      }
      lines: Array<{
        id: string
        deliveryId: string
        itemId: string
        itemName: string
        itemCode: string
        itemStatus: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
        isVerified: boolean
        verifiedById: string | null
        verifiedByName: string | null
        verifiedAt: string | null
        returnCondition: "returned" | "damaged" | "incomplete" | "lost" | "robbed" | null
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "POST /companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}/completion": {
    /** Cerrar una nota de entrega */
    params: {
      companyId: string
      productionId: string
      deliveryId: string
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      status: "pending" | "in_progress" | "completed" | "canceled"
      direction: "outbound" | "inbound"
      responsibleId: string | null
      responsibleName: string | null
      signedById: string | null
      signedByName: string | null
      signatureUploadId: string | null
      receiverName: string | null
      receiverSignatureUploadId: string | null
      signedAt: string | null
      isSigned: boolean
      counts: {
        total: number
        verified: number
        pending: number
      }
      lines: Array<{
        id: string
        deliveryId: string
        itemId: string
        itemName: string
        itemCode: string
        itemStatus: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
        isVerified: boolean
        verifiedById: string | null
        verifiedByName: string | null
        verifiedAt: string | null
        returnCondition: "returned" | "damaged" | "incomplete" | "lost" | "robbed" | null
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}/document": {
    /** Componer el documento de una nota de entrega */
    params: {
      companyId: string
      productionId: string
      deliveryId: string
    }
    response: {
      document: {
        kind: "delivery-note"
        identity: {
          name: string
          description: string
          status: "pending" | "in_progress" | "completed" | "canceled"
          direction: "outbound" | "inbound"
          generatedAt: string
        }
        issuer: {
          name: string
          taxId?: string
          email?: string
          phone?: string
          address?: string
          contacts: Array<unknown>
        }
        productionName: string
        responsibleName: string | null
        groups: Array<{
          isVerified: boolean
          lines: Array<{
            lineId: string
            itemName: string
            itemCode: string
            categoryName: string | null
            itemStatus: string
            isVerified: boolean
            verifiedByName: string | null
            verifiedAt: string | null
            returnCondition: string | null
          }>
        }>
        counts: {
          total: number
          verified: number
          pending: number
        }
        signatures: {
          isSigned: boolean
          deliveredByName: string | null
          receiverName: string | null
          signedAt: string | null
          deliveredSignatureUrl: string | null
          receiverSignatureUrl: string | null
        }
      }
      reference: string
    }
  }

  "PUT /companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}/items": {
    /** Componer la lista de artículos de una nota */
    params: {
      companyId: string
      productionId: string
      deliveryId: string
    }
    body: {
      itemIds: Array<string>
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      status: "pending" | "in_progress" | "completed" | "canceled"
      direction: "outbound" | "inbound"
      responsibleId: string | null
      responsibleName: string | null
      signedById: string | null
      signedByName: string | null
      signatureUploadId: string | null
      receiverName: string | null
      receiverSignatureUploadId: string | null
      signedAt: string | null
      isSigned: boolean
      counts: {
        total: number
        verified: number
        pending: number
      }
      lines: Array<{
        id: string
        deliveryId: string
        itemId: string
        itemName: string
        itemCode: string
        itemStatus: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
        isVerified: boolean
        verifiedById: string | null
        verifiedByName: string | null
        verifiedAt: string | null
        returnCondition: "returned" | "damaged" | "incomplete" | "lost" | "robbed" | null
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}/lines/by-code/{code}": {
    /** Localizar la línea de una nota por la etiqueta del artículo */
    params: {
      companyId: string
      productionId: string
      deliveryId: string
      code: string
    }
    response: {
      id: string
      deliveryId: string
      itemId: string
      itemName: string
      itemCode: string
      itemStatus: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
      isVerified: boolean
      verifiedById: string | null
      verifiedByName: string | null
      verifiedAt: string | null
      returnCondition: "returned" | "damaged" | "incomplete" | "lost" | "robbed" | null
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}/lines/{lineId}": {
    /** Quitar una pieza de una nota */
    params: {
      companyId: string
      productionId: string
      deliveryId: string
      lineId: string
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      status: "pending" | "in_progress" | "completed" | "canceled"
      direction: "outbound" | "inbound"
      responsibleId: string | null
      responsibleName: string | null
      signedById: string | null
      signedByName: string | null
      signatureUploadId: string | null
      receiverName: string | null
      receiverSignatureUploadId: string | null
      signedAt: string | null
      isSigned: boolean
      counts: {
        total: number
        verified: number
        pending: number
      }
      lines: Array<{
        id: string
        deliveryId: string
        itemId: string
        itemName: string
        itemCode: string
        itemStatus: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
        isVerified: boolean
        verifiedById: string | null
        verifiedByName: string | null
        verifiedAt: string | null
        returnCondition: "returned" | "damaged" | "incomplete" | "lost" | "robbed" | null
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "PUT /companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}/lines/{lineId}/verification": {
    /** Verificar una pieza, o deshacer su verificación */
    params: {
      companyId: string
      productionId: string
      deliveryId: string
      lineId: string
    }
    body: {
      isVerified: boolean
      returnCondition?: "returned" | "damaged" | "incomplete" | "lost" | "robbed"
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      status: "pending" | "in_progress" | "completed" | "canceled"
      direction: "outbound" | "inbound"
      responsibleId: string | null
      responsibleName: string | null
      signedById: string | null
      signedByName: string | null
      signatureUploadId: string | null
      receiverName: string | null
      receiverSignatureUploadId: string | null
      signedAt: string | null
      isSigned: boolean
      counts: {
        total: number
        verified: number
        pending: number
      }
      lines: Array<{
        id: string
        deliveryId: string
        itemId: string
        itemName: string
        itemCode: string
        itemStatus: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
        isVerified: boolean
        verifiedById: string | null
        verifiedByName: string | null
        verifiedAt: string | null
        returnCondition: "returned" | "damaged" | "incomplete" | "lost" | "robbed" | null
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "PUT /companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}/responsible": {
    /** Fijar el responsable de una nota */
    params: {
      companyId: string
      productionId: string
      deliveryId: string
    }
    body: {
      responsibleId: string | null
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      status: "pending" | "in_progress" | "completed" | "canceled"
      direction: "outbound" | "inbound"
      responsibleId: string | null
      responsibleName: string | null
      signedById: string | null
      signedByName: string | null
      signatureUploadId: string | null
      receiverName: string | null
      receiverSignatureUploadId: string | null
      signedAt: string | null
      isSigned: boolean
      counts: {
        total: number
        verified: number
        pending: number
      }
      lines: Array<{
        id: string
        deliveryId: string
        itemId: string
        itemName: string
        itemCode: string
        itemStatus: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
        isVerified: boolean
        verifiedById: string | null
        verifiedByName: string | null
        verifiedAt: string | null
        returnCondition: "returned" | "damaged" | "incomplete" | "lost" | "robbed" | null
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "PUT /companies/{companyId}/productions/{productionId}/deliveries/{deliveryId}/signatures": {
    /** Registrar las firmas de una nota */
    params: {
      companyId: string
      productionId: string
      deliveryId: string
    }
    body: {
      receiverName: string
      signatureUploadId?: string | null
      receiverSignatureUploadId?: string | null
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      status: "pending" | "in_progress" | "completed" | "canceled"
      direction: "outbound" | "inbound"
      responsibleId: string | null
      responsibleName: string | null
      signedById: string | null
      signedByName: string | null
      signatureUploadId: string | null
      receiverName: string | null
      receiverSignatureUploadId: string | null
      signedAt: string | null
      isSigned: boolean
      counts: {
        total: number
        verified: number
        pending: number
      }
      lines: Array<{
        id: string
        deliveryId: string
        itemId: string
        itemName: string
        itemCode: string
        itemStatus: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
        isVerified: boolean
        verifiedById: string | null
        verifiedByName: string | null
        verifiedAt: string | null
        returnCondition: "returned" | "damaged" | "incomplete" | "lost" | "robbed" | null
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/items": {
    /** Listar el inventario de una producción */
    params: {
      companyId: string
      productionId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_code?: string | Array<string>
      sort_status?: string | Array<string>
      sort_createdAt?: string | Array<string>
      status?: string | Array<string>
      categoryId?: string | Array<string>
      shoppingId?: string | Array<string>
      isInventoriable?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        productionId: string
        categoryId: string | null
        categoryName: string | null
        shoppingId: string | null
        name: string
        description: string
        code: string
        status: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
        isInventoriable: boolean
        allowedStatuses: Array<"available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed">
        images: Array<{
          uploadId: string
          url: string
          thumbnailUrl: string | null
          position: number
        }>
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

  "POST /companies/{companyId}/productions/{productionId}/items": {
    /** Dar de alta un artículo */
    params: {
      companyId: string
      productionId: string
    }
    body: {
      name: string
      description?: string
      categoryId?: string | null
      shoppingId?: string | null
      isInventoriable?: boolean
    }
    response: {
      id: string
      productionId: string
      categoryId: string | null
      categoryName: string | null
      shoppingId: string | null
      name: string
      description: string
      code: string
      status: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
      isInventoriable: boolean
      allowedStatuses: Array<"available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed">
      images: Array<{
        uploadId: string
        url: string
        thumbnailUrl: string | null
        position: number
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/items/{itemId}": {
    /** Ver un artículo */
    params: {
      companyId: string
      productionId: string
      itemId: string
    }
    response: {
      id: string
      productionId: string
      categoryId: string | null
      categoryName: string | null
      shoppingId: string | null
      name: string
      description: string
      code: string
      status: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
      isInventoriable: boolean
      allowedStatuses: Array<"available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed">
      images: Array<{
        uploadId: string
        url: string
        thumbnailUrl: string | null
        position: number
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/productions/{productionId}/items/{itemId}": {
    /** Editar un artículo */
    params: {
      companyId: string
      productionId: string
      itemId: string
    }
    body: {
      name?: string
      description?: string
      categoryId?: string | null
      shoppingId?: string | null
      isInventoriable?: boolean
    }
    response: {
      id: string
      productionId: string
      categoryId: string | null
      categoryName: string | null
      shoppingId: string | null
      name: string
      description: string
      code: string
      status: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
      isInventoriable: boolean
      allowedStatuses: Array<"available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed">
      images: Array<{
        uploadId: string
        url: string
        thumbnailUrl: string | null
        position: number
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/items/{itemId}": {
    /** Dar de baja un artículo */
    params: {
      companyId: string
      productionId: string
      itemId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/productions/{productionId}/items/{itemId}/events": {
    /** El historial de estado de un artículo */
    params: {
      companyId: string
      productionId: string
      itemId: string
    }
    response: {
      items: Array<{
        id: string
        itemId: string
        fromStatus: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed" | null
        toStatus: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
        reason: "manual" | "delivery" | "return" | "created"
        actorId: string | null
        actorName: string | null
        causeId: string | null
        note: string | null
        occurredAt: string
      }>
    }
  }

  "PUT /companies/{companyId}/productions/{productionId}/items/{itemId}/images": {
    /** Sustituir la galería de un artículo */
    params: {
      companyId: string
      productionId: string
      itemId: string
    }
    body: {
      uploadIds: Array<string>
    }
    response: {
      id: string
      productionId: string
      categoryId: string | null
      categoryName: string | null
      shoppingId: string | null
      name: string
      description: string
      code: string
      status: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
      isInventoriable: boolean
      allowedStatuses: Array<"available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed">
      images: Array<{
        uploadId: string
        url: string
        thumbnailUrl: string | null
        position: number
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/items/{itemId}/label": {
    /** La etiqueta imprimible de un artículo */
    params: {
      companyId: string
      productionId: string
      itemId: string
    }
    response: {
      itemId: string
      code: string
      payload: string
      name: string
      status: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
      productionId: string
    }
  }

  "PUT /companies/{companyId}/productions/{productionId}/items/{itemId}/status": {
    /** Cambiar el estado de un artículo */
    params: {
      companyId: string
      productionId: string
      itemId: string
    }
    body: {
      status: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
    }
    response: {
      id: string
      productionId: string
      categoryId: string | null
      categoryName: string | null
      shoppingId: string | null
      name: string
      description: string
      code: string
      status: "available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed"
      isInventoriable: boolean
      allowedStatuses: Array<"available" | "stored" | "delivered" | "returned" | "damaged" | "incomplete" | "lost" | "robbed">
      images: Array<{
        uploadId: string
        url: string
        thumbnailUrl: string | null
        position: number
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/items/{itemId}/usage": {
    /** Dónde se está usando un artículo */
    params: {
      companyId: string
      productionId: string
      itemId: string
    }
    response: {
      deliveries: Array<{
        id: string
        name: string
        status: "pending" | "in_progress" | "completed" | "canceled"
        direction: "outbound" | "inbound"
      }>
      sets: Array<{
        id: string
        name: string
      }>
      recordings: Array<{
        id: string
        name: string
        continuityId: string
      }>
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/panel": {
    /** Resumen de la producción: desglose y presupuesto */
    params: {
      companyId: string
      productionId: string
    }
    response: {
      chapters: number
      scenes: number
      recordings: {
        draft: number
        ongoing: number
        completed: number
      }
      workflows: {
        pending: number
        in_progress: number
        rescheduled: number
        completed: number
        cancelled: number
      }
      budget: {
        anchored: string
        spent: string
        difference: string
      }
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/recordings": {
    /** Listar las jornadas de rodaje de una producción */
    params: {
      companyId: string
      productionId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_createdAt?: string | Array<string>
      status?: string | Array<string>
      kind?: string | Array<string>
      sceneId?: string | Array<string>
      responsibleId?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        productionId: string
        sceneId: string | null
        name: string
        kind: "record" | "re_record"
        status: "draft" | "ongoing" | "completed"
        responsibleId: string | null
        responsibleName: string | null
        continuityCount: number
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

  "POST /companies/{companyId}/productions/{productionId}/recordings": {
    /** Programar una jornada de rodaje */
    params: {
      companyId: string
      productionId: string
    }
    body: {
      name: string
      sceneId?: string | null
      kind?: "record" | "re_record"
      responsibleId?: string | null
    }
    response: {
      id: string
      productionId: string
      sceneId: string | null
      name: string
      kind: "record" | "re_record"
      status: "draft" | "ongoing" | "completed"
      responsibleId: string | null
      responsibleName: string | null
      continuityCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/recordings/{recordingId}": {
    /** Ver una jornada de rodaje */
    params: {
      companyId: string
      productionId: string
      recordingId: string
    }
    response: {
      id: string
      productionId: string
      sceneId: string | null
      name: string
      kind: "record" | "re_record"
      status: "draft" | "ongoing" | "completed"
      responsibleId: string | null
      responsibleName: string | null
      continuityCount: number
      createdAt: string
      updatedAt: string
      scene: {
        id: string
        name: string
        index: number
        chapter: {
          id: string
          name: string
          index: number
        }
      } | null
      continuities: Array<{
        id: string
        recordingId: string
        characterId: string | null
        characterName: string | null
        responsibleId: string | null
        responsibleName: string | null
        props: Array<{
          id: string
          continuityId: string
          kind: "item" | "video"
          itemId: string | null
          videoId: string | null
          name: string
          code: string | null
          createdAt: string
        }>
        createdAt: string
        updatedAt: string
      }>
      notes: Array<{
        id: string
        recordingId: string
        body: string
        authorId: string | null
        authorName: string | null
        createdAt: string
        updatedAt: string
      }>
    }
  }

  "PATCH /companies/{companyId}/productions/{productionId}/recordings/{recordingId}": {
    /** Editar una jornada de rodaje */
    params: {
      companyId: string
      productionId: string
      recordingId: string
    }
    body: {
      name?: string
      sceneId?: string | null
      kind?: "record" | "re_record"
      responsibleId?: string | null
    }
    response: {
      id: string
      productionId: string
      sceneId: string | null
      name: string
      kind: "record" | "re_record"
      status: "draft" | "ongoing" | "completed"
      responsibleId: string | null
      responsibleName: string | null
      continuityCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/recordings/{recordingId}": {
    /** Dar de baja una jornada de rodaje */
    params: {
      companyId: string
      productionId: string
      recordingId: string
    }
    response: undefined
  }

  "POST /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/characters": {
    /** Asignar personajes a una jornada de rodaje */
    params: {
      companyId: string
      productionId: string
      recordingId: string
    }
    body: {
      characterIds: Array<string>
    }
    response: {
      id: string
      productionId: string
      sceneId: string | null
      name: string
      kind: "record" | "re_record"
      status: "draft" | "ongoing" | "completed"
      responsibleId: string | null
      responsibleName: string | null
      continuityCount: number
      createdAt: string
      updatedAt: string
      scene: {
        id: string
        name: string
        index: number
        chapter: {
          id: string
          name: string
          index: number
        }
      } | null
      continuities: Array<{
        id: string
        recordingId: string
        characterId: string | null
        characterName: string | null
        responsibleId: string | null
        responsibleName: string | null
        props: Array<{
          id: string
          continuityId: string
          kind: "item" | "video"
          itemId: string | null
          videoId: string | null
          name: string
          code: string | null
          createdAt: string
        }>
        createdAt: string
        updatedAt: string
      }>
      notes: Array<{
        id: string
        recordingId: string
        body: string
        authorId: string | null
        authorName: string | null
        createdAt: string
        updatedAt: string
      }>
    }
  }

  "POST /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/close": {
    /** Cerrar una jornada de rodaje */
    params: {
      companyId: string
      productionId: string
      recordingId: string
    }
    response: {
      id: string
      productionId: string
      sceneId: string | null
      name: string
      kind: "record" | "re_record"
      status: "draft" | "ongoing" | "completed"
      responsibleId: string | null
      responsibleName: string | null
      continuityCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "POST /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/continuities": {
    /** Abrir una continuidad en una jornada */
    params: {
      companyId: string
      productionId: string
      recordingId: string
    }
    body: {
      characterId?: string | null
      responsibleId?: string | null
    }
    response: {
      id: string
      recordingId: string
      characterId: string | null
      characterName: string | null
      responsibleId: string | null
      responsibleName: string | null
      props: Array<{
        id: string
        continuityId: string
        kind: "item" | "video"
        itemId: string | null
        videoId: string | null
        name: string
        code: string | null
        createdAt: string
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/continuities/{continuityId}": {
    /** Eliminar una continuidad */
    params: {
      companyId: string
      productionId: string
      recordingId: string
      continuityId: string
    }
    response: undefined
  }

  "PUT /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/continuities/{continuityId}/character": {
    /** Poner o retirar el personaje de una continuidad */
    params: {
      companyId: string
      productionId: string
      recordingId: string
      continuityId: string
    }
    body: {
      characterId: string | null
    }
    response: {
      id: string
      recordingId: string
      characterId: string | null
      characterName: string | null
      responsibleId: string | null
      responsibleName: string | null
      props: Array<{
        id: string
        continuityId: string
        kind: "item" | "video"
        itemId: string | null
        videoId: string | null
        name: string
        code: string | null
        createdAt: string
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "POST /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/continuities/{continuityId}/items": {
    /** Colgar un artículo de una continuidad */
    params: {
      companyId: string
      productionId: string
      recordingId: string
      continuityId: string
    }
    body: {
      itemId: string
    }
    response: {
      id: string
      continuityId: string
      kind: "item" | "video"
      itemId: string | null
      videoId: string | null
      name: string
      code: string | null
      createdAt: string
    }
  }

  "PUT /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/continuities/{continuityId}/items": {
    /** Establecer el conjunto de artículos de una continuidad */
    params: {
      companyId: string
      productionId: string
      recordingId: string
      continuityId: string
    }
    body: {
      itemIds: Array<string>
    }
    response: {
      id: string
      recordingId: string
      characterId: string | null
      characterName: string | null
      responsibleId: string | null
      responsibleName: string | null
      props: Array<{
        id: string
        continuityId: string
        kind: "item" | "video"
        itemId: string | null
        videoId: string | null
        name: string
        code: string | null
        createdAt: string
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "POST /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/continuities/{continuityId}/videos": {
    /** Colgar un video de referencia de una continuidad */
    params: {
      companyId: string
      productionId: string
      recordingId: string
      continuityId: string
    }
    body: {
      videoId: string
    }
    response: {
      id: string
      continuityId: string
      kind: "item" | "video"
      itemId: string | null
      videoId: string | null
      name: string
      code: string | null
      createdAt: string
    }
  }

  "PUT /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/continuities/{continuityId}/videos": {
    /** Establecer el conjunto de videos de una continuidad */
    params: {
      companyId: string
      productionId: string
      recordingId: string
      continuityId: string
    }
    body: {
      videoIds: Array<string>
    }
    response: {
      id: string
      recordingId: string
      characterId: string | null
      characterName: string | null
      responsibleId: string | null
      responsibleName: string | null
      props: Array<{
        id: string
        continuityId: string
        kind: "item" | "video"
        itemId: string | null
        videoId: string | null
        name: string
        code: string | null
        createdAt: string
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "POST /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/notes": {
    /** Anotar una jornada de rodaje */
    params: {
      companyId: string
      productionId: string
      recordingId: string
    }
    body: {
      body: string
    }
    response: {
      id: string
      recordingId: string
      body: string
      authorId: string | null
      authorName: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/notes/{noteId}": {
    /** Corregir una nota de la jornada */
    params: {
      companyId: string
      productionId: string
      recordingId: string
      noteId: string
    }
    body: {
      body: string
    }
    response: {
      id: string
      recordingId: string
      body: string
      authorId: string | null
      authorName: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/notes/{noteId}": {
    /** Eliminar una nota de la jornada */
    params: {
      companyId: string
      productionId: string
      recordingId: string
      noteId: string
    }
    response: undefined
  }

  "POST /companies/{companyId}/productions/{productionId}/recordings/{recordingId}/open": {
    /** Volver a abrir una jornada de rodaje */
    params: {
      companyId: string
      productionId: string
      recordingId: string
    }
    response: {
      id: string
      productionId: string
      sceneId: string | null
      name: string
      kind: "record" | "re_record"
      status: "draft" | "ongoing" | "completed"
      responsibleId: string | null
      responsibleName: string | null
      continuityCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/scenes": {
    /** Listar todas las escenas de una producción, atravesando sus capítulos */
    params: {
      companyId: string
      productionId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_index?: string | Array<string>
      sort_name?: string | Array<string>
      sort_createdAt?: string | Array<string>
      missingFromLastSync?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        chapterId: string
        chapterIndex: number
        name: string
        synopsis: string
        index: number
        label: string
        workflowCount: number
        synopsisEditedAt: string | null
        missingFromLastSync: boolean
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

  "GET /companies/{companyId}/productions/{productionId}/scope": {
    /** Qué se lleva por delante dar de baja la producción */
    params: {
      companyId: string
      productionId: string
    }
    response: {
      scripts: number
      chapters: number
      scenes: number
      characters: number
      sets: number
      videos: number
      items: number
      recordings: number
      workflows: number
      purchaseOrders: number
      openPurchaseOrders: number
      unreturnedOrders: number
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/scripts": {
    /** Listar los guiones de una producción */
    params: {
      companyId: string
      productionId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_index?: string | Array<string>
      sort_name?: string | Array<string>
      sort_createdAt?: string | Array<string>
      syncStatus?: string | Array<string>
      responsibleId?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        productionId: string
        name: string
        index: number
        documentUploadId: string | null
        documentUrl: string | null
        documentFileName: string | null
        responsibleId: string | null
        responsibleName: string | null
        syncStatus: "not_extracted" | "queued" | "running" | "completed" | "failed"
        syncError: string | null
        syncedAt: string | null
        scenesWithoutBody: number
        chapterCount: number
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

  "POST /companies/{companyId}/productions/{productionId}/scripts": {
    /** Registrar un guion */
    params: {
      companyId: string
      productionId: string
    }
    body: {
      name: string
      index?: number
      documentUploadId?: string | null
      responsibleId?: string | null
    }
    response: {
      id: string
      productionId: string
      name: string
      index: number
      documentUploadId: string | null
      documentUrl: string | null
      documentFileName: string | null
      responsibleId: string | null
      responsibleName: string | null
      syncStatus: "not_extracted" | "queued" | "running" | "completed" | "failed"
      syncError: string | null
      syncedAt: string | null
      scenesWithoutBody: number
      chapterCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/scripts/{scriptId}": {
    /** Ver un guion */
    params: {
      companyId: string
      productionId: string
      scriptId: string
    }
    response: {
      id: string
      productionId: string
      name: string
      index: number
      documentUploadId: string | null
      documentUrl: string | null
      documentFileName: string | null
      responsibleId: string | null
      responsibleName: string | null
      syncStatus: "not_extracted" | "queued" | "running" | "completed" | "failed"
      syncError: string | null
      syncedAt: string | null
      scenesWithoutBody: number
      chapterCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/productions/{productionId}/scripts/{scriptId}": {
    /** Editar un guion, o sustituir su archivo */
    params: {
      companyId: string
      productionId: string
      scriptId: string
    }
    body: {
      name?: string
      index?: number
      documentUploadId?: string | null
      responsibleId?: string | null
    }
    response: {
      id: string
      productionId: string
      name: string
      index: number
      documentUploadId: string | null
      documentUrl: string | null
      documentFileName: string | null
      responsibleId: string | null
      responsibleName: string | null
      syncStatus: "not_extracted" | "queued" | "running" | "completed" | "failed"
      syncError: string | null
      syncedAt: string | null
      scenesWithoutBody: number
      chapterCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/scripts/{scriptId}": {
    /** Dar de baja un guion */
    params: {
      companyId: string
      productionId: string
      scriptId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/productions/{productionId}/scripts/{scriptId}/scope": {
    /** Qué se desvincula al dar de baja el guion */
    params: {
      companyId: string
      productionId: string
      scriptId: string
    }
    response: {
      chapters: number
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/sets": {
    /** Listar los sets de una producción */
    params: {
      companyId: string
      productionId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_createdAt?: string | Array<string>
      responsibleId?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        productionId: string
        name: string
        description: string
        imageUploadId: string | null
        imageUrl: string | null
        imageThumbnailUrl: string | null
        responsibleId: string | null
        responsibleName: string | null
        itemCount: number
        items?: Array<{
          itemId: string
          name: string
          code: string
          status: string
        }>
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

  "POST /companies/{companyId}/productions/{productionId}/sets": {
    /** Registrar un set */
    params: {
      companyId: string
      productionId: string
    }
    body: {
      name: string
      description?: string
      imageUploadId?: string | null
      responsibleId?: string | null
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      imageUploadId: string | null
      imageUrl: string | null
      imageThumbnailUrl: string | null
      responsibleId: string | null
      responsibleName: string | null
      itemCount: number
      items?: Array<{
        itemId: string
        name: string
        code: string
        status: string
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/sets/{setId}": {
    /** Ver un set con su composición */
    params: {
      companyId: string
      productionId: string
      setId: string
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      imageUploadId: string | null
      imageUrl: string | null
      imageThumbnailUrl: string | null
      responsibleId: string | null
      responsibleName: string | null
      itemCount: number
      items?: Array<{
        itemId: string
        name: string
        code: string
        status: string
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/productions/{productionId}/sets/{setId}": {
    /** Editar un set */
    params: {
      companyId: string
      productionId: string
      setId: string
    }
    body: {
      name?: string
      description?: string
      imageUploadId?: string | null
      responsibleId?: string | null
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      imageUploadId: string | null
      imageUrl: string | null
      imageThumbnailUrl: string | null
      responsibleId: string | null
      responsibleName: string | null
      itemCount: number
      items?: Array<{
        itemId: string
        name: string
        code: string
        status: string
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/sets/{setId}": {
    /** Dar de baja un set */
    params: {
      companyId: string
      productionId: string
      setId: string
    }
    response: undefined
  }

  "PUT /companies/{companyId}/productions/{productionId}/sets/{setId}/items": {
    /** Componer un set: establecer de una vez sus artículos */
    params: {
      companyId: string
      productionId: string
      setId: string
    }
    body: {
      itemIds: Array<string>
    }
    response: {
      id: string
      productionId: string
      name: string
      description: string
      imageUploadId: string | null
      imageUrl: string | null
      imageThumbnailUrl: string | null
      responsibleId: string | null
      responsibleName: string | null
      itemCount: number
      items?: Array<{
        itemId: string
        name: string
        code: string
        status: string
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/shoppings": {
    /** Listar los gastos de una producción */
    params: {
      companyId: string
      productionId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_amount?: string | Array<string>
      sort_occurredOn?: string | Array<string>
      sort_createdAt?: string | Array<string>
      categoryId?: string | Array<string>
      responsibleId?: string | Array<string>
      providerId?: string | Array<string>
      kind?: string | Array<string>
      method?: string | Array<string>
      isDeductible?: string | Array<string>
      occurredOn?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        productionId: string
        name: string
        observations: string
        amount: string
        kind: "shopping" | "expense" | "payment" | "rent" | "transfer"
        method: "cash" | "card" | "transfer"
        cardLast4: string | null
        isDeductible: boolean
        occurredOn: string | null
        providerId: string | null
        providerName: string | null
        categoryId: string | null
        categoryName: string | null
        responsibleId: string | null
        responsibleName: string | null
        warehouseOrderId: string | null
        items: Array<{
          id: string
          name: string
          code: string
        }>
        attachments: Array<{
          id: string
          uploadId: string
          name: string
          url: string
          kind: string
          createdAt: string
        }>
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

  "POST /companies/{companyId}/productions/{productionId}/shoppings": {
    /** Registrar un gasto; clasificarlo exige su propia clave */
    params: {
      companyId: string
      productionId: string
    }
    body: {
      name: string
      observations?: string
      amount: string
      kind?: "shopping" | "expense" | "payment" | "rent" | "transfer"
      method?: "cash" | "card" | "transfer"
      cardLast4?: string | null
      isDeductible?: boolean
      occurredOn?: string | null
      providerId?: string | null
      categoryId?: string | null
      responsibleId?: string | null
    }
    response: {
      id: string
      productionId: string
      name: string
      observations: string
      amount: string
      kind: "shopping" | "expense" | "payment" | "rent" | "transfer"
      method: "cash" | "card" | "transfer"
      cardLast4: string | null
      isDeductible: boolean
      occurredOn: string | null
      providerId: string | null
      providerName: string | null
      categoryId: string | null
      categoryName: string | null
      responsibleId: string | null
      responsibleName: string | null
      warehouseOrderId: string | null
      items: Array<{
        id: string
        name: string
        code: string
      }>
      attachments: Array<{
        id: string
        uploadId: string
        name: string
        url: string
        kind: string
        createdAt: string
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/shoppings/{shoppingId}": {
    /** Consultar un gasto con sus artículos y sus facturas */
    params: {
      companyId: string
      productionId: string
      shoppingId: string
    }
    response: {
      id: string
      productionId: string
      name: string
      observations: string
      amount: string
      kind: "shopping" | "expense" | "payment" | "rent" | "transfer"
      method: "cash" | "card" | "transfer"
      cardLast4: string | null
      isDeductible: boolean
      occurredOn: string | null
      providerId: string | null
      providerName: string | null
      categoryId: string | null
      categoryName: string | null
      responsibleId: string | null
      responsibleName: string | null
      warehouseOrderId: string | null
      items: Array<{
        id: string
        name: string
        code: string
      }>
      attachments: Array<{
        id: string
        uploadId: string
        name: string
        url: string
        kind: string
        createdAt: string
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/productions/{productionId}/shoppings/{shoppingId}": {
    /** Editar un gasto; la categoría lleva su propia clave */
    params: {
      companyId: string
      productionId: string
      shoppingId: string
    }
    body: {
      name?: string
      observations?: string
      amount?: string
      kind?: "shopping" | "expense" | "payment" | "rent" | "transfer"
      method?: "cash" | "card" | "transfer"
      cardLast4?: string | null
      isDeductible?: boolean
      occurredOn?: string | null
      providerId?: string | null
      categoryId?: string | null
      responsibleId?: string | null
    }
    response: {
      id: string
      productionId: string
      name: string
      observations: string
      amount: string
      kind: "shopping" | "expense" | "payment" | "rent" | "transfer"
      method: "cash" | "card" | "transfer"
      cardLast4: string | null
      isDeductible: boolean
      occurredOn: string | null
      providerId: string | null
      providerName: string | null
      categoryId: string | null
      categoryName: string | null
      responsibleId: string | null
      responsibleName: string | null
      warehouseOrderId: string | null
      items: Array<{
        id: string
        name: string
        code: string
      }>
      attachments: Array<{
        id: string
        uploadId: string
        name: string
        url: string
        kind: string
        createdAt: string
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/shoppings/{shoppingId}": {
    /** Dar de baja un gasto; sus artículos vuelven al inventario sin compra */
    params: {
      companyId: string
      productionId: string
      shoppingId: string
    }
    response: undefined
  }

  "POST /companies/{companyId}/productions/{productionId}/shoppings/{shoppingId}/attachments": {
    /** Colgar una factura de un gasto */
    params: {
      companyId: string
      productionId: string
      shoppingId: string
    }
    body: {
      uploadId: string
    }
    response: {
      id: string
      uploadId: string
      name: string
      url: string
      kind: string
      createdAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/shoppings/{shoppingId}/attachments/{attachmentId}": {
    /** Retirar una factura de un gasto */
    params: {
      companyId: string
      productionId: string
      shoppingId: string
      attachmentId: string
    }
    response: undefined
  }

  "PUT /companies/{companyId}/productions/{productionId}/shoppings/{shoppingId}/items": {
    /** Establecer los artículos que incorporó una compra */
    params: {
      companyId: string
      productionId: string
      shoppingId: string
    }
    body: {
      itemIds: Array<string>
    }
    response: {
      id: string
      productionId: string
      name: string
      observations: string
      amount: string
      kind: "shopping" | "expense" | "payment" | "rent" | "transfer"
      method: "cash" | "card" | "transfer"
      cardLast4: string | null
      isDeductible: boolean
      occurredOn: string | null
      providerId: string | null
      providerName: string | null
      categoryId: string | null
      categoryName: string | null
      responsibleId: string | null
      responsibleName: string | null
      warehouseOrderId: string | null
      items: Array<{
        id: string
        name: string
        code: string
      }>
      attachments: Array<{
        id: string
        uploadId: string
        name: string
        url: string
        kind: string
        createdAt: string
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/videos": {
    /** Listar la biblioteca de videos de una producción */
    params: {
      companyId: string
      productionId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_createdAt?: string | Array<string>
      categoryId?: string | Array<string>
      responsibleId?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        productionId: string
        categoryId: string | null
        categoryName: string | null
        name: string
        videoUploadId: string | null
        videoUrl: string | null
        responsibleId: string | null
        responsibleName: string | null
        propCount: number
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

  "POST /companies/{companyId}/productions/{productionId}/videos": {
    /** Registrar un video en la biblioteca */
    params: {
      companyId: string
      productionId: string
    }
    body: {
      name: string
      videoUploadId?: string | null
      categoryId?: string | null
      responsibleId?: string | null
    }
    response: {
      id: string
      productionId: string
      categoryId: string | null
      categoryName: string | null
      name: string
      videoUploadId: string | null
      videoUrl: string | null
      responsibleId: string | null
      responsibleName: string | null
      propCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/videos/{videoId}": {
    /** Ver un video y obtener su dirección de reproducción */
    params: {
      companyId: string
      productionId: string
      videoId: string
    }
    response: {
      id: string
      productionId: string
      categoryId: string | null
      categoryName: string | null
      name: string
      videoUploadId: string | null
      videoUrl: string | null
      responsibleId: string | null
      responsibleName: string | null
      propCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/productions/{productionId}/videos/{videoId}": {
    /** Editar un video */
    params: {
      companyId: string
      productionId: string
      videoId: string
    }
    body: {
      name?: string
      videoUploadId?: string | null
      categoryId?: string | null
      responsibleId?: string | null
    }
    response: {
      id: string
      productionId: string
      categoryId: string | null
      categoryName: string | null
      name: string
      videoUploadId: string | null
      videoUrl: string | null
      responsibleId: string | null
      responsibleName: string | null
      propCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/videos/{videoId}": {
    /** Dar de baja un video */
    params: {
      companyId: string
      productionId: string
      videoId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/productions/{productionId}/workflows": {
    /** Listar los planes de trabajo de una producción */
    params: {
      companyId: string
      productionId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_scheduledFor?: string | Array<string>
      sort_code?: string | Array<string>
      sort_createdAt?: string | Array<string>
      status?: string | Array<string>
      responsibleId?: string | Array<string>
      sceneId?: string | Array<string>
      chapterId?: string | Array<string>
      scheduledFor?: string | Array<string>
      aggregates?: string
    }
    response: {
      items: Array<{
        id: string
        productionId: string
        sceneId: string | null
        code: string
        observations: string
        status: "pending" | "in_progress" | "rescheduled" | "completed" | "cancelled"
        scheduledFor: string
        endsAt: string | null
        responsibleId: string | null
        responsibleName: string | null
        taskCount: number
        tasksByStatus?: {
          pending: number
          in_progress: number
          completed: number
          incomplete: number
        }
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

  "POST /companies/{companyId}/productions/{productionId}/workflows": {
    /** Crear un plan de trabajo; nace pendiente */
    params: {
      companyId: string
      productionId: string
    }
    body: {
      scheduledFor: string
      endsAt?: string | null
      observations?: string
      responsibleId?: string | null
      sceneId?: string | null
    }
    response: {
      id: string
      productionId: string
      sceneId: string | null
      code: string
      observations: string
      status: "pending" | "in_progress" | "rescheduled" | "completed" | "cancelled"
      scheduledFor: string
      endsAt: string | null
      responsibleId: string | null
      responsibleName: string | null
      taskCount: number
      tasksByStatus?: {
        pending: number
        in_progress: number
        completed: number
        incomplete: number
      }
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/workflows/{workflowId}": {
    /** Ver un plan de trabajo */
    params: {
      companyId: string
      productionId: string
      workflowId: string
    }
    query?: {
      aggregates?: string
    }
    response: {
      id: string
      productionId: string
      sceneId: string | null
      code: string
      observations: string
      status: "pending" | "in_progress" | "rescheduled" | "completed" | "cancelled"
      scheduledFor: string
      endsAt: string | null
      responsibleId: string | null
      responsibleName: string | null
      taskCount: number
      tasksByStatus?: {
        pending: number
        in_progress: number
        completed: number
        incomplete: number
      }
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/productions/{productionId}/workflows/{workflowId}": {
    /** Editar un plan; cambiar fecha y estado a la vez es reprogramarlo */
    params: {
      companyId: string
      productionId: string
      workflowId: string
    }
    body: {
      scheduledFor?: string
      endsAt?: string | null
      observations?: string
      responsibleId?: string | null
      status?: "pending" | "in_progress" | "rescheduled" | "completed" | "cancelled"
      sceneId?: string | null
    }
    response: {
      id: string
      productionId: string
      sceneId: string | null
      code: string
      observations: string
      status: "pending" | "in_progress" | "rescheduled" | "completed" | "cancelled"
      scheduledFor: string
      endsAt: string | null
      responsibleId: string | null
      responsibleName: string | null
      taskCount: number
      tasksByStatus?: {
        pending: number
        in_progress: number
        completed: number
        incomplete: number
      }
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/workflows/{workflowId}": {
    /** Eliminar un plan de trabajo y sus tareas */
    params: {
      companyId: string
      productionId: string
      workflowId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/comments": {
    /** Leer los comentarios de un plan */
    params: {
      companyId: string
      productionId: string
      workflowId: string
    }
    response: {
      items: Array<{
        id: string
        workflowId: string | null
        taskId: string | null
        body: string
        authorId: string | null
        authorName: string | null
        createdAt: string
        updatedAt: string
      }>
    }
  }

  "POST /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/comments": {
    /** Comentar un plan; el autor es quien escribe */
    params: {
      companyId: string
      productionId: string
      workflowId: string
    }
    body: {
      body: string
    }
    response: {
      id: string
      workflowId: string | null
      taskId: string | null
      body: string
      authorId: string | null
      authorName: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/comments/{commentId}": {
    /** Editar un comentario de un plan */
    params: {
      companyId: string
      productionId: string
      workflowId: string
      commentId: string
    }
    body: {
      body: string
    }
    response: {
      id: string
      workflowId: string | null
      taskId: string | null
      body: string
      authorId: string | null
      authorName: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/comments/{commentId}": {
    /** Eliminar un comentario de un plan */
    params: {
      companyId: string
      productionId: string
      workflowId: string
      commentId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/document": {
    /** Componer el documento de un plan de trabajo */
    params: {
      companyId: string
      productionId: string
      workflowId: string
    }
    response: {
      document: {
        kind: "work-plan"
        identity: {
          code: string
          status: "pending" | "in_progress" | "rescheduled" | "completed" | "cancelled"
          observations: string
          scheduledFor: string
          endsAt: string | null
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
        production: {
          id: string
          name: string
        }
        scene: {
          id: string
          name: string
          label: string
          chapterName: string
        } | null
        responsibleName: string | null
        weeks: Array<{
          from: string
          to: string
          days: Array<{
            day: string
            tasks: Array<{
              id: string
              title: string
              description: string
              status: "pending" | "in_progress" | "completed" | "incomplete"
              day: string | null
              scheduledFor: string | null
              endsAt: string | null
              responsibleName: string | null
              categoryName: string | null
              characterName: string | null
              activityCount: number
              completedActivities: number
            }>
          }>
        }>
        undated: Array<{
          id: string
          title: string
          description: string
          status: "pending" | "in_progress" | "completed" | "incomplete"
          day: string | null
          scheduledFor: string | null
          endsAt: string | null
          responsibleName: string | null
          categoryName: string | null
          characterName: string | null
          activityCount: number
          completedActivities: number
        }>
        totals: {
          tasks: number
          byStatus: {
            pending: number
            in_progress: number
            completed: number
            incomplete: number
          }
        }
      }
      reference: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/scope": {
    /** Qué se lleva por delante eliminar el plan */
    params: {
      companyId: string
      productionId: string
      workflowId: string
    }
    response: {
      tasks: number
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks": {
    /** Listar las tareas de un plan */
    params: {
      companyId: string
      productionId: string
      workflowId: string
    }
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_scheduledFor?: string | Array<string>
      sort_title?: string | Array<string>
      sort_createdAt?: string | Array<string>
      status?: string | Array<string>
      responsibleId?: string | Array<string>
      categoryId?: string | Array<string>
      characterId?: string | Array<string>
      scheduledFor?: string | Array<string>
      aggregates?: "true" | "false"
    }
    response: {
      items: Array<{
        id: string
        workflowId: string
        categoryId: string | null
        categoryName: string | null
        characterId: string | null
        characterName: string | null
        title: string
        description: string
        status: "pending" | "in_progress" | "completed" | "incomplete"
        scheduledFor: string | null
        endsAt: string | null
        responsibleId: string | null
        responsibleName: string | null
        createdById: string | null
        createdByName: string | null
        activityCount: number
        activitiesByStatus?: {
          incomplete: number
          completed: number
        }
        attachmentCount: number
        commentCount: number
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

  "POST /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks": {
    /** Añadir una tarea a un plan; su creador queda fijado */
    params: {
      companyId: string
      productionId: string
      workflowId: string
    }
    body: {
      title: string
      description?: string
      categoryId?: string | null
      characterId?: string | null
      responsibleId?: string | null
      scheduledFor?: string | null
      endsAt?: string | null
    }
    response: {
      id: string
      workflowId: string
      categoryId: string | null
      categoryName: string | null
      characterId: string | null
      characterName: string | null
      title: string
      description: string
      status: "pending" | "in_progress" | "completed" | "incomplete"
      scheduledFor: string | null
      endsAt: string | null
      responsibleId: string | null
      responsibleName: string | null
      createdById: string | null
      createdByName: string | null
      activityCount: number
      activitiesByStatus?: {
        incomplete: number
        completed: number
      }
      attachmentCount: number
      commentCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}": {
    /** Consultar una tarea con sus actividades, comentarios y adjuntos */
    params: {
      companyId: string
      productionId: string
      workflowId: string
      taskId: string
    }
    response: {
      id: string
      workflowId: string
      categoryId: string | null
      categoryName: string | null
      characterId: string | null
      characterName: string | null
      title: string
      description: string
      status: "pending" | "in_progress" | "completed" | "incomplete"
      scheduledFor: string | null
      endsAt: string | null
      responsibleId: string | null
      responsibleName: string | null
      createdById: string | null
      createdByName: string | null
      activityCount: number
      activitiesByStatus?: {
        incomplete: number
        completed: number
      }
      attachmentCount: number
      commentCount: number
      createdAt: string
      updatedAt: string
      activities: Array<{
        id: string
        taskId: string
        title: string
        description: string
        status: "incomplete" | "completed"
        scheduledFor: string | null
        endsAt: string | null
        responsibleId: string | null
        responsibleName: string | null
        createdById: string | null
        createdByName: string | null
        attachments: Array<{
          id: string
          uploadId: string
          name: string
          url: string
          kind: string
          createdAt: string
        }>
        createdAt: string
        updatedAt: string
      }>
      comments: Array<{
        id: string
        workflowId: string | null
        taskId: string | null
        body: string
        authorId: string | null
        authorName: string | null
        createdAt: string
        updatedAt: string
      }>
      attachments: Array<{
        id: string
        uploadId: string
        name: string
        url: string
        kind: string
        createdAt: string
      }>
    }
  }

  "PATCH /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}": {
    /** Editar una tarea; el estado, el responsable y la categoría llevan su propia clave */
    params: {
      companyId: string
      productionId: string
      workflowId: string
      taskId: string
    }
    body: {
      title?: string
      description?: string
      categoryId?: string | null
      characterId?: string | null
      responsibleId?: string | null
      scheduledFor?: string | null
      endsAt?: string | null
      status?: "pending" | "in_progress" | "completed" | "incomplete"
    }
    response: {
      id: string
      workflowId: string
      categoryId: string | null
      categoryName: string | null
      characterId: string | null
      characterName: string | null
      title: string
      description: string
      status: "pending" | "in_progress" | "completed" | "incomplete"
      scheduledFor: string | null
      endsAt: string | null
      responsibleId: string | null
      responsibleName: string | null
      createdById: string | null
      createdByName: string | null
      activityCount: number
      activitiesByStatus?: {
        incomplete: number
        completed: number
      }
      attachmentCount: number
      commentCount: number
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}": {
    /** Eliminar una tarea con sus actividades y comentarios */
    params: {
      companyId: string
      productionId: string
      workflowId: string
      taskId: string
    }
    response: undefined
  }

  "POST /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/activities": {
    /** Desglosar una tarea en actividades; nacen incompletas */
    params: {
      companyId: string
      productionId: string
      workflowId: string
      taskId: string
    }
    body: {
      title: string
      description?: string
      responsibleId?: string | null
      scheduledFor?: string | null
      endsAt?: string | null
    }
    response: {
      id: string
      taskId: string
      title: string
      description: string
      status: "incomplete" | "completed"
      scheduledFor: string | null
      endsAt: string | null
      responsibleId: string | null
      responsibleName: string | null
      createdById: string | null
      createdByName: string | null
      attachments: Array<{
        id: string
        uploadId: string
        name: string
        url: string
        kind: string
        createdAt: string
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/activities/{activityId}": {
    /** Editar una actividad; el estado y el responsable llevan su propia clave */
    params: {
      companyId: string
      productionId: string
      workflowId: string
      taskId: string
      activityId: string
    }
    body: {
      title?: string
      description?: string
      responsibleId?: string | null
      scheduledFor?: string | null
      endsAt?: string | null
      status?: "incomplete" | "completed"
    }
    response: {
      id: string
      taskId: string
      title: string
      description: string
      status: "incomplete" | "completed"
      scheduledFor: string | null
      endsAt: string | null
      responsibleId: string | null
      responsibleName: string | null
      createdById: string | null
      createdByName: string | null
      attachments: Array<{
        id: string
        uploadId: string
        name: string
        url: string
        kind: string
        createdAt: string
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/activities/{activityId}": {
    /** Eliminar una actividad */
    params: {
      companyId: string
      productionId: string
      workflowId: string
      taskId: string
      activityId: string
    }
    response: undefined
  }

  "POST /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/activities/{activityId}/attachments": {
    /** Adjuntar un archivo a una actividad */
    params: {
      companyId: string
      productionId: string
      workflowId: string
      taskId: string
      activityId: string
    }
    body: {
      uploadId: string
    }
    response: {
      id: string
      uploadId: string
      name: string
      url: string
      kind: string
      createdAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/activities/{activityId}/attachments/{attachmentId}": {
    /** Retirar un adjunto de una actividad */
    params: {
      companyId: string
      productionId: string
      workflowId: string
      taskId: string
      activityId: string
      attachmentId: string
    }
    response: undefined
  }

  "POST /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/attachments": {
    /** Adjuntar un archivo a una tarea */
    params: {
      companyId: string
      productionId: string
      workflowId: string
      taskId: string
    }
    body: {
      uploadId: string
    }
    response: {
      id: string
      uploadId: string
      name: string
      url: string
      kind: string
      createdAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/attachments/{attachmentId}": {
    /** Retirar un adjunto de una tarea */
    params: {
      companyId: string
      productionId: string
      workflowId: string
      taskId: string
      attachmentId: string
    }
    response: undefined
  }

  "POST /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/comments": {
    /** Comentar una tarea; el autor es quien escribe */
    params: {
      companyId: string
      productionId: string
      workflowId: string
      taskId: string
    }
    body: {
      body: string
    }
    response: {
      id: string
      workflowId: string | null
      taskId: string | null
      body: string
      authorId: string | null
      authorName: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/comments/{commentId}": {
    /** Editar un comentario de una tarea */
    params: {
      companyId: string
      productionId: string
      workflowId: string
      taskId: string
      commentId: string
    }
    body: {
      body: string
    }
    response: {
      id: string
      workflowId: string | null
      taskId: string | null
      body: string
      authorId: string | null
      authorName: string | null
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/comments/{commentId}": {
    /** Eliminar un comentario de una tarea */
    params: {
      companyId: string
      productionId: string
      workflowId: string
      taskId: string
      commentId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/productions/{productionId}/workflows/{workflowId}/tasks/{taskId}/scope": {
    /** Enumerar lo que se pierde al eliminar una tarea */
    params: {
      companyId: string
      productionId: string
      workflowId: string
      taskId: string
    }
    response: {
      activities: number
      comments: number
      attachments: number
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
        arrivedAt: string | null
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
        arrivedAt: string | null
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
        arrivedAt: string | null
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

  "GET /companies/{companyId}/warehouses/{warehouseId}/pending-arrivals": {
    /** Listar el equipo acuñado que todavía no ha llegado */
    params: {
      companyId: string
      warehouseId: string
    }
    response: {
      items: Array<{
        id: string
        measurementId: string
        code: string
        status: "available" | "in_quote" | "in_order" | "rented" | "sold" | "lost" | "damaged" | "robbed" | "incomplete" | "modified" | "expense"
        createdByReservation: boolean
        arrivedAt: string | null
        createdAt: string
        updatedAt: string
      }>
    }
  }

  "POST /companies/{companyId}/warehouses/{warehouseId}/pending-arrivals/confirm": {
    /** Confirmar que el equipo acuñado llegó */
    params: {
      companyId: string
      warehouseId: string
    }
    body: {
      unitIds: Array<string>
    }
    response: {
      items: Array<{
        id: string
        measurementId: string
        code: string
        status: "available" | "in_quote" | "in_order" | "rented" | "sold" | "lost" | "damaged" | "robbed" | "incomplete" | "modified" | "expense"
        createdByReservation: boolean
        arrivedAt: string | null
        createdAt: string
        updatedAt: string
      }>
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
      arrivedAt: string | null
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

  "GET /companies/{companyId}/websites/{websiteId}/customizations": {
    /** Listar las personalizaciones de un sitio */
    params: {
      companyId: string
      websiteId: string
    }
    response: {
      items: Array<{
        id: string
        websiteId: string
        name: string
        color: string
        bannerUploadId: string | null
        bannerUrl: string | null
        isPrimary: boolean
        isActive: boolean
        startsAt: string | null
        endsAt: string | null
        sections: Array<{
          kind: string
          show: boolean
          position?: number
          title?: string
          description?: string
          icon?: string
          props?: Record<string, unknown>
          styles?: Record<string, string>
          items?: Array<{
            code: string
            title?: string
            description?: string
            icon?: string
            avatar?: string
            image?: string
          }>
          buttons?: Array<{
            code: string
            label: string
            icon?: string
            value?: string
            action: "link" | "scroll" | "app"
            variant: "filled" | "outline" | "light"
          }>
        }>
        createdAt: string
        updatedAt: string
      }>
    }
  }

  "POST /companies/{companyId}/websites/{websiteId}/customizations": {
    /** Crear una personalización */
    params: {
      companyId: string
      websiteId: string
    }
    body: {
      name: string
      color?: string
      bannerUploadId?: string | null
      isPrimary?: boolean
      startsAt?: string | null
      endsAt?: string | null
      sections?: Array<{
        kind: string
        show: boolean
        position?: number
        title?: string
        description?: string
        icon?: string
        props?: Record<string, unknown>
        styles?: Record<string, string>
        items?: Array<{
          code: string
          title?: string
          description?: string
          icon?: string
          avatar?: string
          image?: string
        }>
        buttons?: Array<{
          code: string
          label: string
          icon?: string
          value?: string
          action: "link" | "scroll" | "app"
          variant: "filled" | "outline" | "light"
        }>
      }>
    }
    response: {
      id: string
      websiteId: string
      name: string
      color: string
      bannerUploadId: string | null
      bannerUrl: string | null
      isPrimary: boolean
      isActive: boolean
      startsAt: string | null
      endsAt: string | null
      sections: Array<{
        kind: string
        show: boolean
        position?: number
        title?: string
        description?: string
        icon?: string
        props?: Record<string, unknown>
        styles?: Record<string, string>
        items?: Array<{
          code: string
          title?: string
          description?: string
          icon?: string
          avatar?: string
          image?: string
        }>
        buttons?: Array<{
          code: string
          label: string
          icon?: string
          value?: string
          action: "link" | "scroll" | "app"
          variant: "filled" | "outline" | "light"
        }>
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "GET /companies/{companyId}/websites/{websiteId}/customizations/{customizationId}": {
    /** Ver una personalización */
    params: {
      companyId: string
      websiteId: string
      customizationId: string
    }
    response: {
      id: string
      websiteId: string
      name: string
      color: string
      bannerUploadId: string | null
      bannerUrl: string | null
      isPrimary: boolean
      isActive: boolean
      startsAt: string | null
      endsAt: string | null
      sections: Array<{
        kind: string
        show: boolean
        position?: number
        title?: string
        description?: string
        icon?: string
        props?: Record<string, unknown>
        styles?: Record<string, string>
        items?: Array<{
          code: string
          title?: string
          description?: string
          icon?: string
          avatar?: string
          image?: string
        }>
        buttons?: Array<{
          code: string
          label: string
          icon?: string
          value?: string
          action: "link" | "scroll" | "app"
          variant: "filled" | "outline" | "light"
        }>
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "PATCH /companies/{companyId}/websites/{websiteId}/customizations/{customizationId}": {
    /** Modificar una personalización, su contenido o el orden de sus secciones */
    params: {
      companyId: string
      websiteId: string
      customizationId: string
    }
    body: {
      name?: string
      color?: string
      bannerUploadId?: string | null
      isPrimary?: boolean
      startsAt?: string | null
      endsAt?: string | null
      sections?: Array<{
        kind: string
        show: boolean
        position?: number
        title?: string
        description?: string
        icon?: string
        props?: Record<string, unknown>
        styles?: Record<string, string>
        items?: Array<{
          code: string
          title?: string
          description?: string
          icon?: string
          avatar?: string
          image?: string
        }>
        buttons?: Array<{
          code: string
          label: string
          icon?: string
          value?: string
          action: "link" | "scroll" | "app"
          variant: "filled" | "outline" | "light"
        }>
      }>
    }
    response: {
      id: string
      websiteId: string
      name: string
      color: string
      bannerUploadId: string | null
      bannerUrl: string | null
      isPrimary: boolean
      isActive: boolean
      startsAt: string | null
      endsAt: string | null
      sections: Array<{
        kind: string
        show: boolean
        position?: number
        title?: string
        description?: string
        icon?: string
        props?: Record<string, unknown>
        styles?: Record<string, string>
        items?: Array<{
          code: string
          title?: string
          description?: string
          icon?: string
          avatar?: string
          image?: string
        }>
        buttons?: Array<{
          code: string
          label: string
          icon?: string
          value?: string
          action: "link" | "scroll" | "app"
          variant: "filled" | "outline" | "light"
        }>
      }>
      createdAt: string
      updatedAt: string
    }
  }

  "DELETE /companies/{companyId}/websites/{websiteId}/customizations/{customizationId}": {
    /** Dar de baja una personalización */
    params: {
      companyId: string
      websiteId: string
      customizationId: string
    }
    response: undefined
  }

  "GET /companies/{companyId}/websites/{websiteId}/page": {
    /** Vista previa de la página de un sitio */
    params: {
      companyId: string
      websiteId: string
    }
    query?: {
      customizationId?: string
    }
    response: {
      customizationId: string | null
      name: string | null
      color: string
      bannerUrl: string | null
      sections: Array<{
        kind: "hero" | "categories" | "products" | "about" | "features" | "testimonials" | "faq" | "footer"
        show: boolean
        position: number
        title?: string
        description?: string
        icon?: string
        props?: Record<string, unknown>
        styles?: Record<string, string>
        items?: Array<{
          code: string
          title?: string
          description?: string
          icon?: string
          avatar?: string
          image?: string
        }>
        buttons?: Array<{
          code: string
          label: string
          icon?: string
          value?: string
          action: "link" | "scroll" | "app"
          variant: "filled" | "outline" | "light"
        }>
      }>
    }
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
        messageKey: string
        messageParams: Record<string, string | number>
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

  "GET /me/checkouts": {
    /** Mis compras en curso */
    response: Array<{
      id: string
      status: "pending" | "completed" | "canceled" | "expired"
      type: string
      storeSlug: string
      storeName: string
      lines: Array<{
        kind: string
        refId: string
        name: string
        unitPrice: string
        quantity: number
        total: string
      }>
      subtotal: string
      shippingCost: string
      total: string
      currency: string
      shippingMode: string
      checkoutUrl: string | null
      expiresAt: string | null
      createdAt: string
    }>
  }

  "GET /me/checkouts/{checkoutId}": {
    /** Una compra mía */
    params: {
      checkoutId: string
    }
    response: {
      id: string
      status: "pending" | "completed" | "canceled" | "expired"
      type: string
      storeSlug: string
      storeName: string
      lines: Array<{
        kind: string
        refId: string
        name: string
        unitPrice: string
        quantity: number
        total: string
      }>
      subtotal: string
      shippingCost: string
      total: string
      currency: string
      shippingMode: string
      checkoutUrl: string | null
      expiresAt: string | null
      createdAt: string
    }
  }

  "POST /me/checkouts/{checkoutId}/cancellation": {
    /** Desistir de la compra y liberar el inventario */
    params: {
      checkoutId: string
    }
    response: {
      id: string
      status: "pending" | "completed" | "canceled" | "expired"
      type: string
      storeSlug: string
      storeName: string
      lines: Array<{
        kind: string
        refId: string
        name: string
        unitPrice: string
        quantity: number
        total: string
      }>
      subtotal: string
      shippingCost: string
      total: string
      currency: string
      shippingMode: string
      checkoutUrl: string | null
      expiresAt: string | null
      createdAt: string
    }
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
        bodyKey: string
        bodyParams: Record<string, string | number>
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
      bodyKey: string
      bodyParams: Record<string, string | number>
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
      bodyKey: string
      bodyParams: Record<string, string | number>
      url: string
      readAt: string | null
      archivedAt: string | null
      createdAt: string
    }
  }

  "GET /me/orders": {
    /** Mis pedidos, de todas las tiendas */
    response: Array<{
      id: string
      reference: string
      status: string
      type: string
      storeSlug: string
      storeName: string
      subtotal: string
      shippingCost: string
      total: string
      currency: string
      createdAt: string
      lines: Array<{
        kind: string
        refId: string
        name: string
        unitPrice: string
        quantity: number
        total: string
      }>
      payment: {
        status: string
        method: string | null
        grossAmount: string
        receiptUrl: string | null
        refundedAmount: string
      } | null
      shipment: {
        id: string
        mode: string
        status: string
        cost: string
        carrier: string
        trackingNumber: string | null
        estimatedDeliveryAt: string | null
        deliveredAt: string | null
      } | null
    }>
  }

  "GET /me/orders/{orderId}": {
    /** Un pedido mío */
    params: {
      orderId: string
    }
    response: {
      id: string
      reference: string
      status: string
      type: string
      storeSlug: string
      storeName: string
      subtotal: string
      shippingCost: string
      total: string
      currency: string
      createdAt: string
      lines: Array<{
        kind: string
        refId: string
        name: string
        unitPrice: string
        quantity: number
        total: string
      }>
      payment: {
        status: string
        method: string | null
        grossAmount: string
        receiptUrl: string | null
        refundedAmount: string
      } | null
      shipment: {
        id: string
        mode: string
        status: string
        cost: string
        carrier: string
        trackingNumber: string | null
        estimatedDeliveryAt: string | null
        deliveredAt: string | null
      } | null
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

  "GET /payments/local/checkouts/{session}": {
    /** Página de cobro del procesador suplente */
    params: {
      session: string
    }
    response: undefined
  }

  "POST /payments/local/checkouts/{session}/pay": {
    /** Pagar en el procesador suplente y emitir su evento firmado */
    params: {
      session: string
    }
    response: undefined
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

  "GET /platform/activity": {
    /** Lo que ha hecho la administración de plataforma */
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_createdAt?: string | Array<string>
      action?: string | Array<string>
      entity?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        action: "create" | "update" | "delete"
        entity: string
        entityId: string | null
        entityLabel: string
        title: string
        description: string
        performedBy: string
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

  "GET /platform/companies": {
    /** Padrón de empresas, de sólo lectura */
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_createdAt?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        name: string
        description: string
        email: string | null
        commissionRate: string
        memberCount: number
        createdAt: string
        deletedAt: string | null
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

  "GET /platform/companies/{companyId}/members": {
    /** Quién lleva una empresa, sin entrar en ella */
    params: {
      companyId: string
    }
    response: {
      items: Array<{
        id: string
        userId: string
        email: string
        name: string
        lastname: string
        isOwner: boolean
        isActive: boolean
      }>
    }
  }

  "GET /platform/users": {
    /** Padrón de cuentas, de sólo lectura */
    query?: {
      page?: string | Array<string>
      limit?: string | Array<string>
      offset?: string | Array<string>
      search?: string | Array<string>
      sort_name?: string | Array<string>
      sort_email?: string | Array<string>
      sort_createdAt?: string | Array<string>
      isActive?: string | Array<string>
      isPlatformAdmin?: string | Array<string>
      createdAt?: string | Array<string>
    }
    response: {
      items: Array<{
        id: string
        email: string
        username: string
        name: string
        lastname: string
        isActive: boolean
        isPlatformAdmin: boolean
        emailVerified: boolean
        companyCount: number
        lastLoginAt: string | null
        createdAt: string
        deletedAt: string | null
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
      } | {
        kind: "delivery-note"
        identity: {
          name: string
          description: string
          status: "pending" | "in_progress" | "completed" | "canceled"
          direction: "outbound" | "inbound"
          generatedAt: string
        }
        issuer: {
          name: string
          taxId?: string
          email?: string
          phone?: string
          address?: string
          contacts: Array<unknown>
        }
        productionName: string
        responsibleName: string | null
        groups: Array<{
          isVerified: boolean
          lines: Array<{
            lineId: string
            itemName: string
            itemCode: string
            categoryName: string | null
            itemStatus: string
            isVerified: boolean
            verifiedByName: string | null
            verifiedAt: string | null
            returnCondition: string | null
          }>
        }>
        counts: {
          total: number
          verified: number
          pending: number
        }
        signatures: {
          isSigned: boolean
          deliveredByName: string | null
          receiverName: string | null
          signedAt: string | null
          deliveredSignatureUrl: string | null
          receiverSignatureUrl: string | null
        }
      } | {
        kind: "work-plan"
        identity: {
          code: string
          status: "pending" | "in_progress" | "rescheduled" | "completed" | "cancelled"
          observations: string
          scheduledFor: string
          endsAt: string | null
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
        production: {
          id: string
          name: string
        }
        scene: {
          id: string
          name: string
          label: string
          chapterName: string
        } | null
        responsibleName: string | null
        weeks: Array<{
          from: string
          to: string
          days: Array<{
            day: string
            tasks: Array<{
              id: string
              title: string
              description: string
              status: "pending" | "in_progress" | "completed" | "incomplete"
              day: string | null
              scheduledFor: string | null
              endsAt: string | null
              responsibleName: string | null
              categoryName: string | null
              characterName: string | null
              activityCount: number
              completedActivities: number
            }>
          }>
        }>
        undated: Array<{
          id: string
          title: string
          description: string
          status: "pending" | "in_progress" | "completed" | "incomplete"
          day: string | null
          scheduledFor: string | null
          endsAt: string | null
          responsibleName: string | null
          categoryName: string | null
          characterName: string | null
          activityCount: number
          completedActivities: number
        }>
        totals: {
          tasks: number
          byStatus: {
            pending: number
            in_progress: number
            completed: number
            incomplete: number
          }
        }
      } | {
        kind: "budget"
        identity: {
          productionName: string
          startsOn: string | null
          endsOn: string | null
          generatedAt: string
        }
        issuer: {
          name: string
        }
        production: {
          id: string
          name: string
        }
        anchors: Array<{
          id: string
          name: string
          description: string
          amount: string
          categoryId: string | null
          categoryName: string | null
          responsibleName: string | null
        }>
        shoppings: Array<{
          id: string
          name: string
          observations: string
          amount: string
          kind: "shopping" | "expense" | "payment" | "rent" | "transfer"
          method: "cash" | "card" | "transfer"
          cardLast4: string | null
          isDeductible: boolean
          occurredOn: string | null
          providerName: string | null
          categoryId: string | null
          categoryName: string | null
          responsibleName: string | null
          itemCount: number
        }>
        amounts: {
          totalPresupuestado: string
          totalGastado: string
          diferencia: string
          isUnfavorable: boolean
        }
        categories: Array<{
          categoryId: string | null
          categoryName: string | null
          budgeted: string
          spent: string
          difference: string
          isUnfavorable: boolean
        }>
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

  "POST /public/sites/{slug}/cart": {
    /** Valorar un carrito contra el catálogo publicado */
    params: {
      slug: string
    }
    body: {
      type?: "sale" | "rent"
      items: Array<{
        kind: "warehouse_measurement" | "pixit_product" | "pixit_mosaic"
        refId: string
        quantity: number
      }>
    }
    response: {
      storeSlug: string
      storeName: string
      lines: Array<{
        kind: "warehouse_measurement"
        refId: string
        productId: string
        productName: string
        measurementName: string
        name: string
        unitPrice: string
        quantity: number
        total: string
        available: number
        coverUrl: string | null
      }>
      subtotal: string
    }
  }

  "POST /public/sites/{slug}/checkout": {
    /** Apartar el inventario y abrir la sesión de pago */
    params: {
      slug: string
    }
    headers?: {
      "idempotency-key"?: string
    }
    body: {
      type?: "sale" | "rent"
      mode: "local" | "national" | "international" | "pickup"
      items: Array<{
        kind: "warehouse_measurement" | "pixit_product" | "pixit_mosaic"
        refId: string
        quantity: number
      }>
      toAddressId?: string
    }
    response: {
      id: string
      status: "pending" | "completed" | "canceled" | "expired"
      type: string
      storeSlug: string
      storeName: string
      lines: Array<{
        kind: string
        refId: string
        name: string
        unitPrice: string
        quantity: number
        total: string
      }>
      subtotal: string
      shippingCost: string
      total: string
      currency: string
      shippingMode: string
      checkoutUrl: string | null
      expiresAt: string | null
      createdAt: string
    }
  }

  "GET /public/sites/{slug}/page": {
    /** Las secciones que sirve la portada de una tienda */
    params: {
      slug: string
    }
    response: {
      customizationId: string | null
      name: string | null
      color: string
      bannerUrl: string | null
      sections: Array<{
        kind: "hero" | "categories" | "products" | "about" | "features" | "testimonials" | "faq" | "footer"
        show: boolean
        position: number
        title?: string
        description?: string
        icon?: string
        props?: Record<string, unknown>
        styles?: Record<string, string>
        items?: Array<{
          code: string
          title?: string
          description?: string
          icon?: string
          avatar?: string
          image?: string
        }>
        buttons?: Array<{
          code: string
          label: string
          icon?: string
          value?: string
          action: "link" | "scroll" | "app"
          variant: "filled" | "outline" | "light"
        }>
      }>
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
