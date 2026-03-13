# Sistema de Notificaciones Inteligentes - Futbolify World Cup 2026

## Resumen Ejecutivo

Sistema de notificaciones multi-canal para la aplicación de quinielas del Mundial 2026. Permite enviar notificaciones personalizadas a usuarios a través de múltiples canales (Push, Telegram, Email, In-App) con preferencias configurables por tipo de notificación.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                    NOTIFICATION DISPATCHER                       │
│  NotificationDispatcherService.dispatch()                        │
│                                                                  │
│  1. Verifica preferencias del usuario                           │
│  2. Guarda en MongoDB (SmartNotification)                       │
│  3. Publica a GraphQL Subscription (real-time)                  │
│  4. Encola en Bull Queue (delivery async)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│  Push Worker   │   │ Telegram Worker│   │  Email Worker  │
├────────────────┤   ├────────────────┤   ├────────────────┤
│ Firebase FCM   │   │ Telegraf Bot   │   │ AWS SES        │
│ • Web (PWA)    │   │ • Chat message │   │ • HTML emails  │
│ • Mobile       │   │ • Inline KB    │   │ • Daily digest │
└────────────────┘   └────────────────┘   └────────────────┘
```

---

## Estado de Implementación

### Backend (NestJS) ✅ Completado

| Componente | Archivo | Estado | Descripción |
|------------|---------|--------|-------------|
| **Schemas** | | | |
| NotificationPreferences | `schemas/notification-preferences.schema.ts` | ✅ | Preferencias por canal y tipo |
| SmartNotification | `schemas/smart-notification.schema.ts` | ✅ | Notificaciones con contexto |
| **Services** | | | |
| NotificationDispatcher | `notification-dispatcher.service.ts` | ✅ | Core dispatcher |
| **Workers** | | | |
| PushWorker | `workers/push.worker.ts` | ✅ | Firebase FCM |
| TelegramWorker | `workers/telegram.worker.ts` | ✅ | Telegraf bot |
| EmailWorker | `workers/email.worker.ts` | ✅ | AWS SES |
| **Jobs** | | | |
| SmartNotificationJobs | `jobs/smart-notification.jobs.ts` | ✅ | Cron jobs + processMatchResult |
| **GraphQL** | | | |
| SmartNotificationsResolver | `smart-notifications.resolver.ts` | ✅ | Queries, Mutations, Subscription |
| **Queue** | | | |
| NotificationQueuesModule | `queues/notification-queues.module.ts` | ✅ | Bull + Redis config |

### Frontend (Next.js) ✅ Completado

| Componente | Archivo | Estado | Descripción |
|------------|---------|--------|-------------|
| **Pages** | | | |
| Activity Page | `app/[locale]/(secured)/notifications/page.tsx` | ✅ | Lista con filtros |
| Settings Page | `app/[locale]/(secured)/settings/page.tsx` | ✅ | Notification preferences UI |
| **Components** | | | |
| NotificationBell | `components/Notifications/NotificationBell.tsx` | ✅ | Popover en header |
| NotificationToastProvider | `components/Notifications/NotificationToastProvider.tsx` | ✅ | Real-time toasts |
| NavBar Badge | `components/NavBar/NavBarMobileMenu.tsx` | ✅ | Badge en mobile nav |
| **GraphQL** | | | |
| Queries | `graphql/futbolify/queries/SmartNotificationQueries.graphql` | ✅ | smartNotifications, smartUnreadCount |
| Mutations | `graphql/futbolify/mutations/SmartNotificationMutations.graphql` | ✅ | markAsRead, updatePreferences |
| Subscriptions | `graphql/futbolify/subscriptions/NotificationSubscriptions.graphql` | ✅ | onNotificationReceived |

---

## Tipos de Notificaciones

| Tipo | Trigger | Canales Default | Descripción |
|------|---------|-----------------|-------------|
| `MORNING_BRIEFING` | Cron 8:00 AM | Push, Telegram, In-App | Partidos del día |
| `PRE_MATCH_REMINDER` | 2h antes del partido | Push, Telegram, In-App | Recordatorio para predecir |
| `POST_MATCH_RESULT` | Fin de partido | Push, In-App | Resultado + puntos ganados |
| `PREDICTION_DEADLINE` | 30min antes | Push, Telegram, In-App | Última oportunidad |
| `RANKING_UPDATE` | Cambio de posición | Push, In-App | Subiste/bajaste en ranking |
| `AI_INSIGHT` | Generado por AI | Telegram, In-App | Tip de predicción |
| `AI_VS_YOU_UPDATE` | Post-partido | In-App | Score AI vs Usuario |
| `LIVE_GOAL` | Gol en vivo | Push | Alerta de gol (futuro) |
| `QUINIELA_INVITE` | Invitación | Push, In-App | Te invitaron a quiniela |
| `FRIEND_JOINED` | Amigo se une | In-App | Amigo en tu quiniela |
| `ACHIEVEMENT` | Logro desbloqueado | Push, In-App | Badge/logro ganado |

---

## Cron Jobs Configurados

| Job | Schedule | Descripción |
|-----|----------|-------------|
| `sendMorningBriefing` | `0 8 * * *` (8:00 AM) | Envía resumen de partidos del día |
| `sendPreMatchReminders` | `*/30 * * * *` (cada 30 min) | Busca partidos en 90-150 min |
| `sendPredictionDeadlineReminders` | `*/15 * * * *` (cada 15 min) | Busca partidos en 25-35 min |

---

## API GraphQL

### Queries

```graphql
# Obtener notificaciones del usuario
query GetSmartNotifications($limit: Int) {
  smartNotifications(limit: $limit) {
    id
    type
    title
    message
    isRead
    createdAt
    matchContext { homeTeamCode, awayTeamCode, homeScore, awayScore }
    quinielaContext { quinielaName, userRank }
    aiContext { aiPrediction, aiConfidence }
  }
}

# Contador de no leídas
query GetSmartUnreadCount {
  smartUnreadCount
}

# Preferencias del usuario
query GetNotificationPreferences {
  notificationPreferences {
    globalEnabled
    push { enabled }
    telegram { enabled }
    email { enabled, frequency }
    morningBriefing { push, telegram, email, inApp }
    # ... otros tipos
  }
}
```

### Mutations

```graphql
# Marcar como leída
mutation MarkSmartNotificationAsRead($notificationId: ID!) {
  markSmartNotificationAsRead(notificationId: $notificationId) {
    id
    isRead
  }
}

# Marcar todas como leídas
mutation MarkAllSmartNotificationsAsRead {
  markAllSmartNotificationsAsRead
}

# Actualizar preferencias
mutation UpdateNotificationPreferences($input: UpdateNotificationPreferencesInput!) {
  updateNotificationPreferences(input: $input) {
    id
    globalEnabled
  }
}

# Procesar resultado de partido (Admin)
mutation ProcessMatchResult($matchId: String!, $homeScore: Int!, $awayScore: Int!) {
  processMatchResult(matchId: $matchId, homeScore: $homeScore, awayScore: $awayScore) {
    success
    processed
    notifications
    error
  }
}
```

### Subscription

```graphql
# Real-time notifications
subscription OnNotificationReceived {
  notificationReceived {
    id
    type
    title
    message
    actionUrl
    matchContext { ... }
  }
}
```

---

## Configuración de Ambiente

### Variables de Entorno Requeridas

```env
# Redis (requerido para Bull Queue)
REDIS_URL=redis://localhost:6379
# O usar configuración individual:
# REDIS_HOST=localhost
# REDIS_PORT=6379
# REDIS_PASSWORD=

# Firebase Cloud Messaging (para push notifications)
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"...","private_key":"..."}

# Telegram Bot (ya configurado)
TELEGRAM_BOT_TOKEN=your-bot-token

# AWS SES (ya configurado)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
SES_FROM_EMAIL=noreply@futbolify.com
```

---

## Lo Que Falta Por Implementar

### Backend

| Item | Prioridad | Descripción |
|------|-----------|-------------|
| `fcmTokens` en User schema | Alta | Campo para guardar tokens de push |
| Webhook para resultados externos | Media | Recibir resultados de API externa (ej: SofaScore) |
| Email templates HTML | Media | Diseño de emails con branding |
| Quiet hours timezone-aware | Baja | Respetar horas de silencio por timezone |
| Notification analytics | Baja | Tracking de open rates, click rates |
| Rate limiting | Media | Evitar spam de notificaciones |
| Batch digest emails | Baja | Email semanal con resumen |

### Frontend

| Item | Prioridad | Descripción |
|------|-----------|-------------|
| Push notification permission | Alta | Solicitar permiso del navegador |
| FCM token registration | Alta | Enviar token al backend |
| Service Worker para push | Alta | Recibir push en background |
| Timezone selector en settings | Baja | Permitir cambiar timezone |
| Notification sounds | Baja | Sonidos para diferentes tipos |
| Empty states mejorados | Baja | Ilustraciones para estados vacíos |

### Integraciones

| Item | Prioridad | Descripción |
|------|-----------|-------------|
| Flutter FCM setup | Alta | Push notifications en app móvil |
| Telegram bot linking | Media | Flow para vincular cuenta con Telegram |
| Slack integration | Baja | Notificaciones a canales de Slack |

---

## Justificación de la Implementación

### ¿Por qué este sistema?

1. **Engagement del Usuario**
   - Las quinielas requieren que los usuarios hagan predicciones antes de cada partido
   - Sin recordatorios, los usuarios olvidan predecir y pierden interés
   - Las notificaciones de resultados mantienen el engagement post-partido

2. **Multi-Canal**
   - No todos los usuarios usan la app constantemente
   - Telegram permite llegar a usuarios que prefieren bots
   - Email sirve para resúmenes y usuarios menos activos
   - Push es el canal más inmediato para recordatorios urgentes

3. **Personalización**
   - Cada usuario tiene preferencias diferentes
   - Algunos quieren todas las notificaciones, otros solo las importantes
   - Permitir configuración granular reduce unsubscribes

4. **Escalabilidad**
   - Bull Queue permite procesar miles de notificaciones sin bloquear la app
   - Workers separados permiten escalar cada canal independientemente
   - Redis garantiza que no se pierdan notificaciones

5. **Real-Time**
   - GraphQL Subscriptions permiten actualizar la UI sin polling
   - Toasts dan feedback inmediato al usuario
   - Mejor UX que esperar a que el usuario refresque

### Decisiones Técnicas

| Decisión | Alternativas Consideradas | Justificación |
|----------|---------------------------|---------------|
| Bull Queue | Agenda, AWS SQS | Bull es simple, bien integrado con NestJS, Redis es rápido |
| GraphQL Subscriptions | WebSockets raw, Socket.io | Ya usamos GraphQL, subscriptions son nativas |
| MongoDB para notificaciones | PostgreSQL, Redis | Consistente con el resto del stack, flexible para contextos |
| Firebase FCM | OneSignal, Pusher | FCM es gratis, soporta web y móvil, bien documentado |

---

## Plan de Testing

### 1. Testing Backend (Unit)

```bash
# Crear archivo de test
# src/notifications/__tests__/notification-dispatcher.service.spec.ts

npm run test -- --testPathPattern=notification
```

**Casos a probar:**
- [ ] `dispatch()` crea notificación en DB
- [ ] `dispatch()` respeta preferencias del usuario
- [ ] `dispatch()` no envía si globalEnabled=false
- [ ] `dispatchBatch()` envía a múltiples usuarios
- [ ] `getOrCreatePreferences()` crea defaults si no existen
- [ ] `markAsRead()` actualiza isRead y readAt
- [ ] `processMatchResult()` calcula puntos correctamente

### 2. Testing Backend (Integration)

```bash
# Levantar Redis local
docker run -d -p 6379:6379 redis

# Correr app en modo dev
npm run start:dev
```

**Probar manualmente:**

```graphql
# 1. Crear preferencias
mutation {
  updateNotificationPreferences(input: {
    globalEnabled: true
    push: { enabled: true }
  }) {
    id
  }
}

# 2. Verificar que se crearon
query {
  notificationPreferences {
    globalEnabled
    push { enabled }
  }
}

# 3. Disparar notificación de test (crear endpoint temporal)
# O esperar al cron de morning briefing
```

### 3. Testing Frontend (Manual)

**Activity Page (`/notifications`):**
- [ ] Carga lista de notificaciones
- [ ] Filtros funcionan (Todo, Sin leer, Partidos, AI, Social)
- [ ] Click marca como leída
- [ ] "Marcar todo leído" funciona
- [ ] Link a Settings visible

**NotificationBell (Header):**
- [ ] Muestra badge con conteo
- [ ] Popover muestra últimas 10
- [ ] Click en notificación navega a actionUrl
- [ ] "Ver todas" navega a /notifications

**NavBar Badge:**
- [ ] Desktop: badge en item "Activity"
- [ ] Mobile: badge rojo en icono

**Settings Page (`/settings`):**
- [ ] Toggle global funciona
- [ ] Toggles de canales funcionan
- [ ] Toggles por tipo de notificación funcionan
- [ ] Selector de frecuencia de email funciona
- [ ] Indicador de guardado aparece

**Toast Notifications:**
- [ ] Aparece toast cuando llega notificación (requiere subscription activa)
- [ ] Toast tiene botón "Ver" que navega

### 4. Testing E2E

```bash
# Simular flujo completo

# 1. Usuario se une a quiniela
# 2. Usuario hace predicción para partido
# 3. Admin procesa resultado:
mutation {
  processMatchResult(
    matchId: "match-1"
    homeScore: 2
    awayScore: 1
  ) {
    success
    processed
    notifications
  }
}

# 4. Verificar que usuario recibió:
#    - Notificación de resultado
#    - Notificación de cambio de ranking (si aplica)
#    - Toast en tiempo real (si está conectado)
```

### 5. Testing de Cron Jobs

```bash
# Opción 1: Cambiar horario temporalmente
# En smart-notification.jobs.ts, cambiar:
# @Cron('0 8 * * *') → @Cron('*/1 * * * *') (cada minuto)

# Opción 2: Llamar método directamente
# Crear endpoint temporal o usar NestJS REPL
```

### 6. Testing de Workers

```bash
# Ver logs de Bull Queue
# En Redis CLI:
redis-cli
> KEYS bull:*
> LRANGE bull:notification-push:wait 0 -1
```

### 7. Checklist Pre-Producción

- [ ] Redis configurado y accesible
- [ ] Firebase project creado y service account configurado
- [ ] Variables de entorno en producción
- [ ] Telegram bot token válido
- [ ] AWS SES verificado para envío de emails
- [ ] Cron jobs verificados con timezone correcto
- [ ] Logs configurados para monitoreo
- [ ] Alertas configuradas para fallos de workers

---

## Archivos Modificados/Creados

### Backend

```
src/notifications/
├── schemas/
│   ├── notification-preferences.schema.ts  # NUEVO
│   └── smart-notification.schema.ts        # NUEVO
├── queues/
│   └── notification-queues.module.ts       # NUEVO
├── workers/
│   ├── push.worker.ts                      # NUEVO
│   ├── telegram.worker.ts                  # NUEVO
│   └── email.worker.ts                     # NUEVO
├── jobs/
│   └── smart-notification.jobs.ts          # NUEVO
├── notification-dispatcher.service.ts      # NUEVO
├── smart-notifications.resolver.ts         # NUEVO
├── notifications.module.ts                 # MODIFICADO
└── NOTIFICATIONS-SYSTEM.md                 # NUEVO (este archivo)

package.json                                # MODIFICADO (deps)
```

### Frontend

```
app/[locale]/(secured)/
├── notifications/page.tsx                  # MODIFICADO
├── settings/page.tsx                       # MODIFICADO
└── layout.tsx                              # MODIFICADO

components/
├── Notifications/
│   ├── NotificationBell.tsx                # MODIFICADO
│   └── NotificationToastProvider.tsx       # NUEVO
└── NavBar/
    └── NavBarMobileMenu/NavBarMobileMenu.tsx # MODIFICADO

graphql/futbolify/
├── queries/SmartNotificationQueries.graphql    # NUEVO
├── mutations/SmartNotificationMutations.graphql # NUEVO
└── subscriptions/NotificationSubscriptions.graphql # NUEVO

config/app-routes/
├── app-routes.ts                           # MODIFICADO
└── app-routes.types.ts                     # MODIFICADO
```

---

## Contacto

Para dudas sobre este sistema, contactar al equipo de desarrollo.

**Última actualización:** Marzo 2026
