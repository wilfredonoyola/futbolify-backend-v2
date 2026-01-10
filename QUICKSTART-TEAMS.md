# 🚀 Quick Start - Teams Module

## ⚡ Inicio Rápido en 3 Pasos

### 1️⃣ Verificar Variables de Entorno

Asegúrate de tener un archivo `.env` en la raíz con:

```env
MONGODB_URI=mongodb://localhost:27017/futbolify
JWT_SECRET=tu-secreto-jwt-aqui
PORT=3000
```

### 2️⃣ Iniciar el Servidor

```bash
npm run start:dev
```

Deberías ver:
```
[Nest] LOG [NestFactory] Starting Nest application...
[Nest] LOG [InstanceLoader] TeamsModule dependencies initialized
[Nest] LOG [NestApplication] Nest application successfully started
```

### 3️⃣ Abrir GraphQL Playground

Navega a: **http://localhost:3000/graphql**

---

## 🧪 Probar el API (Copy & Paste)

### Paso 1: Login (Obtener Token)

```graphql
mutation {
  signin(userInput: {
    email: "tu-email@example.com"
    password: "tu-password"
  }) {
    access_token
  }
}
```

**Copia el `access_token`** y agrégalo en HTTP HEADERS:

```json
{
  "Authorization": "Bearer TU_TOKEN_AQUI"
}
```

### Paso 2: Crear un Equipo

```graphql
mutation {
  createTeam(input: {
    name: "Los Cracks FC"
    color: GREEN
  }) {
    id
    name
    code
  }
}
```

**Guarda el `code`** (ej: "ABC123")

### Paso 3: Ver tus Equipos

```graphql
query {
  myTeams {
    id
    name
    code
    color
    matchCount
    mediaCount
    memberCount
  }
}
```

### Paso 4: Unirse con Código (otro usuario)

```graphql
mutation {
  joinTeam(code: "ABC123") {
    id
    name
  }
}
```

### Paso 5: Crear un Partido

```graphql
mutation {
  createMatch(input: {
    teamId: "ID_DEL_EQUIPO"
    date: "2024-01-20T18:00:00Z"
    opponent: "Los Tigres"
    location: "Estadio Municipal"
  }) {
    id
    date
    opponent
  }
}
```

### Paso 6: Subir Media

```graphql
mutation {
  uploadMedia(input: {
    matchId: "ID_DEL_PARTIDO"
    type: VIDEO
    url: "https://example.com/video.mp4"
    category: GOAL
    duration: 15.5
  }) {
    id
    url
    type
  }
}
```

---

## 📊 Verificar Estadísticas

```graphql
query {
  profileStats {
    goalCount
    videoCount
    photoCount
  }
}
```

---

## 🔍 Explorar el Schema

En GraphQL Playground, haz clic en **"DOCS"** o **"SCHEMA"** en la esquina derecha para ver:

- Todos los tipos disponibles
- Queries completas
- Mutations completas
- Inputs y enums

---

## ❌ Troubleshooting

### Error: "EPERM: operation not permitted"
- Verifica permisos del archivo `.env`
- Ejecuta: `chmod 644 .env`

### Error: "MongoServerError: Authentication failed"
- Verifica la URI de MongoDB en `.env`
- Asegúrate de que MongoDB esté corriendo

### Error: "Unauthorized" / "No autenticado"
- Verifica que incluiste el token en HTTP HEADERS
- El token debe tener el prefijo "Bearer "

### Error: "Team not found"
- Verifica que el código es correcto (case-sensitive)
- Verifica que eres miembro del equipo

---

## 📚 Más Información

- **Ejemplos completos**: Ver `TEAMS-API-EXAMPLES.md`
- **Documentación técnica**: Ver `src/teams/README.md`
- **Resumen del feature**: Ver `TEAMS-FEATURE-SUMMARY.md`

---

## 🎯 Casos de Uso Comunes

### Flujo: Crear equipo y subir contenido
1. Login → Obtener token
2. CreateTeam → Guardar ID y código
3. CreateMatch → Guardar ID
4. UploadMedia → Subir fotos/videos
5. TagUsersInMedia → Etiquetar jugadores

### Flujo: Unirse a equipo existente
1. Login → Obtener token
2. JoinTeam(code) → Unirse con código
3. TeamMatches → Ver partidos
4. MatchMedia → Ver fotos/videos

### Flujo: Gestionar equipo (Admin)
1. UpdateTeam → Cambiar nombre/color
2. TeamMembers → Ver miembros
3. UpdateMemberRole → Promover a admin
4. RemoveTeamMember → Eliminar miembro

---

## 🌟 Tips

1. **HTTP HEADERS**: No olvides el token en cada request
2. **IDs**: Todos los IDs se devuelven como strings
3. **Dates**: Usar formato ISO 8601 (YYYY-MM-DDTHH:mm:ssZ)
4. **Enums**: Usar valores exactos: GREEN, BLUE, ADMIN, MEMBER, etc.
5. **Playground**: Usa autocompletado con Ctrl+Space

---

## 🚀 ¡Listo para Empezar!

El backend está completo y funcional. Solo necesitas:
1. ✅ Variables de entorno configuradas
2. ✅ MongoDB corriendo
3. ✅ Servidor iniciado
4. ✅ Token de autenticación

**¡Empieza a probar el API en GraphQL Playground!** 🎉

