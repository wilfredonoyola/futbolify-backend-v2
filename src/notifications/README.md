# Smart Notifications System (Phase 7)

## Overview

Sistema de notificaciones inteligentes multi-canal para Futbolify World Cup 2026.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                    NOTIFICATION DISPATCHER                       │
│  NotificationDispatcherService.dispatch()                        │
│                                                                  │
│  1. Verifica preferencias del usuario                           │
│  2. Guarda en MongoDB                                           │
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
│ • Flutter      │   │ • Inline KB    │   │ • Daily digest │
└────────────────┘   └────────────────┘   └────────────────┘
```

## Environment Variables

Add these to your `.env` file:

```env
# Redis (required for Bull Queue)
REDIS_URL=redis://localhost:6379
# Or use individual settings:
# REDIS_HOST=localhost
# REDIS_PORT=6379
# REDIS_PASSWORD=

# Firebase (for push notifications)
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}

# Telegram (already configured)
TELEGRAM_BOT_TOKEN=your-bot-token

# AWS SES (already configured)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
SES_FROM_EMAIL=noreply@futbolify.com
```

## Tipos de Notificaciones

| Tipo | Trigger | Descripción |
|------|---------|-------------|
| `MORNING_BRIEFING` | Cron 8am | Partidos del día |
| `PRE_MATCH_REMINDER` | 2h antes | Recordatorio para predecir |
| `POST_MATCH_RESULT` | Fin partido | Resultado + puntos |
| `RANKING_UPDATE` | Evento | Alguien te superó |
| `PREDICTION_DEADLINE` | 30min antes | Última oportunidad |
| `AI_INSIGHT` | Evento | Tip de predicción AI |
| `AI_VS_YOU_UPDATE` | Post-match | Score AI vs Usuario |

## Uso desde otros servicios

```typescript
import { NotificationDispatcherService } from './notifications/notification-dispatcher.service'
import { SmartNotificationType } from './notifications/schemas/notification-preferences.schema'

@Injectable()
export class SomeService {
  constructor(
    private readonly dispatcher: NotificationDispatcherService,
  ) {}

  async someMethod() {
    // Enviar notificación a un usuario
    await this.dispatcher.dispatch({
      userId: 'user-id',
      type: SmartNotificationType.PRE_MATCH_REMINDER,
      title: 'México vs Argentina en 2 horas!',
      message: '¿Ya hiciste tu predicción?',
      actionUrl: '/quiniela',
      matchContext: {
        matchId: 'match-123',
        homeTeamCode: 'MEX',
        awayTeamCode: 'ARG',
        homeTeamName: 'México',
        awayTeamName: 'Argentina',
        matchDateUTC: new Date(),
      },
    })

    // Enviar a múltiples usuarios
    await this.dispatcher.dispatchBatch({
      userIds: ['user-1', 'user-2', 'user-3'],
      type: SmartNotificationType.MORNING_BRIEFING,
      title: 'Buenos días! Hoy hay 3 partidos',
      message: '...',
      actionUrl: '/quiniela',
    })
  }
}
```

## GraphQL API

### Queries

```graphql
# Get notifications
query {
  smartNotifications(limit: 50) {
    id
    type
    title
    message
    isRead
    createdAt
    matchContext {
      homeTeamCode
      awayTeamCode
      homeScore
      awayScore
    }
  }
}

# Get unread count
query {
  smartUnreadCount
}

# Get preferences
query {
  notificationPreferences {
    globalEnabled
    push { enabled }
    telegram { enabled }
    email { enabled frequency }
    morningBriefing { push telegram email inApp }
    favoriteTeams
    timezone
  }
}
```

### Mutations

```graphql
# Mark as read
mutation {
  markSmartNotificationAsRead(notificationId: "...") {
    id
    isRead
  }
}

# Update preferences
mutation {
  updateNotificationPreferences(input: {
    push: { enabled: true }
    telegram: { enabled: true }
    morningBriefing: { push: true, telegram: true, email: false, inApp: true }
    favoriteTeams: ["MEX", "ARG"]
    timezone: "America/Mexico_City"
  }) {
    id
  }
}

# Add favorite team
mutation {
  addFavoriteTeam(teamCode: "BRA") {
    favoriteTeams
  }
}
```

### Subscription

```graphql
subscription {
  notificationReceived {
    id
    type
    title
    message
    actionUrl
    createdAt
  }
}
```

## Files Structure

```
src/notifications/
├── schemas/
│   ├── notification.schema.ts              # Original (keep)
│   ├── notification-preferences.schema.ts  # NEW - User preferences
│   └── smart-notification.schema.ts        # NEW - Smart notifications
├── queues/
│   └── notification-queues.module.ts       # NEW - Bull queue config
├── workers/
│   ├── push.worker.ts                      # NEW - FCM worker
│   ├── telegram.worker.ts                  # NEW - Telegram worker
│   └── email.worker.ts                     # NEW - SES worker
├── jobs/
│   └── smart-notification.jobs.ts          # NEW - Cron jobs
├── notifications.service.ts                # Original (keep)
├── notifications.resolver.ts               # Original (keep)
├── notification-dispatcher.service.ts      # NEW - Core dispatcher
├── smart-notifications.resolver.ts         # NEW - GraphQL resolver
├── notifications.module.ts                 # UPDATED - Module
└── README.md                               # NEW - This file
```

## TODO

- [ ] Add `fcmTokens` field to User schema
- [ ] Implement timezone-aware quiet hours
- [ ] Connect cron jobs to WorldcupMatch model
- [ ] Add email digest (daily/weekly)
- [ ] Add notification analytics
