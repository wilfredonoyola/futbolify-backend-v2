# Futbolify Teams API - Ejemplos de Uso

## 🚀 Guía Rápida de Testing

Este documento contiene ejemplos listos para usar en GraphQL Playground.

---

## 📝 TEAMS - Equipos

### 1. Crear un Equipo
```graphql
mutation CreateTeam {
  createTeam(input: {
    name: "Los Cracks FC"
    color: GREEN
  }) {
    id
    name
    color
    code
    createdBy
    createdAt
    matchCount
    mediaCount
    memberCount
  }
}
```

**Response esperado:**
```json
{
  "data": {
    "createTeam": {
      "id": "64f1234567890abcdef12345",
      "name": "Los Cracks FC",
      "color": "GREEN",
      "code": "ABC123",
      "createdBy": "64f...",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "matchCount": 0,
      "mediaCount": 0,
      "memberCount": 1
    }
  }
}
```

### 2. Obtener Mis Equipos
```graphql
query MyTeams {
  myTeams {
    id
    name
    color
    code
    matchCount
    mediaCount
    memberCount
    createdAt
  }
}
```

### 3. Buscar Equipo por Código
```graphql
query FindTeam {
  teamByCode(code: "ABC123") {
    id
    name
    color
    code
    createdBy
  }
}
```

### 4. Obtener Detalles de Equipo con Miembros
```graphql
query TeamDetails {
  team(id: "64f1234567890abcdef12345") {
    id
    name
    color
    code
    matchCount
    mediaCount
    memberCount
    members {
      id
      role
      joinedAt
      user {
        userId
        email
        userName
        avatarUrl
      }
    }
  }
}
```

### 5. Actualizar Equipo (Solo ADMIN)
```graphql
mutation UpdateTeam {
  updateTeam(
    id: "64f1234567890abcdef12345"
    input: {
      name: "Los Super Cracks FC"
      color: BLUE
    }
  ) {
    id
    name
    color
  }
}
```

### 6. Eliminar Equipo (Solo ADMIN)
```graphql
mutation DeleteTeam {
  deleteTeam(id: "64f1234567890abcdef12345")
}
```

---

## 👥 MEMBERS - Miembros

### 7. Unirse a un Equipo
```graphql
mutation JoinTeam {
  joinTeam(code: "ABC123") {
    id
    name
    color
    memberCount
  }
}
```

### 8. Obtener Miembros del Equipo
```graphql
query TeamMembers {
  teamMembers(teamId: "64f1234567890abcdef12345") {
    id
    role
    joinedAt
    userId
  }
}
```

### 9. Cambiar Rol de Miembro (Solo ADMIN)
```graphql
mutation UpdateRole {
  updateMemberRole(
    teamId: "64f1234567890abcdef12345"
    userId: "64f9876543210abcdef98765"
    role: "ADMIN"
  ) {
    id
    role
    userId
  }
}
```

### 10. Eliminar Miembro (Solo ADMIN)
```graphql
mutation RemoveMember {
  removeTeamMember(
    teamId: "64f1234567890abcdef12345"
    userId: "64f9876543210abcdef98765"
  )
}
```

### 11. Salir del Equipo
```graphql
mutation LeaveTeam {
  leaveTeam(teamId: "64f1234567890abcdef12345")
}
```

---

## ⚽ MATCHES - Partidos

### 12. Crear Partido (Cualquier miembro)
```graphql
mutation CreateMatch {
  createMatch(input: {
    teamId: "64f1234567890abcdef12345"
    date: "2024-01-20T18:00:00Z"
    opponent: "Los Tigres"
    location: "Estadio Municipal"
  }) {
    id
    date
    opponent
    location
    photoCount
    videoCount
    highlightCount
  }
}
```

### 13. Obtener Partidos del Equipo
```graphql
query TeamMatches {
  teamMatches(teamId: "64f1234567890abcdef12345") {
    id
    date
    opponent
    location
    photoCount
    videoCount
    highlightCount
    createdAt
  }
}
```

### 14. Obtener Detalles de un Partido
```graphql
query MatchDetails {
  teamMatch(id: "64f5555567890abcdef55555") {
    id
    date
    opponent
    location
    photoCount
    videoCount
    highlightCount
    createdBy
  }
}
```

### 15. Actualizar Partido (Solo ADMIN)
```graphql
mutation UpdateMatch {
  updateMatch(
    id: "64f5555567890abcdef55555"
    input: {
      opponent: "Los Leones"
      location: "Cancha Nueva"
    }
  ) {
    id
    opponent
    location
  }
}
```

### 16. Eliminar Partido (Solo ADMIN)
```graphql
mutation DeleteMatch {
  deleteMatch(id: "64f5555567890abcdef55555")
}
```

---

## 📸 MEDIA - Fotos y Videos

### 17. Subir Media (Foto)
```graphql
mutation UploadPhoto {
  uploadMedia(input: {
    matchId: "64f5555567890abcdef55555"
    type: PHOTO
    url: "https://storage.example.com/photos/goal-celebration.jpg"
    category: GOAL
    isHighlight: true
  }) {
    id
    type
    url
    category
    isHighlight
    createdAt
  }
}
```

### 18. Subir Media (Video)
```graphql
mutation UploadVideo {
  uploadMedia(input: {
    matchId: "64f5555567890abcdef55555"
    type: VIDEO
    url: "https://storage.example.com/videos/amazing-goal.mp4"
    thumbnailUrl: "https://storage.example.com/thumbs/amazing-goal.jpg"
    category: GOAL
    duration: 15.5
    isHighlight: false
  }) {
    id
    type
    url
    thumbnailUrl
    category
    duration
    isHighlight
  }
}
```

### 19. Subir Múltiples Medios
```graphql
mutation BatchUpload {
  batchUploadMedia(inputs: [
    {
      matchId: "64f5555567890abcdef55555"
      type: PHOTO
      url: "https://storage.example.com/photo1.jpg"
      category: PLAY
    },
    {
      matchId: "64f5555567890abcdef55555"
      type: PHOTO
      url: "https://storage.example.com/photo2.jpg"
      category: FAIL
    },
    {
      matchId: "64f5555567890abcdef55555"
      type: VIDEO
      url: "https://storage.example.com/video1.mp4"
      category: GOAL
      duration: 12.3
    }
  ]) {
    id
    type
    url
    category
  }
}
```

### 20. Obtener Media de un Partido
```graphql
query MatchMedia {
  matchMedia(matchId: "64f5555567890abcdef55555") {
    id
    type
    url
    thumbnailUrl
    category
    isHighlight
    duration
    createdAt
  }
}
```

### 21. Obtener Media con Filtros
```graphql
query MatchMediaFiltered {
  matchMedia(
    matchId: "64f5555567890abcdef55555"
    filters: {
      type: VIDEO
      category: GOAL
      isHighlight: true
    }
  ) {
    id
    url
    category
    duration
  }
}
```

### 22. Obtener Detalles de Media
```graphql
query MediaDetails {
  media(id: "64f7777767890abcdef77777") {
    id
    type
    url
    thumbnailUrl
    category
    isHighlight
    duration
    uploadedBy
    matchId
    createdAt
  }
}
```

### 23. Actualizar Media (Solo uploader o ADMIN)
```graphql
mutation UpdateMedia {
  updateMedia(
    id: "64f7777767890abcdef77777"
    input: {
      category: PLAY
      isHighlight: true
    }
  ) {
    id
    category
    isHighlight
  }
}
```

### 24. Toggle Destacado
```graphql
mutation ToggleHighlight {
  toggleHighlight(mediaId: "64f7777767890abcdef77777") {
    id
    isHighlight
  }
}
```

### 25. Eliminar Media (Solo uploader o ADMIN)
```graphql
mutation DeleteMedia {
  deleteMedia(id: "64f7777767890abcdef77777")
}
```

---

## 🏷️ TAGS - Etiquetas

### 26. Etiquetar Usuarios en Media
```graphql
mutation TagUsers {
  tagUsersInMedia(
    mediaId: "64f7777767890abcdef77777"
    userIds: [
      "64f1111111111111111111111",
      "64f2222222222222222222222",
      "64f3333333333333333333333"
    ]
  )
}
```

### 27. Auto-etiquetarse
```graphql
mutation SelfTag {
  selfTagMedia(mediaId: "64f7777767890abcdef77777")
}
```

### 28. Quitar Etiqueta
```graphql
mutation RemoveTag {
  removeMediaTag(
    mediaId: "64f7777767890abcdef77777"
    userId: "64f1111111111111111111111"
  )
}
```

### 29. Obtener Media donde Estoy Etiquetado
```graphql
query MyTaggedMedia {
  myTaggedMedia {
    id
    type
    url
    category
    isHighlight
    matchId
    createdAt
  }
}
```

### 30. Obtener Solo Videos donde Estoy Etiquetado
```graphql
query MyTaggedVideos {
  myTaggedMedia(type: VIDEO) {
    id
    url
    category
    duration
    matchId
  }
}
```

---

## 📊 STATS - Estadísticas

### 31. Obtener Mis Estadísticas
```graphql
query MyStats {
  profileStats {
    goalCount
    videoCount
    photoCount
  }
}
```

### 32. Obtener Estadísticas de Otro Usuario
```graphql
query UserStats {
  profileStats(userId: "64f9999999999999999999999") {
    goalCount
    videoCount
    photoCount
  }
}
```

---

## 🔄 FLUJO COMPLETO DE EJEMPLO

### Paso 1: Usuario A crea equipo
```graphql
mutation {
  createTeam(input: { name: "Los Cracks FC", color: GREEN }) {
    id
    code  # Guarda este código
  }
}
```

### Paso 2: Usuario B se une con código
```graphql
mutation {
  joinTeam(code: "ABC123") {
    id
    name
  }
}
```

### Paso 3: Usuario A crea un partido
```graphql
mutation {
  createMatch(input: {
    teamId: "TEAM_ID_AQUI"
    date: "2024-01-20T18:00:00Z"
    opponent: "Los Tigres"
  }) {
    id  # Guarda este ID
  }
}
```

### Paso 4: Usuario B sube un video de gol
```graphql
mutation {
  uploadMedia(input: {
    matchId: "MATCH_ID_AQUI"
    type: VIDEO
    url: "https://storage.example.com/videos/gol.mp4"
    category: GOAL
    duration: 10.5
  }) {
    id  # Guarda este ID
  }
}
```

### Paso 5: Usuario A etiqueta a Usuario B
```graphql
mutation {
  tagUsersInMedia(
    mediaId: "MEDIA_ID_AQUI"
    userIds: ["USER_B_ID"]
  )
}
```

### Paso 6: Usuario B ve sus estadísticas
```graphql
query {
  profileStats {
    goalCount  # 1
    videoCount # 1
    photoCount # 0
  }
}
```

---

## 🛡️ Validaciones Importantes

### ✅ Casos de Éxito
- Miembro puede subir media
- Admin puede eliminar cualquier media
- Uploader puede eliminar su propio media
- Cualquier miembro puede etiquetar
- Usuario etiquetado puede quitarse la etiqueta

### ❌ Casos de Error
- No puedes ver equipos donde no eres miembro
- Solo admin puede eliminar miembros
- No puedes eliminar el último admin
- El último admin no puede salir del equipo
- Solo uploader o admin pueden eliminar media
- Solo quien etiquetó o el etiquetado pueden quitar tags

---

## 🎯 Testing Checklist

- [ ] Crear equipo → Verificar código único
- [ ] Unirse con código → Verificar membresía
- [ ] Crear partido → Verificar permisos
- [ ] Subir media → Verificar URL
- [ ] Etiquetar usuarios → Verificar tags
- [ ] Obtener estadísticas → Verificar conteos
- [ ] Intentar acciones sin permisos → Verificar errores
- [ ] Eliminar equipo → Verificar cascada

---

## 🔗 Headers Requeridos

Para todas las requests (excepto login/signup), necesitas incluir el token JWT:

```json
{
  "Authorization": "Bearer YOUR_JWT_TOKEN_HERE"
}
```

El token se obtiene del login/signup y debe incluirse en el header de cada request GraphQL.

---

## 📝 Notas de Implementación

1. **Storage First:** El frontend debe subir archivos a storage (Supabase/Cloudinary/S3) primero y luego pasar la URL al mutation `uploadMedia`

2. **IDs en GraphQL:** Todos los IDs se devuelven como strings aunque en MongoDB sean ObjectIds

3. **Timestamps:** Todos los timestamps están en formato ISO 8601 (UTC)

4. **Enums disponibles:**
   - TeamColor: GREEN, BLUE, RED, YELLOW, PURPLE, ORANGE, PINK, BLACK, WHITE
   - MemberRole: ADMIN, MEMBER
   - MediaType: PHOTO, VIDEO
   - MediaCategory: GOAL, PLAY, FAIL

5. **Playground:** Disponible en `http://localhost:3000/graphql` (modo desarrollo)

