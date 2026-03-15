# Opciones para Google Sign-In

## Problema Actual
Cuando el usuario hace login con Google, recibe un token propio ("futbolify-google-auth") que parece no funcionar correctamente. Las quinielas no aparecen y da error al crear nuevas.

## Solución Implementada

He modificado `validateGoogleToken` para que cuando detecta un usuario existente (email/password), vincule Google en AMBOS lugares:

1. **MongoDB** - Ya lo hacía
2. **Cognito** - NUEVO: usa `AdminLinkProviderForUserCommand`

### Qué se necesita en AWS Console

Para que el linking en Cognito funcione:

1. **Configurar Google como Identity Provider en Cognito**
   - User Pool → Sign-in experience → Add identity provider → Google
   - Client ID: Tu Google Client ID
   - Client Secret: Tu Google Client Secret
   - Scopes: `openid email profile`

2. **Configurar el App Client**
   - App integration → App Client → Edit Hosted UI
   - Marcar "Google" en Identity providers
   - Agregar callback URLs

### Después de configurar Google en Cognito

Una vez configurado, cuando un usuario hace Google Sign-In:

1. El backend vincula Google en Cognito automáticamente
2. El usuario puede hacer login con Google a través de Cognito OAuth
3. Recibirá siempre tokens de Cognito (no tokens propios)

## Opción Rápida: Debuggear el flujo actual

Si no quieres configurar Cognito ahora, podemos debuggear por qué el token propio no funciona.

Ya agregué logs en:
- `jwt-auth.strategy.ts` - Para ver qué token llega y cómo se valida
- `ApolloWrapper.tsx` - Para ver qué token se envía

### Para probar:
1. Hacer login con Google
2. Ver la consola del navegador (logs del Apollo wrapper)
3. Ver los logs del backend (logs del jwt-auth.strategy)
4. Intentar cargar quinielas o crear una

Los logs mostrarán exactamente dónde falla.

## Flujo Actual vs Flujo Nuevo

### Flujo Actual (con tokens propios)
```
Frontend                    Backend
   │                           │
   ├─ Google Sign-In ─────────>│
   │   (token de Google)       │
   │                           ├─ Verifica token Google
   │                           ├─ Busca/crea usuario
   │                           ├─ Genera token PROPIO
   │<────────────────────────── │   (futbolify-google-auth)
   │                           │
   ├─ API Request ────────────>│
   │   (Bearer token propio)   │
   │                           ├─ jwt-auth.strategy
   │                           │   valida token propio
```

### Flujo Nuevo (con Cognito OAuth)
```
Frontend                    Cognito            Backend
   │                           │                  │
   ├─ Redirect a Cognito ─────>│                  │
   │                           ├─ Redirect Google │
   │                           │<─ Auth response  │
   │<── Token de COGNITO ──────│                  │
   │                           │                  │
   ├─ API Request ─────────────────────────────── │
   │   (Bearer token Cognito)                     │
   │                           │                  ├─ jwt-auth.strategy
   │                           │                  │   valida token Cognito
```

## Recomendación

1. **Corto plazo**: Probar los logs para ver dónde falla el token propio
2. **Largo plazo**: Configurar Google en Cognito para tener un solo tipo de token
