# Configuración de Google Sign-In con Cognito (Account Linking)

Esta guía explica cómo configurar Google como Identity Provider en Cognito para que los usuarios puedan:
1. Registrarse con email/password Y con Google
2. Vincular automáticamente ambos métodos de login a la misma cuenta
3. Recibir siempre tokens de Cognito (un solo tipo de token)

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FLUJO ACTUAL (Problemático)                │
├─────────────────────────────────────────────────────────────────────┤
│  Email/Password:  Frontend → Backend → Cognito → Token de Cognito  │
│  Google:          Frontend → Backend → Google → Token PROPIO        │
│                                                                      │
│  Problema: Dos tipos de tokens diferentes                           │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                           FLUJO NUEVO (Correcto)                     │
├─────────────────────────────────────────────────────────────────────┤
│  Email/Password:  Frontend → Backend → Cognito → Token de Cognito  │
│  Google:          Frontend → Cognito → Google → Token de Cognito    │
│                                                                      │
│  Solución: Siempre tokens de Cognito                                │
└─────────────────────────────────────────────────────────────────────┘
```

## Paso 1: Configurar Google como Identity Provider en Cognito

### 1.1 En AWS Console

1. Ve a **Amazon Cognito** → Tu User Pool → **Sign-in experience**
2. En "Federated identity provider sign-in", click **Add identity provider**
3. Selecciona **Google**
4. Ingresa:
   - **Client ID**: Tu Google Client ID (el mismo que ya usas)
   - **Client Secret**: Tu Google Client Secret
   - **Authorized scopes**: `openid email profile`
5. En "Map attributes between Google and your user pool":
   - `email` → `email`
   - `name` → `name`
   - `sub` → `username` (o custom:google_id)
6. Click **Add identity provider**

### 1.2 Configurar App Client

1. Ve a **App integration** → Tu App Client
2. En "Hosted UI", click **Edit**
3. En "Identity providers", marca **Google**
4. Configura las URLs de callback:
   - **Allowed callback URLs**:
     - `https://www.futbolify.com/api/auth/callback/cognito`
     - `http://localhost:3000/api/auth/callback/cognito` (desarrollo)
   - **Allowed sign-out URLs**:
     - `https://www.futbolify.com`
     - `http://localhost:3000`
5. En "OAuth 2.0 grant types", marca:
   - `Authorization code grant`
   - `Implicit grant` (opcional, para tokens directos)
6. En "OpenID Connect scopes", marca:
   - `openid`
   - `email`
   - `profile`

### 1.3 Configurar Dominio de Cognito

1. Ve a **App integration** → **Domain**
2. Crea un dominio de Cognito (ej: `futbolify.auth.us-east-1.amazoncognito.com`)
   - O usa un dominio personalizado si lo prefieres

## Paso 2: Desplegar Lambda Pre-Signup

### 2.1 Construir la Lambda

```bash
cd lambda/cognito-pre-signup
npm install
npm run package
```

### 2.2 Crear la Lambda en AWS

1. Ve a **AWS Lambda** → **Create function**
2. Nombre: `cognito-pre-signup`
3. Runtime: `Node.js 20.x`
4. Sube el archivo `function.zip`

### 2.3 Configurar Permisos

La Lambda necesita estos permisos IAM:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cognito-idp:ListUsers",
        "cognito-idp:AdminLinkProviderForUser",
        "cognito-idp:AdminCreateUser",
        "cognito-idp:AdminSetUserPassword",
        "cognito-idp:AdminUpdateUserAttributes"
      ],
      "Resource": "arn:aws:cognito-idp:*:*:userpool/*"
    }
  ]
}
```

### 2.4 Configurar el Trigger en Cognito

1. Ve a **Cognito** → Tu User Pool → **User pool properties**
2. En "Lambda triggers", click **Add Lambda trigger**
3. Selecciona **Pre sign-up**
4. Asigna tu Lambda `cognito-pre-signup`

## Paso 3: Configurar el Frontend

### 3.1 Variables de Entorno

Agrega estas variables en `.env.local`:

```env
# Cognito OAuth
NEXT_PUBLIC_COGNITO_DOMAIN=futbolify.auth.us-east-1.amazoncognito.com
NEXT_PUBLIC_COGNITO_CLIENT_ID=tu-app-client-id
NEXT_PUBLIC_COGNITO_REDIRECT_URI=http://localhost:3000/api/auth/callback/cognito
```

### 3.2 Flujo de Google Sign-In

El nuevo flujo usa el OAuth de Cognito:

```typescript
// Redirigir a Cognito Hosted UI con Google
const googleSignIn = () => {
  const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
  const redirectUri = encodeURIComponent(process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI)

  const url = `https://${cognitoDomain}/oauth2/authorize?` +
    `identity_provider=Google&` +
    `response_type=code&` +
    `client_id=${clientId}&` +
    `redirect_uri=${redirectUri}&` +
    `scope=openid+email+profile`

  window.location.href = url
}
```

### 3.3 Callback Handler

Crea un endpoint para manejar el callback de Cognito:

```typescript
// app/api/auth/callback/cognito/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')

  if (!code) {
    return NextResponse.redirect('/signin?error=no_code')
  }

  // Intercambiar código por tokens
  const tokenResponse = await fetch(
    `https://${process.env.NEXT_PUBLIC_COGNITO_DOMAIN}/oauth2/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
        code,
        redirect_uri: process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI!,
      }),
    }
  )

  const tokens = await tokenResponse.json()

  // tokens.id_token es un JWT de Cognito
  // tokens.access_token es el token de acceso
  // tokens.refresh_token es para renovar tokens

  // Aquí debes decodificar el id_token para obtener la info del usuario
  // y crear la sesión de NextAuth

  return NextResponse.redirect('/feed')
}
```

## Paso 4: Actualizar el Backend

### 4.1 Simplificar jwt-auth.strategy.ts

Ya no necesitas aceptar tokens "futbolify-google-auth". Solo tokens de Cognito:

```typescript
// jwt-auth.strategy.ts
const cognitoIssuer = `https://cognito-idp.${process.env.AWS_COGNITO_REGION}.amazonaws.com/${process.env.AWS_COGNITO_USER_POOL_ID}`

if (decodedToken.iss !== cognitoIssuer) {
  return this.fail(new UnauthorizedException('Token issuer is invalid'), 401)
}

// No necesitas verificar firma porque Cognito ya lo hizo
```

### 4.2 Remover código innecesario

Puedes remover de `auth.service.ts`:
- `generateGoogleUserToken()` - Ya no se usa
- La lógica de tokens propios en `validateGoogleToken()`

## Flujo Completo

### Usuario nuevo con Google:
1. Click "Sign in with Google"
2. Redirige a Cognito → Google
3. Usuario autoriza
4. Google → Cognito
5. Pre-Signup Lambda: No existe usuario, permite creación
6. Cognito crea usuario y genera tokens
7. Redirige a frontend con tokens

### Usuario existente (email/password) usa Google:
1. Click "Sign in with Google"
2. Redirige a Cognito → Google
3. Usuario autoriza
4. Google → Cognito
5. Pre-Signup Lambda: Encuentra usuario existente, vincula Google
6. Lanza error para prevenir duplicado
7. Usuario debe hacer sign-in de nuevo
8. Ahora puede usar email/password O Google
9. Siempre recibe token de Cognito

## Troubleshooting

### "User already exists, provider has been linked"
Este mensaje aparece la primera vez que vinculas Google a una cuenta existente.
El usuario debe hacer sign-in de nuevo y funcionará.

### Tokens no funcionan en el backend
Verifica que el issuer del token sea de Cognito, no "futbolify-google-auth".

### No se vincula la cuenta
Verifica los logs de la Lambda Pre-Signup en CloudWatch.

## Referencias

- [AWS Docs: Linking federated users](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-identity-federation-consolidate-users.html)
- [AWS Docs: AdminLinkProviderForUser](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminLinkProviderForUser.html)
- [Code Genie: Cognito + Google + SAML](https://codegenie.codes/blog/aws-cognito-user-pools-sign-in-with-email-google-saml-and-link-to-a-single-user/)
