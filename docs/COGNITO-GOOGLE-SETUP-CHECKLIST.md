# Checklist: Configuración de Google Sign-In con Cognito

## Resumen

Este documento es una guía paso a paso para configurar Google Sign-In usando Cognito como proveedor de identidad. Esto resuelve el problema de tener dos tipos de tokens diferentes (Cognito vs tokens propios).

## Estado Actual

- [x] Lambda Pre-Signup creada en `/lambda/cognito-pre-signup/`
- [x] Proveedor de Cognito agregado a NextAuth en `auth.ts`
- [x] Nuevo componente de Google Sign-In en `CognitoGoogleSignin.tsx`
- [x] Variables de entorno documentadas en `env.example`
- [x] Documentación completa en `COGNITO-GOOGLE-LINKING.md`

## Pasos Pendientes en AWS Console

### 1. Configurar Google como Identity Provider en Cognito

1. **Ir a Amazon Cognito** → Tu User Pool
2. **Sign-in experience** → Federated identity provider sign-in
3. **Add identity provider** → Google
4. Ingresar:
   ```
   Client ID: [Tu Google Client ID]
   Client Secret: [Tu Google Client Secret]
   Authorized scopes: openid email profile
   ```
5. Mapear atributos:
   ```
   email → email
   name → name
   ```

### 2. Configurar App Client

1. **App integration** → Tu App Client → Edit Hosted UI
2. En "Identity providers": Marcar **Google**
3. Callback URLs:
   ```
   https://www.futbolify.com/api/auth/callback/cognito
   http://localhost:3000/api/auth/callback/cognito
   ```
4. Sign-out URLs:
   ```
   https://www.futbolify.com
   http://localhost:3000
   ```
5. OAuth grant types:
   - [x] Authorization code grant
6. OpenID Connect scopes:
   - [x] openid
   - [x] email
   - [x] profile

### 3. Obtener Client Secret

1. En App Client, click "Show client secret"
2. Copiar el Client Secret (necesario para NextAuth)

### 4. Desplegar Lambda Pre-Signup

```bash
cd lambda/cognito-pre-signup
npm install
npm run package
```

Luego en AWS Lambda:
1. Crear función: `cognito-pre-signup`
2. Runtime: Node.js 20.x
3. Subir `function.zip`
4. Agregar permisos IAM (ver documentación)

### 5. Conectar Lambda a Cognito

1. **Cognito** → User Pool → **User pool properties**
2. **Lambda triggers** → Add trigger
3. **Pre sign-up** → Seleccionar `cognito-pre-signup`

### 6. Configurar Variables de Entorno (Frontend)

Agregar a `.env.local`:

```env
COGNITO_CLIENT_ID=<tu-app-client-id>
COGNITO_CLIENT_SECRET=<tu-app-client-secret>
COGNITO_ISSUER=https://cognito-idp.us-east-1.amazonaws.com/<tu-user-pool-id>
```

### 7. Actualizar Google Sign-In Button

En el componente de Sign-In, reemplazar `GoogleSigninButton` por `CognitoGoogleSigninButton`:

```tsx
// Antes
import { GoogleSigninButton } from "@/components/Auth/Signin/GoogleSignin/GoogleSining"

// Después
import { CognitoGoogleSigninButton } from "@/components/Auth/Signin/GoogleSignin/CognitoGoogleSignin"
```

## Verificación

### Prueba 1: Usuario Nuevo con Google
1. Ir a signin
2. Click "Continue with Google"
3. Autorizar en Google
4. Debe crear cuenta y redirigir a /feed
5. Verificar que `session.token` es un token de Cognito (issuer = cognito-idp.*.amazonaws.com)

### Prueba 2: Usuario Existente (email/password) + Google
1. Usuario ya tiene cuenta con email/password
2. Click "Continue with Google" (mismo email)
3. La Lambda Pre-Signup debe vincular las cuentas
4. Mensaje: "User already exists, provider has been linked"
5. Intentar login de nuevo
6. Debe funcionar con token de Cognito

### Prueba 3: Acceso a Quinielas
1. Login con Google
2. Ir a quinielas
3. Deben aparecer las mismas quinielas que con email/password
4. No debe haber error "Either authentication or anonymousCreatorId is required"

## Rollback

Si algo falla, puedes volver al flujo anterior:

1. En `auth.ts`, comentar el CognitoProvider
2. Seguir usando `GoogleSigninButton` original
3. El backend sigue aceptando tokens "futbolify-google-auth"

## Una vez que funcione

Cuando todo esté verificado, puedes:

1. Remover `generateGoogleUserToken` del backend
2. Remover la lógica de "futbolify-google-auth" del `jwt-auth.strategy.ts`
3. Remover `GoogleSigninButton` original
4. Remover `@react-oauth/google` del package.json (opcional)
