# Telegram Bot - Futbolify Quinielas

## Resumen

Bot de Telegram para crear y participar en quinielas de fútbol sin necesidad de registro (ghost users).

**Bot:** @futbolify_quinielas_bot
**Creado:** 2026-03-12

---

## Arquitectura

```
Usuario Telegram
      │
      ▼
  Telegram API
      │
      ▼ (webhook)
  Digital Ocean API
  https://urchin-app-8ronl.ondigitalocean.app/telegram/webhook
      │
      ▼
  TelegramService (NestJS)
      │
      ├── ensureUser() → Ghost User System
      ├── createQuiniela()
      ├── joinQuiniela()
      └── getUserQuinielas()
```

---

## Variables de Entorno

```bash
# Requeridas
TELEGRAM_BOT_TOKEN=<token_de_botfather>
TELEGRAM_BOT_USERNAME=futbolify_quinielas_bot

# Producción (webhook mode)
TELEGRAM_WEBHOOK_URL=https://urchin-app-8ronl.ondigitalocean.app/telegram/webhook
```

**Nota:** Sin `TELEGRAM_WEBHOOK_URL`, el bot usa polling (solo para desarrollo local).

---

## Comandos del Bot (Bilingüe)

El bot soporta comandos en español e inglés. Ambos funcionan independientemente del idioma del usuario.

| Español | English | Descripción |
|---------|---------|-------------|
| `/start` | `/start` | Bienvenida + auto-join si viene con código |
| `/crear [nombre]` | `/create [name]` | Crear nueva quiniela |
| `/unirse [código]` | `/join [code]` | Unirse a quiniela existente |
| `/predecir` | `/predict` | Hacer predicciones (próximamente) |
| `/ranking [código]` | `/leaderboard [code]` | Ver leaderboard |
| `/misquinielas` | `/mypools` | Listar quinielas del usuario |
| `/partidos` | `/matches` | Próximos partidos (próximamente) |

**Nota:** Las respuestas del bot se muestran en el idioma configurado en Telegram del usuario, no según el comando usado.

---

## Deep Links (Auto-Join)

Cuando un usuario hace clic en un deep link, se une automáticamente a la quiniela:

```
https://t.me/futbolify_quinielas_bot?start=CODIGO
```

**Ejemplo:**
```
https://t.me/futbolify_quinielas_bot?start=9572HS
```

El código puede ser:
- Solo el código: `?start=ABC123`
- Con prefijo: `?start=join_ABC123`

---

## Ghost User System

Los usuarios de Telegram no necesitan registrarse. El sistema:

1. **Detecta** el `telegram_id` del usuario
2. **Busca** en `platform_links` si ya existe
3. **Crea** automáticamente si es nuevo:
   - Usuario en `users` con `isGhostUser: true`
   - Link en `platform_links`

### Schemas

**User** (modificado):
```typescript
email?: string          // Opcional para ghost users (sparse index)
isGhostUser?: boolean   // true para usuarios de bots
```

**PlatformLink** (nuevo):
```typescript
{
  userId: ObjectId,
  platform: 'telegram' | 'slack' | 'discord' | 'gchat' | 'teams',
  platformUserId: string,
  platformUsername?: string,
  platformGroupId?: string,
}
```

---

## Archivos Principales

```
src/telegram/
├── telegram.module.ts      # Módulo NestJS
├── telegram.service.ts     # Lógica del bot (Telegraf)
├── telegram.controller.ts  # Endpoint webhook
├── i18n/
│   └── messages.ts         # Traducciones es/en
├── schemas/
│   └── platform-link.schema.ts
└── index.ts               # Exports
```

---

## Internacionalización (i18n)

El bot detecta automáticamente el idioma del usuario desde `ctx.from.language_code`:

- **Español (es)**: Idioma por defecto
- **English (en)**: Si `language_code` empieza con "en"

```typescript
import { messages, getLang } from './i18n/messages';

const lang = getLang(ctx.from?.language_code); // 'es' | 'en'
ctx.reply(messages.welcome[lang](userName));
```

---

## Selector de Quinielas

Cuando el usuario tiene múltiples quinielas, `/ranking` y `/predecir` muestran botones inline:

```
🏆 Selecciona una quiniela para ver el ranking:

[🏆 Mi Quiniela (5 👥)]
[🏆 Familia González (3 👥)]
[🏆 Amigos del Trabajo (8 👥)]
```

Si solo tiene 1 quiniela, se muestra directamente sin selector.

---

## Configuración en BotFather

### Comandos Bilingües (ya configurados)

Los comandos se configuran por idioma usando la API de Telegram:

```bash
# Configurar comandos en español
curl -X POST "https://api.telegram.org/bot<TOKEN>/setMyCommands" \
  -H "Content-Type: application/json" \
  -d '{
    "commands": [
      {"command": "crear", "description": "Crear una quiniela"},
      {"command": "unirse", "description": "Unirse con código"},
      {"command": "predecir", "description": "Hacer predicciones"},
      {"command": "ranking", "description": "Ver clasificación"},
      {"command": "misquinielas", "description": "Tus quinielas"},
      {"command": "partidos", "description": "Próximos partidos"}
    ],
    "language_code": "es"
  }'

# Configurar comandos en inglés
curl -X POST "https://api.telegram.org/bot<TOKEN>/setMyCommands" \
  -H "Content-Type: application/json" \
  -d '{
    "commands": [
      {"command": "create", "description": "Create a pool"},
      {"command": "join", "description": "Join with code"},
      {"command": "predict", "description": "Make predictions"},
      {"command": "leaderboard", "description": "View rankings"},
      {"command": "mypools", "description": "Your pools"},
      {"command": "matches", "description": "Upcoming matches"}
    ],
    "language_code": "en"
  }'
```

El menú del bot mostrará comandos según el idioma de Telegram del usuario.

### Descripción
```
Quinielas para cualquier torneo: Mundial 2026, Champions League, La Liga, Liga MX y más. Invita amigos con un código, predice desde Telegram y compite en tiempo real. ¡Gratis!
```

### About
```
Bot oficial de Futbolify para quinielas de fútbol. Crea grupos, invita amigos y compite prediciendo resultados.
```

---

## Deploy en Digital Ocean

### 1. Variables de entorno
Agregar en App Platform → Settings → App-Level Environment Variables:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_WEBHOOK_URL`

### 2. Activar webhook (una vez después del deploy)
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://urchin-app-8ronl.ondigitalocean.app/telegram/webhook"
```

### 3. Verificar webhook
```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

### 4. Eliminar webhook (para volver a polling)
```bash
curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
```

---

## Troubleshooting

### Error: duplicate key email_1
El índice `email` no era sparse. El servicio lo corrige automáticamente al iniciar (`onModuleInit`).

### Error: duplicate key platform_links
Race condition al crear usuarios. El código maneja esto con retry y limpieza de usuarios huérfanos.

### Bot no responde
1. Verificar webhook: `getWebhookInfo`
2. Revisar logs en Digital Ocean
3. Verificar que `TELEGRAM_BOT_TOKEN` esté configurado

### Desarrollo local
```bash
# Eliminar webhook para usar polling local
curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"

# Iniciar servidor local
npm run start:dev
```

---

## Próximas Mejoras

- [ ] Predicciones con botones inline
- [ ] Notificaciones pre-partido (2h antes)
- [ ] Conectar con WorldCup module para partidos reales
- [ ] Soporte para grupos de Telegram
- [ ] Integración con Slack (Priority 2)
- [ ] Integración con Discord (Priority 3)

---

## Links Útiles

- **Bot:** https://t.me/futbolify_quinielas_bot
- **API Producción:** https://urchin-app-8ronl.ondigitalocean.app
- **Telegram Bot API:** https://core.telegram.org/bots/api
- **Telegraf Docs:** https://telegraf.js.org/
