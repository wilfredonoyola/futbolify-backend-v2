# Futbolify - Roadmap Maestro

> Documento central que muestra el estado de todas las features en cada plataforma.

**Ultima actualizacion:** 2025-03-25

---

# PROYECTOS DEL ECOSISTEMA

## Ubicacion de Repositorios

| Proyecto | Path | Tech Stack | Status |
|----------|------|------------|--------|
| **Backend** | `futbolify/futbolify-backend-v2` | NestJS + GraphQL + MongoDB | ✅ Activo |
| **Web** | `futbolify/futbolify-web-v2` | Next.js 14 + Apollo + Tailwind | 🚧 En desarrollo |
| **App** | `futbolify/futbolify-app` | Flutter + GetX + Riverpod | 🚧 En desarrollo |
| **Telegram Bot** | Dentro de Backend | Telegraf (NestJS module) | ✅ Activo |

---

## BACKEND (futbolify-backend-v2)

> **El core que manda todo.** NestJS + GraphQL + MongoDB

### Tech Stack

| Tecnologia | Version | Uso |
|------------|---------|-----|
| NestJS | 10.x | Framework backend |
| GraphQL | Apollo Server | API principal |
| MongoDB | Mongoose 8.x | Base de datos |
| Redis | - | Cache |
| AWS Cognito | SDK v3 | Autenticacion |
| Firebase | Admin SDK | Push, RT Database |
| Telegraf | - | Bot Telegram |

### Estructura Modulos

```
src/
├── auth/           # Autenticacion (Cognito + JWT)
├── users/          # Usuarios y perfiles
├── matches/        # Partidos en vivo (API-Football)
├── betting/        # Sistema de apuestas (Telegram bot incluido)
├── goal-guru/      # Analisis G1H (Anthropic)
├── quiniela/       # Core quinielas
├── telegram/       # Bot quinielas Telegram
├── notifications/  # Sistema multi-canal
├── feed/           # Feed social
├── streaming/      # Streams en vivo
├── worldcup/       # Mundial 2026
├── creator/        # Creador contenido
├── firebase/       # Push + RT Database
├── email/          # AWS SES
├── bunny/          # CDN media
└── common/         # Redis cache, utils
```

### APIs Integradas

| API | Modulo | Status |
|-----|--------|--------|
| API-Football | matches, betting | ✅ |
| Football-Data.org | matches | ✅ |
| The Odds API | betting | ✅ |
| OpenAI | quiniela, creator | ✅ |
| Anthropic | goal-guru | ✅ |
| Open-Meteo | betting | ✅ |
| Firebase | notifications, chat | ✅ |
| AWS Cognito | auth | ✅ |
| AWS SES | email | ✅ |
| Bunny CDN | bunny | ✅ |

---

## WEB (futbolify-web-v2)

> **Frontend Web + PWA.** Next.js 14 App Router

### Tech Stack

| Tecnologia | Version | Uso |
|------------|---------|-----|
| Next.js | 14.x | Framework React |
| TypeScript | 5.5 | Tipado estatico |
| Apollo Client | 3.13 | GraphQL client |
| Tailwind CSS | 3.4 | Estilos |
| ShadCN/UI | Radix | Componentes |
| NextAuth | 5.0-beta | Auth |
| next-intl | 3.x | i18n (en/es) |
| Framer Motion | 12.x | Animaciones |

### Estructura Rutas

```
app/[locale]/
├── (about)/            # Paginas publicas
│   ├── page.tsx        # Landing home
│   ├── quinielas/      # Landing quinielas
│   ├── pricing/        # Precios
│   ├── privacy/        # Privacidad
│   ├── terms/          # Terminos
│   └── ...
├── (auth)/             # Autenticacion
│   ├── signin/         # Login
│   ├── signup/         # Registro
│   └── onboarding/     # Onboarding
├── (secured)/          # Rutas protegidas
│   ├── feed/           # Feed principal
│   ├── explorer/       # Explorar
│   ├── following/      # Siguiendo
│   ├── quiniela/       # Quinielas
│   ├── match-lives/    # Partidos en vivo
│   ├── profile/        # Perfil
│   ├── settings/       # Configuracion
│   ├── upload/         # Subir video
│   ├── admin/          # Admin dashboard
│   └── [username]/     # Perfil publico
├── (futbol)/           # SEO pages
├── (donde-ver)/        # SEO pages
├── (noticias)/         # SEO pages
└── (generator)/        # AI generator
```

### Features Web Implementados

| Feature | Status | Notas |
|---------|--------|-------|
| Auth (email, Google) | 🚧 | NextAuth config |
| Feed videos | 🚧 | Basico |
| Upload video | 🚧 | Bunny CDN |
| Quinielas | 🚧 | Paginas creadas |
| Perfil usuario | 🚧 | |
| Match lives | 🚧 | |
| AI Generator | ✅ | Frases + imagenes |
| i18n (en/es) | ✅ | |
| Admin dashboard | 🚧 | |
| SEO pages | 🚧 | Estructura creada |

---

## APP FLUTTER (futbolify-app)

> **App Mobile.** Flutter + GetX + Riverpod

### Tech Stack

| Tecnologia | Version | Uso |
|------------|---------|-----|
| Flutter | 3.10+ | Framework mobile |
| Dart | >=3.10.0 | Lenguaje |
| GetX | 5.x | State + Navigation |
| Riverpod | 2.4 | State (migrando) |
| GraphQL | flutter_graphql | API client |
| AWS Amplify | - | Auth (Cognito) |
| Firebase | - | Push notifications |

### Estructura Features

```
lib/
├── main.dart           # Entry point
├── app.dart            # Routes
├── core/
│   ├── api/            # Services API
│   ├── config/         # Amplify config
│   ├── resources/      # Colors, strings, images
│   └── widgets/        # Premium widgets
├── features/
│   ├── login/          # Login screen
│   ├── create_account/ # Signup
│   ├── home/           # Home + tabs
│   │   ├── main_page/  # Feed videos
│   │   ├── live_tab/   # Partidos en vivo
│   │   ├── upload_video/
│   │   ├── search_page/
│   │   └── my_profile_page/
│   ├── quinielas/      # Quinielas feature
│   │   ├── quinielas_page.dart
│   │   ├── quinielas_controller.dart
│   │   └── widgets/
│   ├── quiniela_chat/  # Chat por quiniela
│   ├── chats/          # Mensajes
│   ├── chat_ai/        # Chat con IA
│   ├── streaming/      # Ver streams
│   ├── content_composer/ # Crear contenido
│   ├── settings/       # Configuracion
│   └── ...
├── graphql/            # Queries/Mutations
└── providers/          # Riverpod providers
```

### Features App Implementados

| Feature | Status | Notas |
|---------|--------|-------|
| Login (Google) | ✅ | Amplify + Cognito |
| Login (Apple) | ⏳ | Pendiente |
| Signup | ✅ | |
| Feed videos | ✅ | TikTok-style |
| Upload video | ✅ | |
| Quinielas | 🚧 | UI + API parcial |
| Quiniela Chat | 🚧 | Firebase RT |
| Chat AI | ✅ | |
| Streaming | 🚧 | Ver streams |
| Push notifications | ✅ | Firebase |
| Deep links | 🚧 | Configurado |
| Perfil usuario | ✅ | |
| Settings | ✅ | |

### Features Nativos App (No Backend)

| Feature | Status | Descripcion |
|---------|--------|-------------|
| Camara foto | ⏳ | Captura nativa |
| Camara video | ⏳ | Grabar video |
| Galeria picker | ✅ | Seleccionar media |
| Video trimming | ⏳ | Edicion local |
| Filtros | ⏳ | Efectos imagen/video |
| Compresion | ⏳ | Antes de upload |
| Local notifications | ⏳ | Recordatorios |
| Widgets iOS/Android | ⏳ | Home screen |
| Biometrics | ⏳ | Face ID / Fingerprint |
| Offline mode | ⏳ | SQLite/Hive |
| Haptic feedback | ⏳ | Vibracion goles |

---

## TELEGRAM BOT (Dentro de Backend)

> **Dos bots separados:** Quinielas y Betting

### Bot Quinielas (@FutbolifyBot)

| Feature | Status | Ubicacion |
|---------|--------|-----------|
| Unirse a quiniela | ✅ | `src/telegram/` |
| Hacer predicciones | ✅ | |
| Ver leaderboard | ✅ | |
| Recordatorios | ✅ | |
| Vincular cuenta | ✅ | PlatformLink |
| Comandos grupo | 🚧 | |

### Bot Betting (@GolPicksBot)

| Feature | Status | Ubicacion |
|---------|--------|-----------|
| /picks | ✅ | `src/betting/telegram/` |
| /combos | ✅ | |
| /stats | ✅ | |
| /health | ✅ | |
| 3 alertas diarias | ✅ | Cron jobs |
| Registro resultados | ✅ | Inline buttons |

---

---

# RESUMEN EJECUTIVO - OVERVIEW

> Estado general de todos los features del ecosistema Futbolify

## Dashboard de Progreso

```
BACKEND     ████████████████████░░░░  80%  ✅ Core listo
APP FLUTTER ██████████████░░░░░░░░░░  50%  🚧 En desarrollo
WEB         ████████░░░░░░░░░░░░░░░░  30%  🚧 En desarrollo
TELEGRAM    ██████████████████░░░░░░  70%  ✅ Funcional
SLACK       ░░░░░░░░░░░░░░░░░░░░░░░░   0%  ⏳ No iniciado
```

---

## Resumen por Producto

| # | Producto | Backend | Web | App | Telegram | Aplica A |
|---|----------|:-------:|:---:|:---:|:--------:|----------|
| 1 | **QUINIELAS** | ✅ 90% | ⏳ 10% | 🚧 40% | ✅ 70% | TODOS |
| 2 | **FEED SOCIAL** | ✅ 70% | 🚧 30% | ✅ 60% | ❌ | Web, App |
| 3 | **CHAT** | 🚧 40% | ⏳ 5% | 🚧 30% | ❌ | Web, App |
| 4 | **SEO/DATOS** | ✅ API | 🚧 20% | ❌ | ❌ | **SOLO WEB** |
| 5 | **NOTIFICACIONES** | 🚧 70% | ⏳ 10% | 🚧 40% | ✅ 70% | TODOS (multi-canal) |
| 6 | **PERFIL** | ✅ 80% | 🚧 30% | ✅ 70% | ❌ | Web, App |

---

## Mapa de Features por Plataforma

> Que features van en cada plataforma

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND (APIs)                               │
│  Sirve datos a TODAS las plataformas                                │
└─────────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│     WEB       │      │   APP FLUTTER │      │  INTEGRACIONES│
│               │      │   (iOS/Android)│      │               │
│ • Quinielas   │      │ • Quinielas   │      │ • Telegram    │
│ • Feed        │      │ • Feed        │      │ • Slack       │
│ • Chat        │      │ • Chat        │      │ • WhatsApp    │
│ • Perfil      │      │ • Perfil      │      │ • Discord     │
│ • Notifs      │      │ • Notifs      │      │ • Email       │
│ • SEO ✓       │      │ • Nativos ✓   │      │               │
│ • Admin ✓     │      │   (camara,    │      │ Solo:         │
│ • PWA ✓       │      │    widgets,   │      │ • Comandos    │
│               │      │    offline)   │      │ • Alertas     │
│ SOLO WEB:     │      │               │      │ • Notifs      │
│ • SEO pages   │      │ SOLO APP:     │      │               │
│ • Admin       │      │ • Camara      │      │ NO tienen:    │
│ • Sitemap     │      │ • Widgets     │      │ • Feed        │
│ • Schema.org  │      │ • Biometrics  │      │ • Perfil      │
│               │      │ • Offline     │      │ • SEO         │
└───────────────┘      └───────────────┘      └───────────────┘
```

### Matriz de Dependencias

| Feature | Backend | Web | App | TG | Slack | WA | Email |
|---------|:-------:|:---:|:---:|:--:|:-----:|:--:|:-----:|
| **QUINIELAS** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **FEED SOCIAL** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **CHAT** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **PERFIL** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **NOTIFICACIONES** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **SEO/DATOS** | API | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **ADMIN** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **NATIVOS** | ❌ | PWA | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## Resumen por Area Funcional

| Area | Backend | Web | App | TG | Total |
|------|:-------:|:---:|:---:|:--:|:-----:|
| **Autenticacion** | ✅ 95% | 🚧 40% | ✅ 80% | ✅ | 75% |
| **Perfil Usuario** | ✅ 80% | 🚧 30% | ✅ 70% | ❌ | 60% |
| **Quinielas Core** | ✅ 90% | ⏳ 10% | 🚧 40% | ✅ 70% | 50% |
| **Rankings/Gamification** | ⏳ 20% | ⏳ 0% | ⏳ 0% | ⏳ | 5% |
| **Viralidad/Compartir** | ⏳ 10% | ⏳ 0% | 🚧 20% | ⏳ | 10% |
| **Feed Social** | ✅ 70% | 🚧 30% | ✅ 60% | ❌ | 55% |
| **Chat** | 🚧 40% | ⏳ 5% | 🚧 30% | ❌ | 25% |
| **Notificaciones** | ✅ 80% | ⏳ 10% | ✅ 60% | ✅ 70% | 55% |
| **Partidos/Datos** | ✅ 95% | 🚧 20% | 🚧 30% | ⏳ | 45% |
| **SEO** | ✅ 90% | 🚧 30% | ❌ | ❌ | 40% |
| **Admin** | ✅ 70% | ⏳ 10% | ❌ | 🚧 | 30% |
| **B2B (Slack/Teams)** | ⏳ 0% | ❌ | ❌ | ❌ | 0% |

---

## Lo Que Funciona Hoy (MVP Actual)

### ✅ Backend - Listo para Produccion

| Modulo | Status | Descripcion |
|--------|:------:|-------------|
| Auth (Cognito) | ✅ | Login email, Google |
| Usuarios | ✅ | CRUD completo |
| Quinielas | ✅ | Crear, unirse, predecir, resultados |
| Partidos | ✅ | API-Football, en vivo |
| Feed | ✅ | Posts, videos, comentarios |
| Notificaciones | ✅ | Push Firebase, multi-canal |
| Telegram Bot | ✅ | Quinielas + Betting |
| Betting | ✅ | Picks, combos, alertas |
| IA | ✅ | OpenAI + Anthropic |

### ✅ App Flutter - Usable

| Feature | Status | Descripcion |
|---------|:------:|-------------|
| Login/Signup | ✅ | Google OAuth |
| Feed Videos | ✅ | TikTok-style |
| Upload Video | ✅ | Con compresion |
| Perfil | ✅ | Ver/editar |
| Push Notifs | ✅ | Firebase |
| Chat IA | ✅ | Funcional |
| Quinielas | 🚧 | UI parcial |

### ✅ Telegram - Funcional

| Bot | Status | Comandos |
|-----|:------:|----------|
| Quinielas | ✅ | Unirse, predecir, leaderboard |
| Betting | ✅ | /picks, /combos, /stats |

---

## Lo Que Falta (Gaps Criticos)

### 🔴 Prioridad Alta - Bloqueadores

| Gap | Impacto | Plataformas |
|-----|---------|-------------|
| **Quinielas UI Web** | No hay web usable | Web |
| **Quinielas UI App completa** | UX incompleta | App |
| **Rankings globales** | Sin gamification | Todos |
| **Viralidad (compartir)** | Sin crecimiento organico | Todos |
| **Deep links** | Onboarding roto | App, Web |

### 🟡 Prioridad Media

| Gap | Impacto | Plataformas |
|-----|---------|-------------|
| Seguidores | Sin social graph | Web, App |
| Centro notificaciones | UX incompleta | Web, App |
| Apple Sign-in | Requerido App Store | App |
| PWA features | Sin offline | Web |
| Chat completo | Sin DMs | Web, App |

### 🟢 Prioridad Baja (Post-MVP)

| Gap | Impacto | Plataformas |
|-----|---------|-------------|
| Badges/Logros | Nice to have | Todos |
| Camara nativa | Puede usar galeria | App |
| Video editing | Puede subir sin editar | App |
| Widgets | Enhancement | App |
| Slack/Teams | B2B futuro | - |

---

---

# 🏆 PRE-MUNDIAL 2026 CHECKLIST

> Features criticos para lanzar **30 dias antes del Mundial** (Mayo 2026)
>
> **Objetivo:** Capturar el hype, viralidad maxima, experiencia perfecta

## Timeline Mundial 2026

| Fecha | Evento |
|-------|--------|
| **11 Jun 2026** | Inicio Mundial (Mexico, USA, Canada) |
| **11 May 2026** | 🚀 **LANZAMIENTO** (30 dias antes) |
| **Abr 2026** | Beta testing, marketing prep |
| **Mar 2026** | Feature freeze, QA |
| **Ene-Feb 2026** | Desarrollo features restantes |

---

## MUST HAVE (Sin esto no lanzamos)

### Quinielas - Core Perfecto

| Feature | Backend | Web | App | Status | Prioridad |
|---------|:-------:|:---:|:---:|:------:|:---------:|
| Crear quiniela Mundial | ✅ | ⏳ | ⏳ | 🔴 | CRITICO |
| Unirse a quiniela | ✅ | ⏳ | 🚧 | 🔴 | CRITICO |
| Hacer predicciones | ✅ | ⏳ | 🚧 | 🔴 | CRITICO |
| Editar predicciones | ✅ | ⏳ | ⏳ | 🔴 | CRITICO |
| Ver mis predicciones | ✅ | ⏳ | 🚧 | 🔴 | CRITICO |
| Leaderboard tiempo real | ✅ | ⏳ | 🚧 | 🔴 | CRITICO |
| Resultados automaticos | ✅ | ⏳ | ⏳ | 🔴 | CRITICO |
| Notificacion resultado | ✅ | ⏳ | ⏳ | 🔴 | CRITICO |

### Autenticacion - Flujo Completo

| Feature | Backend | Web | App | Status | Prioridad |
|---------|:-------:|:---:|:---:|:------:|:---------:|
| Login Google | ✅ | 🚧 | ✅ | 🟡 | CRITICO |
| Login Apple | ⏳ | ⏳ | ⏳ | 🔴 | CRITICO |
| Signup email | ✅ | 🚧 | ✅ | 🟡 | CRITICO |
| Onboarding flow | ✅ | ⏳ | 🚧 | 🔴 | CRITICO |
| Recuperar password | ✅ | ⏳ | ⏳ | 🟡 | Alta |

### Viralidad - Crecimiento Organico

| Feature | Backend | Web | App | Status | Prioridad |
|---------|:-------:|:---:|:---:|:------:|:---------:|
| Compartir quiniela (link) | ⏳ | ⏳ | ⏳ | 🔴 | CRITICO |
| Deep links funcionales | ⏳ | ⏳ | 🚧 | 🔴 | CRITICO |
| Invitar amigos | ⏳ | ⏳ | ⏳ | 🔴 | CRITICO |
| Compartir en WhatsApp | ⏳ | ⏳ | ⏳ | 🔴 | CRITICO |
| Compartir en Twitter/X | ⏳ | ⏳ | ⏳ | 🔴 | CRITICO |
| Compartir en Instagram | ⏳ | ⏳ | ⏳ | 🟡 | Alta |
| Preview link (OG tags) | ⏳ | ⏳ | ❌ | 🔴 | CRITICO |

### Sistema de Notificaciones UNIFICADO

> **Arquitectura:** Un solo sistema que despache a TODOS los canales (Web, App, Telegram, Email, Slack, etc.)

#### Infraestructura Core

| Feature | Backend | Status | Prioridad |
|---------|:-------:|:------:|:---------:|
| NotificationDispatcher unificado | 🚧 | 🔴 | CRITICO |
| Queue system (Bull) | ✅ | 🟢 | - |
| Template system multi-canal | ⏳ | 🔴 | CRITICO |
| Preferencias por usuario | ✅ | 🟢 | - |
| Preferencias por tipo | ✅ | 🟢 | - |
| Rate limiting | ⏳ | 🟡 | Alta |
| Retry logic | ⏳ | 🟡 | Alta |
| Analytics/tracking | ⏳ | 🟡 | Media |

#### Canales de Entrega

| Canal | Backend | Implementado | Status | Prioridad |
|-------|:-------:|:------------:|:------:|:---------:|
| **Push App (Firebase)** | ✅ | ✅ | 🟢 | CRITICO |
| **Push Web (FCM)** | ✅ | ⏳ | 🔴 | CRITICO |
| **Telegram** | ✅ | ✅ | 🟢 | CRITICO |
| **Email (SES)** | ✅ | 🚧 | 🟡 | Alta |
| **In-App (Centro notifs)** | ⏳ | ⏳ | 🔴 | CRITICO |
| **SMS** | ⏳ | ⏳ | 🟡 | Baja |
| **Slack** | ⏳ | ⏳ | 🟡 | Media |
| **WhatsApp** | ⏳ | ⏳ | 🟡 | Media |

#### Notificaciones PROACTIVAS (Inteligentes)

> Anticipan lo que el usuario necesita ANTES de que lo pida

| Notificacion | Trigger | Backend | Web | App | TG | Email |
|--------------|---------|:-------:|:---:|:---:|:--:|:-----:|
| **PRE-PARTIDO** |
| "Partido en 24h, haz tu prediccion" | Cron 24h antes | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| "Partido en 1h, ultima oportunidad" | Cron 1h antes | ⏳ | ⏳ | ⏳ | ⏳ | ❌ |
| "Partido empieza en 15 min" | Cron 15min antes | ⏳ | ⏳ | ⏳ | ⏳ | ❌ |
| "Aun no predijiste [partido]" | Cron smart | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| **DURANTE PARTIDO** |
| "Partido acaba de empezar" | Evento live | ⏳ | ⏳ | ⏳ | ⏳ | ❌ |
| "GOOOL! [Equipo] anoto" | Evento live | ✅ | ⏳ | ⏳ | ⏳ | ❌ |
| "Medio tiempo: [Resultado]" | Evento live | ⏳ | ⏳ | ⏳ | ⏳ | ❌ |
| "Partido terminado: [Resultado]" | Evento live | ✅ | ⏳ | ⏳ | ✅ | ❌ |
| **POST-PARTIDO** |
| "Ganaste X puntos!" | Post-resultado | ✅ | ⏳ | ⏳ | ✅ | ⏳ |
| "Acertaste! Subiste al puesto #X" | Post-resultado | ⏳ | ⏳ | ⏳ | ⏳ | ❌ |
| "Perdiste, pero sigues en #X" | Post-resultado | ⏳ | ⏳ | ⏳ | ⏳ | ❌ |
| **ENGAGEMENT** |
| "[Amigo] te supero en el ranking" | Evento ranking | ⏳ | ⏳ | ⏳ | ⏳ | ❌ |
| "[Amigo] se unio a tu quiniela" | Evento social | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| "Llevas X dias sin predecir" | Cron inactividad | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| "Nueva quiniela disponible" | Evento admin | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| **RESUMENES** |
| "Resumen del dia: X aciertos" | Cron diario | ✅ | ❌ | ⏳ | ✅ | ⏳ |
| "Resumen semanal" | Cron semanal | ✅ | ❌ | ⏳ | ⏳ | ⏳ |
| "Tu mes: X puntos, posicion #Y" | Cron mensual | ⏳ | ❌ | ⏳ | ⏳ | ⏳ |

#### Notificaciones NATURALES de App

> Las que esperas de cualquier app movil de calidad

| Feature | App iOS | App Android | Web | Status |
|---------|:-------:|:-----------:|:---:|:------:|
| Push con imagen rica | ⏳ | ⏳ | ⏳ | 🔴 CRITICO |
| Push con action buttons | ⏳ | ⏳ | ⏳ | 🟡 Alta |
| Badge count (icono) | ⏳ | ⏳ | ❌ | 🟡 Alta |
| Notification grouping | ⏳ | ⏳ | ⏳ | 🟡 Media |
| Silent push (background) | ⏳ | ⏳ | ❌ | 🟡 Media |
| Local notifications | ⏳ | ⏳ | ❌ | 🟡 Alta |
| Scheduled local notifs | ⏳ | ⏳ | ❌ | 🟡 Media |
| Sound personalizado | ⏳ | ⏳ | ❌ | 🟡 Baja |
| Vibration patterns | ⏳ | ⏳ | ❌ | 🟡 Baja |
| **iOS Especificos** |
| Live Activities | ⏳ | ❌ | ❌ | 🟡 Media |
| Dynamic Island | ⏳ | ❌ | ❌ | 🟡 Baja |
| Focus modes respect | ⏳ | ❌ | ❌ | 🟡 Baja |
| **Android Especificos** |
| Notification channels | ❌ | ⏳ | ❌ | 🟡 Alta |
| Foreground service | ❌ | ⏳ | ❌ | 🟡 Media |
| Big picture style | ❌ | ⏳ | ❌ | 🟡 Alta |

#### Centro de Notificaciones In-App

| Feature | Backend | Web | App | Status |
|---------|:-------:|:---:|:---:|:------:|
| Lista notificaciones | ⏳ | ⏳ | 🚧 | 🔴 CRITICO |
| Marcar como leida | ⏳ | ⏳ | ⏳ | 🔴 CRITICO |
| Marcar todas leidas | ⏳ | ⏳ | ⏳ | 🟡 Alta |
| Badge no leidas | ⏳ | ⏳ | 🚧 | 🔴 CRITICO |
| Filtrar por tipo | ⏳ | ⏳ | ⏳ | 🟡 Media |
| Borrar notificacion | ⏳ | ⏳ | ⏳ | 🟡 Media |
| Deep link al contenido | ⏳ | ⏳ | ⏳ | 🔴 CRITICO |

---

### SEO / ADQUISICION (Tipo SofaScore)

> **Objetivo:** Capturar trafico organico de Google para ligas importantes
> **Modelo:** Paginas estaticas con datos actualizados, indexables, shareable

#### Ligas Prioritarias (SEO)

| Liga | Pais | Trafico Potencial | Prioridad |
|------|------|:-----------------:|:---------:|
| **Liga MX** | Mexico | 🔥🔥🔥 | CRITICO |
| **LaLiga** | Espana | 🔥🔥🔥 | CRITICO |
| **Premier League** | Inglaterra | 🔥🔥🔥 | CRITICO |
| **Serie A** | Italia | 🔥🔥 | Alta |
| **Bundesliga** | Alemania | 🔥🔥 | Alta |
| **Ligue 1** | Francia | 🔥🔥 | Alta |
| **MLS** | USA | 🔥🔥 | Alta |
| **Champions League** | Europa | 🔥🔥🔥 | CRITICO |
| **Copa Libertadores** | Sudamerica | 🔥🔥 | Alta |
| **Mundial 2026** | Global | 🔥🔥🔥🔥 | CRITICO |

#### Paginas SEO por Liga (SOLO WEB)

| Pagina | URL Pattern | API Ready | Web UI | Status |
|--------|-------------|:---------:|:------:|:------:|
| Home liga | `/liga/[slug]` | ✅ | 🚧 | 🔴 CRITICO |
| Tabla posiciones | `/liga/[slug]/tabla` | ✅ | ⏳ | 🔴 CRITICO |
| Calendario | `/liga/[slug]/calendario` | ✅ | ⏳ | 🔴 CRITICO |
| Resultados | `/liga/[slug]/resultados` | ✅ | ⏳ | 🟡 Alta |
| Goleadores | `/liga/[slug]/goleadores` | ⏳ | ⏳ | 🟡 Alta |
| Estadisticas | `/liga/[slug]/estadisticas` | ⏳ | ⏳ | 🟡 Media |
| Equipos | `/liga/[slug]/equipos` | ✅ | ⏳ | 🟡 Alta |

#### Paginas SEO por Equipo (SOLO WEB)

| Pagina | URL Pattern | API Ready | Web UI | Status |
|--------|-------------|:---------:|:------:|:------:|
| Home equipo | `/equipo/[slug]` | ✅ | 🚧 | 🔴 CRITICO |
| Plantilla | `/equipo/[slug]/plantilla` | ⏳ | ⏳ | 🟡 Alta |
| Calendario | `/equipo/[slug]/calendario` | ✅ | ⏳ | 🟡 Alta |
| Resultados | `/equipo/[slug]/resultados` | ✅ | ⏳ | 🟡 Alta |
| Estadisticas | `/equipo/[slug]/estadisticas` | ⏳ | ⏳ | 🟡 Media |
| Historial | `/equipo/[slug]/historial` | ⏳ | ⏳ | 🟡 Baja |

#### Paginas SEO por Partido (SOLO WEB)

| Pagina | URL Pattern | API Ready | Web UI | Status |
|--------|-------------|:---------:|:------:|:------:|
| Preview partido | `/partido/[id]` | ✅ | 🚧 | 🔴 CRITICO |
| Stats en vivo | `/partido/[id]/live` | ✅ | ⏳ | 🟡 Alta |
| Alineaciones | `/partido/[id]/alineaciones` | ✅ | ⏳ | 🟡 Alta |
| Head to Head | `/partido/[id]/h2h` | ✅ | ⏳ | 🟡 Alta |
| Predicciones comunidad | `/partido/[id]/predicciones` | ⏳ | ⏳ | 🟡 Media |

> **Nota:** SEO es exclusivo de Web. App, Telegram y otras integraciones NO tienen paginas SEO.
> El Backend provee las APIs, la Web renderiza las paginas para Google.

#### SEO Tecnico

| Feature | Web | Status | Prioridad |
|---------|:---:|:------:|:---------:|
| SSR/SSG (Next.js) | 🚧 | 🟡 | CRITICO |
| Meta tags dinamicos | 🚧 | 🟡 | CRITICO |
| OG tags (social preview) | ⏳ | 🔴 | CRITICO |
| Twitter cards | ⏳ | 🔴 | CRITICO |
| Sitemap.xml dinamico | 🚧 | 🟡 | CRITICO |
| robots.txt | 🚧 | 🟡 | Alta |
| Schema.org (JSON-LD) | ⏳ | 🔴 | CRITICO |
| Canonical URLs | ⏳ | 🟡 | Alta |
| hreflang (es/en) | ⏳ | 🟡 | Alta |
| Core Web Vitals | ⏳ | 🟡 | Alta |
| Mobile-first | 🚧 | 🟡 | CRITICO |
| AMP (opcional) | ⏳ | 🟡 | Baja |

#### Schema.org para Futbol

| Schema | Pagina | Status |
|--------|--------|:------:|
| SportsEvent | Partido | ⏳ |
| SportsTeam | Equipo | ⏳ |
| SportsOrganization | Liga | ⏳ |
| Person (Athlete) | Jugador | ⏳ |
| BreadcrumbList | Todas | ⏳ |

#### Keywords Target (Ejemplos)

| Keyword | Volumen | Pagina Target |
|---------|:-------:|---------------|
| "tabla posiciones liga mx" | 🔥🔥🔥 | /liga/liga-mx/tabla |
| "partidos hoy liga mx" | 🔥🔥🔥 | /liga/liga-mx/calendario |
| "barcelona vs real madrid" | 🔥🔥🔥 | /partido/[id] |
| "alineacion america" | 🔥🔥 | /equipo/america/plantilla |
| "mundial 2026 calendario" | 🔥🔥🔥 | /liga/mundial-2026/calendario |
| "champions league tabla" | 🔥🔥🔥 | /liga/champions/tabla |

### Perfil Basico

| Feature | Backend | Web | App | Status | Prioridad |
|---------|:-------:|:---:|:---:|:------:|:---------:|
| Ver mi perfil | ✅ | 🚧 | ✅ | 🟢 | CRITICO |
| Editar perfil | ✅ | 🚧 | ✅ | 🟢 | CRITICO |
| Foto de perfil | ✅ | 🚧 | ✅ | 🟢 | CRITICO |
| Seleccionar pais/equipo | ✅ | ⏳ | ✅ | 🟡 | Alta |

---

## SHOULD HAVE (Muy importante, pero podemos lanzar sin esto)

### Rankings y Gamification

| Feature | Backend | Web | App | Status | Prioridad |
|---------|:-------:|:---:|:---:|:------:|:---------:|
| Ranking global Mundial | ⏳ | ⏳ | ⏳ | 🟡 | Alta |
| Ranking por pais | ⏳ | ⏳ | ⏳ | 🟡 | Alta |
| Streaks (rachas) | ⏳ | ⏳ | ⏳ | 🟡 | Media |
| Badges basicos | ⏳ | ⏳ | ⏳ | 🟡 | Media |

### Social Basico

| Feature | Backend | Web | App | Status | Prioridad |
|---------|:-------:|:---:|:---:|:------:|:---------:|
| Ver perfil de otros | ✅ | 🚧 | ✅ | 🟢 | Alta |
| Ver predicciones de otros | ⏳ | ⏳ | ⏳ | 🟡 | Alta |
| Seguir usuarios | ⏳ | ⏳ | ⏳ | 🟡 | Media |

### Chat Quiniela

| Feature | Backend | Web | App | Status | Prioridad |
|---------|:-------:|:---:|:---:|:------:|:---------:|
| Chat grupal quiniela | 🚧 | ⏳ | 🚧 | 🟡 | Alta |
| Reacciones partido | ⏳ | ⏳ | ⏳ | 🟡 | Media |

### Datos Mundial

| Feature | Backend | Web | App | Status | Prioridad |
|---------|:-------:|:---:|:---:|:------:|:---------:|
| Calendario partidos | ✅ | ⏳ | ⏳ | 🟡 | Alta |
| Grupos y standings | ✅ | ⏳ | ⏳ | 🟡 | Alta |
| Stats equipos | ✅ | ⏳ | ⏳ | 🟡 | Media |
| Info sedes (Mexico, USA, Canada) | ⏳ | ⏳ | ⏳ | 🟡 | Media |

---

## NICE TO HAVE (Si hay tiempo)

| Feature | Plataforma | Prioridad |
|---------|------------|:---------:|
| Feed de contenido | Web, App | Baja |
| Chat por partido | Web, App | Baja |
| IA predicciones | Todos | Baja |
| Widgets iOS/Android | App | Baja |
| PWA offline | Web | Baja |
| Slack integration | Slack | Baja |
| Live Activities (iOS) | App | Baja |

---

## Resumen Pre-Mundial

### Por Plataforma - Que Falta

#### Backend ✅ 90% Listo
```
Falta:
- [ ] Ranking global Mundial
- [ ] Compartir links con preview
- [ ] Push "te superaron"
- [ ] Calendario Mundial completo
```

#### Web ⏳ 30% - MUCHO TRABAJO
```
Critico (MUST HAVE):
- [ ] Quinielas UI completa
- [ ] Auth flow completo
- [ ] Compartir quiniela
- [ ] OG tags / previews
- [ ] Leaderboard
- [ ] Onboarding
```

#### App 🚧 50% - TRABAJO MODERADO
```
Critico (MUST HAVE):
- [ ] Apple Sign-in
- [ ] Quinielas UI completa
- [ ] Deep links
- [ ] Compartir (WhatsApp, Twitter)
- [ ] Push notifications completas
- [ ] Onboarding flow
```

#### Telegram ✅ 70% Listo
```
Falta:
- [ ] Comandos grupo mejorados
- [ ] Compartir quiniela Mundial
```

---

## Estimacion de Esfuerzo

| Plataforma | Features Faltantes | Estimacion |
|------------|:------------------:|:----------:|
| Backend | ~10 features | 2-3 semanas |
| Web | ~25 features | 8-10 semanas |
| App | ~15 features | 4-6 semanas |
| Telegram | ~5 features | 1 semana |
| **TOTAL** | ~55 features | **12-16 semanas** |

### Timeline Recomendado

```
Hoy (Mar 2025) ──────────────────────────────────── Mayo 2026

Mar-Abr 2025: Web MVP Quinielas
May-Jun 2025: App Quinielas completo + Deep links
Jul-Ago 2025: Viralidad (compartir, invitar)
Sep-Oct 2025: Rankings + Gamification
Nov-Dic 2025: Polish + Chat
Ene-Feb 2026: QA + Beta testing
Mar-Abr 2026: Bug fixes + Marketing
May 2026: 🚀 LANZAMIENTO
Jun 2026: 🏆 MUNDIAL
```

---

---

# 🧪 TESTING Y ESTABILIDAD

> **Objetivo:** Que NO falle durante el Mundial. Cero downtime en momentos críticos (goles, finales).

## Escenarios Críticos (No Pueden Fallar)

| Escenario | Impacto si Falla | Prioridad |
|-----------|------------------|:---------:|
| Gol en partido → notificación masiva | Miles de usuarios no reciben | 🔴 CRITICO |
| Final Mundial → pico de tráfico | App/Web caen | 🔴 CRITICO |
| Cierre predicciones → muchos enviando | Timeout, predicciones perdidas | 🔴 CRITICO |
| Resultado partido → actualizar puntos | Leaderboard incorrecto | 🔴 CRITICO |
| Login masivo antes de partido | No pueden entrar | 🔴 CRITICO |
| Push notification masiva | Firebase rate limit | 🟡 Alto |
| API-Football caída | Sin datos de partidos | 🟡 Alto |

---

## Estrategia de Testing por Capa

### Backend Testing

| Tipo | Herramienta | Cobertura Actual | Target | Status |
|------|-------------|:----------------:|:------:|:------:|
| **Unit Tests** | Jest | ⏳ ~20%? | 80% | 🔴 |
| **Integration Tests** | Jest + Supertest | ⏳ ~10%? | 60% | 🔴 |
| **E2E Tests** | Jest | ⏳ ~5%? | 40% | 🔴 |
| **Load Testing** | k6 / Artillery | ⏳ 0% | ✅ | 🔴 CRITICO |
| **Stress Testing** | k6 | ⏳ 0% | ✅ | 🔴 CRITICO |

#### Tests Críticos Backend

| Test | Descripcion | Status |
|------|-------------|:------:|
| Crear quiniela | Happy path + edge cases | ⏳ |
| Hacer predicción | Validaciones, límite tiempo | ⏳ |
| Calcular puntos | Lógica correcta | ⏳ |
| Actualizar leaderboard | Ordenamiento correcto | ⏳ |
| Enviar notificación | Todos los canales | ⏳ |
| Procesar resultado | API-Football → DB | ⏳ |
| Auth flow | Login, refresh token | ⏳ |
| Rate limiting | No explotar APIs | ⏳ |
| Concurrencia | 1000 predicciones simultáneas | ⏳ |

### Web Testing

| Tipo | Herramienta | Cobertura Actual | Target | Status |
|------|-------------|:----------------:|:------:|:------:|
| **Unit Tests** | Jest + RTL | ⏳ ~10%? | 70% | 🔴 |
| **Integration Tests** | Jest | ⏳ ~5%? | 50% | 🔴 |
| **E2E Tests** | Maestro | ⏳ 0% | 30% | 🔴 |
| **Visual Regression** | Chromatic / Percy | ⏳ 0% | ✅ | 🟡 |
| **Performance** | Lighthouse CI | ⏳ 0% | ✅ | 🟡 |

#### Tests Críticos Web

| Test | Descripcion | Status |
|------|-------------|:------:|
| Login flow completo | Email, Google, errores | ⏳ |
| Crear quiniela | Form validation, submit | ⏳ |
| Hacer predicción | UI, submit, feedback | ⏳ |
| Ver leaderboard | Render, actualización | ⏳ |
| Compartir link | Copy, preview correcto | ⏳ |
| Deep link | Llega al contenido | ⏳ |
| Responsive | Mobile, tablet, desktop | ⏳ |
| Offline handling | Muestra mensaje, no crash | ⏳ |

### App Flutter Testing

| Tipo | Herramienta | Cobertura Actual | Target | Status |
|------|-------------|:----------------:|:------:|:------:|
| **Unit Tests** | flutter_test | ⏳ ~15%? | 70% | 🔴 |
| **Widget Tests** | flutter_test | ⏳ ~10%? | 50% | 🔴 |
| **Integration Tests** | integration_test | ⏳ ~5%? | 30% | 🔴 |
| **Golden Tests** | golden_toolkit | ⏳ 0% | ✅ | 🟡 |

#### Tests Críticos App

| Test | Descripcion | Status |
|------|-------------|:------:|
| Login Google | OAuth flow completo | ⏳ |
| Login Apple | OAuth flow completo | ⏳ |
| Hacer predicción | UI + API | ⏳ |
| Push notification | Recibe, abre correcto | ⏳ |
| Deep link | Abre contenido correcto | ⏳ |
| Offline mode | No crash, mensaje | ⏳ |
| Background → Foreground | Estado correcto | ⏳ |

### Telegram Bot Testing

| Test | Descripcion | Status |
|------|-------------|:------:|
| Comandos básicos | /start, /help, /quiniela | ⏳ |
| Hacer predicción | Flow completo | ⏳ |
| Inline buttons | Responden correctamente | ⏳ |
| Rate limiting | No banean el bot | ⏳ |
| Grupos | Funciona en grupos | ⏳ |

---

## Load Testing / Stress Testing

### Escenarios de Carga

| Escenario | Usuarios Simultáneos | Requests/seg | Status |
|-----------|:--------------------:|:------------:|:------:|
| Normal (día regular) | 100 | 50 | ⏳ |
| Partido importante | 1,000 | 500 | ⏳ |
| Gol en partido | 5,000 | 2,000 | ⏳ |
| Final Mundial | 10,000 | 5,000 | ⏳ |
| Spike extremo | 50,000 | 10,000 | ⏳ |

### Endpoints Críticos a Testear

| Endpoint | Load Test | Stress Test | Target Response |
|----------|:---------:|:-----------:|:---------------:|
| `POST /prediccion` | ⏳ | ⏳ | < 200ms |
| `GET /leaderboard` | ⏳ | ⏳ | < 300ms |
| `GET /partidos` | ⏳ | ⏳ | < 200ms |
| `POST /auth/login` | ⏳ | ⏳ | < 500ms |
| `GraphQL /graphql` | ⏳ | ⏳ | < 300ms |

### Herramientas Recomendadas

| Herramienta | Uso | Status |
|-------------|-----|:------:|
| **k6** | Load testing scripts | ⏳ |
| **Artillery** | Load testing | ⏳ |
| **Grafana k6 Cloud** | Dashboard resultados | ⏳ |
| **Apache JMeter** | Alternativa | ⏳ |

---

## Monitoring y Alertas

### Infraestructura de Monitoring

| Herramienta | Uso | Status |
|-------------|-----|:------:|
| **Sentry** | Error tracking (Backend, Web, App) | ⏳ |
| **Datadog / New Relic** | APM, métricas | ⏳ |
| **Grafana** | Dashboards | ⏳ |
| **PagerDuty / Opsgenie** | Alertas on-call | ⏳ |
| **UptimeRobot** | Uptime monitoring | ⏳ |
| **LogRocket** | Session replay (Web) | ⏳ |
| **Firebase Crashlytics** | Crashes App | 🚧 |

### Métricas a Monitorear

| Métrica | Umbral Alerta | Umbral Crítico |
|---------|:-------------:|:--------------:|
| Response time p95 | > 500ms | > 1s |
| Error rate | > 1% | > 5% |
| CPU usage | > 70% | > 90% |
| Memory usage | > 70% | > 90% |
| DB connections | > 80% | > 95% |
| Queue size | > 1000 | > 5000 |
| Failed jobs | > 10/min | > 50/min |

### Alertas Críticas

| Alerta | Canal | Acción |
|--------|-------|--------|
| API down | Slack + SMS + Call | Escalar inmediato |
| Error rate > 5% | Slack + SMS | Investigar |
| Response > 2s | Slack | Investigar |
| DB connection fail | Slack + SMS | Escalar |
| Redis down | Slack + SMS | Escalar |
| Firebase quota | Slack | Revisar |
| API-Football down | Slack | Activar fallback |

---

## Plan de Contingencia

### Fallbacks

| Servicio | Si Falla | Fallback |
|----------|----------|----------|
| API-Football | Sin datos partidos | Football-Data.org (FREE) |
| Firebase Push | Sin notificaciones | Telegram como backup |
| Redis | Sin cache | Leer directo de MongoDB |
| MongoDB Primary | DB caída | Replica secundaria |
| Heroku | Backend caído | ? (considerar multi-region) |
| Bunny CDN | Sin media | S3 directo |

### Rollback Plan

| Situación | Acción | Tiempo |
|-----------|--------|:------:|
| Bug crítico en producción | Rollback a versión anterior | < 5 min |
| Feature no funciona | Feature flag OFF | < 1 min |
| Spike inesperado | Escalar instancias | < 10 min |
| DDoS | Cloudflare protection | Automático |

### Feature Flags

| Feature | Flag | Permite |
|---------|------|---------|
| Notificaciones push | `PUSH_ENABLED` | Desactivar si problemas |
| Predicciones | `PREDICTIONS_ENABLED` | Cerrar si sobrecarga |
| Nuevo feature X | `FEATURE_X_ENABLED` | Rollout gradual |

---

## QA Manual Pre-Lanzamiento

### Checklist QA Web

| Test | Tester | Status |
|------|:------:|:------:|
| [ ] Login email - happy path | - | ⏳ |
| [ ] Login email - error (wrong password) | - | ⏳ |
| [ ] Login Google - happy path | - | ⏳ |
| [ ] Signup completo | - | ⏳ |
| [ ] Crear quiniela | - | ⏳ |
| [ ] Unirse a quiniela (link) | - | ⏳ |
| [ ] Hacer predicción | - | ⏳ |
| [ ] Editar predicción | - | ⏳ |
| [ ] Ver leaderboard | - | ⏳ |
| [ ] Compartir quiniela | - | ⏳ |
| [ ] Notificaciones push | - | ⏳ |
| [ ] Responsive mobile | - | ⏳ |
| [ ] Responsive tablet | - | ⏳ |
| [ ] Performance (< 3s load) | - | ⏳ |
| [ ] Errores manejados (no crash) | - | ⏳ |

### Checklist QA App

| Test | iOS | Android |
|------|:---:|:-------:|
| [ ] Login Google | ⏳ | ⏳ |
| [ ] Login Apple | ⏳ | ❌ |
| [ ] Signup | ⏳ | ⏳ |
| [ ] Onboarding | ⏳ | ⏳ |
| [ ] Crear quiniela | ⏳ | ⏳ |
| [ ] Unirse (deep link) | ⏳ | ⏳ |
| [ ] Hacer predicción | ⏳ | ⏳ |
| [ ] Ver leaderboard | ⏳ | ⏳ |
| [ ] Push notification | ⏳ | ⏳ |
| [ ] Abrir desde push | ⏳ | ⏳ |
| [ ] Compartir WhatsApp | ⏳ | ⏳ |
| [ ] Compartir Twitter | ⏳ | ⏳ |
| [ ] Offline handling | ⏳ | ⏳ |
| [ ] Background → Foreground | ⏳ | ⏳ |
| [ ] Kill → Reopen | ⏳ | ⏳ |
| [ ] Low memory | ⏳ | ⏳ |
| [ ] Slow network (3G) | ⏳ | ⏳ |
| [ ] No network | ⏳ | ⏳ |

### Checklist QA Telegram

| Test | Status |
|------|:------:|
| [ ] /start | ⏳ |
| [ ] /help | ⏳ |
| [ ] Unirse a quiniela | ⏳ |
| [ ] Hacer predicción | ⏳ |
| [ ] Ver leaderboard | ⏳ |
| [ ] Recibir notificación resultado | ⏳ |
| [ ] Funciona en grupo | ⏳ |

---

## Testing del Mundial (Simulación)

### Simulación Pre-Lanzamiento

| Simulación | Descripcion | Fecha Target |
|------------|-------------|:------------:|
| **Dry Run 1** | 100 usuarios internos, 1 partido | Abr 2026 |
| **Dry Run 2** | 500 beta users, jornada completa | Abr 2026 |
| **Dry Run 3** | 2000 users, simular final | May 2026 |
| **Load Test Final** | 10,000 virtuales, pico gol | May 2026 |

### Métricas de Éxito del Test

| Métrica | Target |
|---------|:------:|
| Uptime durante simulación | 99.9% |
| Predicciones procesadas | 100% |
| Notificaciones entregadas | > 95% |
| Response time p95 | < 500ms |
| Error rate | < 0.1% |
| Crashes App | 0 |

---

## Equipo QA: Humanos vs IA

### Opción A: Equipo Tradicional (Costoso)

| Rol | Cantidad | Costo/mes | Total |
|-----|:--------:|:---------:|:-----:|
| QA Lead | 1 | $4,000 | $4,000 |
| QA Manual | 2 | $2,500 | $5,000 |
| QA Automation | 1 | $3,500 | $3,500 |
| DevOps/SRE | 1 | $4,000 | $4,000 |
| **TOTAL** | **5** | - | **$16,500/mes** |

### Opción B: Equipo Híbrido con IA (Recomendado) 🤖

| Rol | Humano | IA | Costo/mes |
|-----|:------:|:--:|:---------:|
| QA Lead | 1 (part-time) | - | $2,000 |
| QA Manual | 0 | Claude + Agentes | $500 |
| QA Automation | 0 | Claude Code + Copilot | $100 |
| DevOps/SRE | 1 (part-time) | AI Monitoring | $2,000 |
| **TOTAL** | **2 part-time** | **IA** | **$4,600/mes** |

**Ahorro: ~$12,000/mes (72%)**

---

## 🤖 ESTRATEGIA REAL DE TESTING CON IA

> Basado en investigación de herramientas que EXISTEN hoy (2025)

### Estado Actual de Testing en Futbolify

```
COBERTURA ACTUAL: ~8% (5 archivos de test)

Tests existentes:
├── src/streaming/services/stream.service.spec.ts
├── src/goal-guru/services/__tests__/fhg-health.service.spec.ts
├── src/goal-guru/services/__tests__/fhg-prediction.service.spec.ts
├── src/goal-guru/services/__tests__/fhg-selection.service.spec.ts
└── src/goal-guru/services/__tests__/fhg-value.service.spec.ts

❌ NO hay tests en: betting, quiniela, auth, notifications, matches
❌ NO hay CI/CD configurado
❌ E2E solo verifica "Hello World"
```

### Módulos Críticos SIN Tests

| Módulo | Líneas Código | Tests | Criticidad |
|--------|:-------------:|:-----:|:----------:|
| **Betting** | 6,486 | 0 | 🔴 CRÍTICA |
| **Quiniela** | 1,828 | 0 | 🔴 CRÍTICA |
| **Auth** | 11,482 | 0 | 🔴 CRÍTICA |
| **Notifications** | 1,222 | 0 | 🟡 ALTA |
| **Matches** | ~1,500 | 0 | 🟡 ALTA |

---

## Stack de Testing Simplificado

```
┌─────────────────────────────────────────────────────────────────┐
│                   FUTBOLIFY TESTING STACK                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                      MAESTRO                                │ │
│  │            E2E Testing para TODAS las Plataformas           │ │
│  │                                                             │ │
│  │   ✅ Flutter App iOS      ✅ Flutter App Android            │ │
│  │   ✅ Web Next.js          ✅ Flutter Web                    │ │
│  │   ✅ Mobile Browser       ✅ WebViews                       │ │
│  │                                                             │ │
│  │   → 1 solo YAML = todas las plataformas                    │ │
│  │   → Usado por Meta, Microsoft, DoorDash                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   JEST + SUPERTEST                          │ │
│  │              Backend NestJS (Unit + API)                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Resumen: Solo 2 Herramientas

| Herramienta | Qué Testea | Tipo |
|-------------|------------|------|
| **Maestro** | Web + Flutter + Mobile (TODO el frontend) | E2E |
| **Jest** | Backend NestJS | Unit + API |

### Por Plataforma

| Plataforma | Unit Tests | E2E Tests |
|------------|:----------:|:---------:|
| **Backend (NestJS)** | Jest | - |
| **Web (Next.js)** | Jest | **Maestro** |
| **Flutter App iOS** | Flutter Test | **Maestro** |
| **Flutter App Android** | Flutter Test | **Maestro** |
| **Flutter Web** | - | **Maestro** |

---

## Herramienta 1: Maestro (E2E para TODO)

> [Maestro](https://maestro.dev/) - Framework E2E para Mobile y Web
>
> **GitHub:** 10,000+ stars | **Usado por:** Meta, Microsoft, DoorDash, Expo

### Plataformas Soportadas

| Plataforma | Soportado | Notas |
|------------|:---------:|-------|
| **iOS** | ✅ | Simuladores |
| **Android** | ✅ | Emuladores + dispositivos reales |
| **Web** | ✅ | Browsers desktop |
| **Flutter** | ✅ | Nativo |
| **Flutter Web** | ✅ | También soportado |
| **React Native** | ✅ | Usado por Meta |
| **WebViews** | ✅ | Apps híbridas |

### Por qué Maestro

| Ventaja | Descripción |
|---------|-------------|
| **1 herramienta** | Mismo YAML para Web + Mobile |
| **YAML simple** | No requiere código, declarativo |
| **Grabar flows** | `maestro record` graba interacciones |
| **CI/CD ready** | GitHub Actions nativo |
| **Screenshots/Video** | Captura automática |
| **Cloud opcional** | Maestro Cloud para paralelo |

### Instalación

```bash
# macOS / Linux
curl -Ls "https://get.maestro.mobile.dev" | bash

# Verificar
maestro --version

# Para iOS (requiere idb)
brew tap facebook/fb
brew install facebook/fb/idb-companion

# Requisito: Java 17+
java --version
```

### Estructura de Tests

```
futbolify-app/                    # Flutter App
├── .maestro/
│   ├── config.yaml
│   └── flows/
│       ├── auth/
│       │   ├── login.yaml
│       │   ├── signup.yaml
│       │   └── logout.yaml
│       ├── quiniela/
│       │   ├── create.yaml
│       │   ├── join.yaml
│       │   └── predict.yaml
│       ├── feed/
│       │   ├── view.yaml
│       │   └── create_post.yaml
│       └── smoke/
│           └── critical_path.yaml

futbolify-web-v2/                 # Web Next.js
├── .maestro/
│   └── flows/
│       ├── auth/
│       │   └── login.yaml
│       ├── quiniela/
│       │   └── create.yaml
│       └── smoke/
│           └── web_critical.yaml
```

### Ejemplos de Flows

#### Login (Flutter App)

```yaml
# .maestro/flows/auth/login.yaml
appId: com.futbolify.app
---
- launchApp

# Esperar pantalla de login
- assertVisible: "Iniciar Sesión"

# Login con Google
- tapOn: "Continuar con Google"
- waitForAnimationToEnd

# Verificar éxito
- assertVisible: "Quinielas"
- takeScreenshot: "login_success"
```

#### Login (Web - Next.js)

```yaml
# .maestro/flows/auth/login_web.yaml
# Para web, usa URL en lugar de appId
---
- openBrowser:
    url: "http://localhost:3000/signin"

- assertVisible: "Iniciar Sesión"
- tapOn: "Continuar con Google"
- waitForAnimationToEnd

- assertVisible: "Quinielas"
- takeScreenshot: "web_login_success"
```

#### Crear Quiniela

```yaml
# .maestro/flows/quiniela/create.yaml
appId: com.futbolify.app
---
- launchApp
- runFlow: ../auth/login.yaml  # Reutiliza login

# Navegar
- tapOn: "Nueva Quiniela"
- assertVisible: "Crear Quiniela"

# Llenar formulario
- tapOn:
    id: "quiniela_name_input"
- inputText: "Mi Quiniela Mundial 2026"

- tapOn: "Seleccionar Liga"
- tapOn: "FIFA World Cup"

# Crear
- tapOn: "Crear Quiniela"

# Verificar
- assertVisible: "Mi Quiniela Mundial 2026"
- takeScreenshot: "quiniela_created"
```

#### Hacer Predicción

```yaml
# .maestro/flows/quiniela/predict.yaml
appId: com.futbolify.app
---
- launchApp
- runFlow: ../auth/login.yaml

# Ir a quiniela
- tapOn: "Mi Quiniela Mundial 2026"
- assertVisible: "Próximos Partidos"

# Hacer predicción
- tapOn:
    text: "Argentina vs Brasil"
- assertVisible: "Tu Predicción"

# Ingresar scores
- tapOn:
    id: "home_score"
- inputText: "2"
- tapOn:
    id: "away_score"
- inputText: "1"

- tapOn: "Guardar Predicción"

# Verificar
- assertVisible: "2 - 1"
- takeScreenshot: "prediction_saved"
```

#### Smoke Test (Crítico)

```yaml
# .maestro/flows/smoke/critical_path.yaml
appId: com.futbolify.app
---
- launchApp

# 1. Login
- runFlow: ../auth/login.yaml

# 2. Ver feed
- tapOn: "Feed"
- assertVisible: "Publicaciones"

# 3. Ir a quinielas
- tapOn: "Quinielas"
- assertVisible: "Mis Quinielas"

# 4. Ver perfil
- tapOn: "Perfil"
- assertVisible: "Editar Perfil"

# 5. Logout
- tapOn: "Cerrar Sesión"
- assertVisible: "Iniciar Sesión"

- takeScreenshot: "smoke_complete"
```

### Comandos Esenciales

```bash
# Ejecutar un flow
maestro test .maestro/flows/auth/login.yaml

# Ejecutar TODOS los flows
maestro test .maestro/flows/

# Modo interactivo (debug)
maestro studio

# GRABAR un flow nuevo (muy útil!)
maestro record .maestro/flows/nuevo_flow.yaml

# Con reporte HTML
maestro test .maestro/flows/ --format html --output ./maestro-report

# Dispositivo específico
maestro test --device "iPhone 15 Pro" .maestro/flows/

# Para WEB
maestro test --platform web .maestro/flows/web/
```

### CI/CD: GitHub Actions

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests (Maestro)

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  # ==========================================
  # FLUTTER APP - iOS
  # ==========================================
  flutter-ios:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Flutter
        uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.19.0'

      - name: Install dependencies
        working-directory: futbolify-app
        run: flutter pub get

      - name: Build iOS
        working-directory: futbolify-app
        run: flutter build ios --simulator --flavor dev

      - name: Install Maestro
        run: curl -Ls "https://get.maestro.mobile.dev" | bash

      - name: Boot Simulator
        run: |
          xcrun simctl boot "iPhone 15 Pro"
          xcrun simctl install booted futbolify-app/build/ios/iphonesimulator/Runner.app

      - name: Run Maestro Tests
        run: ~/.maestro/bin/maestro test futbolify-app/.maestro/flows/ --format junit

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: maestro-ios-results
          path: maestro-report/

  # ==========================================
  # FLUTTER APP - Android
  # ==========================================
  flutter-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Flutter
        uses: subosito/flutter-action@v2

      - name: Setup Android Emulator
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 33
          arch: x86_64
          script: |
            cd futbolify-app
            flutter build apk --flavor dev
            adb install build/app/outputs/flutter-apk/app-dev-release.apk
            curl -Ls "https://get.maestro.mobile.dev" | bash
            ~/.maestro/bin/maestro test .maestro/flows/

  # ==========================================
  # WEB - Next.js
  # ==========================================
  web-e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install & Build Web
        working-directory: futbolify-web-v2
        run: |
          npm ci
          npm run build

      - name: Start Web Server
        working-directory: futbolify-web-v2
        run: npm start &

      - name: Install Maestro
        run: curl -Ls "https://get.maestro.mobile.dev" | bash

      - name: Run Web Tests
        run: |
          ~/.maestro/bin/maestro test futbolify-web-v2/.maestro/flows/ \
            --platform web \
            --format junit

  # ==========================================
  # BACKEND - Jest Unit Tests
  # ==========================================
  backend-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install & Test
        working-directory: futbolify-backend-v2
        run: |
          npm ci
          npm run test:cov

      - name: Check Coverage
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          echo "Coverage: $COVERAGE%"
          if (( $(echo "$COVERAGE < 60" | bc -l) )); then
            echo "❌ Coverage below 60%"
            exit 1
          fi
```

### Maestro Cloud (Opcional)

```bash
# Ejecutar en cloud (paralelo, más rápido)
maestro cloud .maestro/flows/ \
  --app-file=build/app.apk \
  --api-key=$MAESTRO_API_KEY

# Costo: ~$50/mes para 500 ejecuciones
```

### Prioridad de Tests

| Prioridad | Flow | Plataforma |
|:---------:|------|:----------:|
| 🔴 P0 | Login/Signup | App + Web |
| 🔴 P0 | Crear Quiniela | App + Web |
| 🔴 P0 | Hacer Predicción | App + Web |
| 🔴 P0 | Smoke Test | App + Web |
| 🟡 P1 | Ver Feed | App |
| 🟡 P1 | Crear Post | App |
| 🟡 P1 | Notificaciones | App |
| 🟢 P2 | Perfil | App + Web |
| 🟢 P2 | Chat | App |

---

## Herramienta 2: Jest (Unit Tests Backend)

> Específico para generar tests de Jest para NestJS

### Prompt Template para Claude Code

```markdown
# Genera tests para NestJS Service

## Contexto
- Framework: NestJS + Jest
- Service: {nombre del servicio}
- Dependencias: {listar dependencias}

## Requisitos
1. Usa @nestjs/testing con Test.createTestingModule()
2. Mockea todas las dependencias con jest.fn()
3. Incluye casos:
   - Happy path
   - Validaciones fallidas
   - Errores de DB
   - Edge cases (null, undefined, empty)
4. Usa describe() y it() descriptivos
5. Mínimo 80% cobertura de branches

## Output
Genera archivo {servicio}.spec.ts completo y ejecutable.
```

### Ejemplo Generado

```typescript
// quiniela.service.spec.ts (generado por Claude)
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { QuinielaService } from './quiniela.service';

describe('QuinielaService', () => {
  let service: QuinielaService;
  let mockQuinielaModel: any;

  beforeEach(async () => {
    mockQuinielaModel = {
      create: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      updateOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuinielaService,
        {
          provide: getModelToken('Quiniela'),
          useValue: mockQuinielaModel,
        },
      ],
    }).compile();

    service = module.get<QuinielaService>(QuinielaService);
  });

  describe('createQuiniela', () => {
    it('should create a quiniela successfully', async () => {
      const dto = { name: 'Mundial 2026', ownerId: 'user123' };
      mockQuinielaModel.create.mockResolvedValue({ _id: 'q1', ...dto });

      const result = await service.createQuiniela(dto);

      expect(result).toHaveProperty('_id');
      expect(mockQuinielaModel.create).toHaveBeenCalledWith(dto);
    });

    it('should throw error if name is empty', async () => {
      const dto = { name: '', ownerId: 'user123' };

      await expect(service.createQuiniela(dto))
        .rejects.toThrow('Name is required');
    });

    it('should throw error if ownerId is missing', async () => {
      const dto = { name: 'Test' } as any;

      await expect(service.createQuiniela(dto))
        .rejects.toThrow('Owner is required');
    });
  });

  describe('savePrediction', () => {
    it('should save prediction before match starts', async () => {
      // ... más tests
    });

    it('should reject prediction after match starts', async () => {
      // ... más tests
    });
  });
});
```

---

## Plan de Implementación: 3 Semanas

### Semana 1: Setup Maestro + Jest

| Día | Tarea | Comando |
|:---:|-------|---------|
| 1 | Instalar Maestro | `curl -Ls "https://get.maestro.mobile.dev" \| bash` |
| 1 | Instalar idb (iOS) | `brew tap facebook/fb && brew install idb-companion` |
| 2 | Crear estructura Flutter | `mkdir -p futbolify-app/.maestro/flows/{auth,quiniela,feed,smoke}` |
| 2 | Crear estructura Web | `mkdir -p futbolify-web-v2/.maestro/flows/{auth,quiniela}` |
| 3 | Crear flow login (App) | `maestro record .maestro/flows/auth/login.yaml` |
| 3 | Crear flow login (Web) | Copiar y adaptar para web |
| 4 | Crear smoke test | `.maestro/flows/smoke/critical_path.yaml` |
| 5 | Probar en CI local | `maestro test .maestro/flows/` |

### Semana 2: Tests Backend (Jest)

| Día | Módulo | Método |
|:---:|--------|--------|
| 1-2 | **Auth** | Claude Code genera tests |
| 3 | **Auth** | Revisar y ajustar |
| 4-5 | **Quiniela** | Claude Code genera tests |
| 5 | **Quiniela** | Revisar y ajustar |

```bash
# Prompt para Claude Code
"Lee src/auth/auth.service.ts y genera tests completos.
Incluye: signup, signin, googleSignin, validateJwt, logout.
Mockea Cognito y JWT. Cubre edge cases y errores."
```

### Semana 3: E2E Completo + CI/CD

| Día | Tarea | Plataforma |
|:---:|-------|:----------:|
| 1 | Crear flows de Quiniela | App + Web |
| 2 | Crear flows de Predicciones | App + Web |
| 3 | Crear flows de Feed | App |
| 4 | Configurar GitHub Actions | CI/CD |
| 5 | Dry run completo | Todo |

```bash
# Comandos Maestro esenciales
maestro record .maestro/flows/nuevo.yaml  # Grabar interactivo
maestro test .maestro/flows/              # Ejecutar todos
maestro studio                            # Debug visual
maestro test --platform web .maestro/     # Solo web
```

---

## Resumen de Comandos

### Maestro (E2E)

```bash
# Instalar
curl -Ls "https://get.maestro.mobile.dev" | bash

# Grabar un flow nuevo (interactivo)
maestro record .maestro/flows/auth/login.yaml

# Ejecutar tests
maestro test .maestro/flows/

# Debug visual
maestro studio

# Solo web
maestro test --platform web .maestro/flows/

# Con reporte
maestro test .maestro/flows/ --format html --output ./report
```

### Jest (Backend)

```bash
# Ejecutar tests
npm run test

# Con cobertura
npm run test:cov

# Watch mode
npm run test:watch

# Un archivo específico
npm test -- src/quiniela/quiniela.service.spec.ts
```

---

## Costos Reales

| Herramienta | Costo/mes | Uso |
|-------------|:---------:|-----|
| Claude API (tests) | ~$50-100 | Generar ~500 tests |
| **Maestro CLI** | Gratis | E2E testing (Web + Mobile) |
| Maestro Cloud (opcional) | ~$50 | Paralelo en cloud |
| Jest | Gratis | Unit tests backend |
| GitHub Actions | Gratis* | CI/CD (2000 min/mes) |
| Sentry | Gratis* | Error tracking (5K events) |
| **TOTAL** | **~$50-150/mes** | |

*Tiers gratuitos suficientes para MVP

---

## Métricas de Éxito

| Métrica | Actual | Target Semana 3 |
|---------|:------:|:---------------:|
| Cobertura unit tests | 8% | 60% |
| Tests E2E (Maestro) | 0 | 20+ |
| CI/CD | ❌ | ✅ |
| Tiempo de feedback | Manual | < 10 min |
| Bugs en prod | ? | Tracking activo |

---

## Implementación Práctica

### Fase 1: Setup (1 semana)

| Tarea | Herramienta | Status |
|-------|-------------|:------:|
| Integrar Claude Code | CLI / VS Code | ⏳ |
| **Setup Maestro** | E2E (Web + Mobile) | ⏳ |
| Configurar CI/CD | GitHub Actions | ⏳ |
| Setup Sentry | Error tracking | ⏳ |

### Fase 2: Generar Tests (2 semanas)

| Tarea | Herramienta |
|-------|-------------|
| Unit tests Backend | Jest + Claude |
| Unit tests Web | Jest + Claude |
| E2E tests (Web + Mobile) | **Maestro: `maestro record`** |
| API tests | Jest + Supertest |

### Fase 3: Agentes QA (2 semanas)

| Agente | Qué Hace | Frecuencia |
|--------|----------|:----------:|
| Web Crawler | Navega y reporta | Diario |
| API Tester | Prueba endpoints | Cada deploy |
| Visual Diff | Compara screenshots | Cada PR |
| Performance | Mide tiempos | Semanal |

### Fase 4: Monitoring AI (1 semana)

| Setup | Herramienta |
|-------|-------------|
| Error tracking | Sentry + Claude análisis |
| APM | Datadog AI |
| Logs | CloudWatch + Claude |
| Alertas | PagerDuty + AI triage |

---

## Workflow QA con IA (Día a Día)

```
Developer hace PR
        │
        ▼
┌───────────────────┐
│ GitHub Actions    │
│ ├─ Lint           │
│ ├─ Unit tests     │
│ ├─ Claude review  │◄── AI encuentra bugs
│ └─ Security scan  │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Claude Code       │
│ "¿Este PR tiene   │◄── AI sugiere más tests
│  edge cases?"     │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Deploy a Staging  │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Agente QA (AI)    │
│ ├─ Navega sitio   │
│ ├─ Prueba flujos  │◄── AI detecta problemas
│ ├─ Screenshots    │
│ └─ Reporta issues │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Human Review      │◄── Solo 1 persona revisa
│ (QA Lead)         │    reporte del AI
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Deploy a Prod     │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ AI Monitoring     │
│ ├─ Anomaly detect │◄── AI vigila 24/7
│ ├─ Auto-alerts    │
│ └─ Suggest fixes  │
└───────────────────┘
```

---

## Costo Mensual: IA vs Humanos

| Item | Humanos | Con IA |
|------|:-------:|:------:|
| QA Team (5 personas) | $16,500 | $0 |
| QA Lead (part-time) | $0 | $2,000 |
| DevOps (part-time) | $0 | $2,000 |
| Claude API | $0 | $200 |
| GitHub Copilot | $0 | $20 |
| Sentry | $0 | $30 |
| Datadog | $0 | $100 |
| Herramientas AI | $0 | $250 |
| **TOTAL** | **$16,500** | **$4,600** |

**Ahorro: $11,900/mes = $142,800/año** 💰

---

## Limitaciones de IA (Ser Realistas)

| IA NO puede... | Solución |
|----------------|----------|
| Probar en dispositivos físicos | 1 persona con devices |
| Entender contexto de negocio 100% | QA Lead humano define casos |
| Creatividad en edge cases raros | Humano piensa "¿qué haría un usuario loco?" |
| Testing de UX subjetivo | Humano valida "¿se siente bien?" |
| Decisión Go/No-Go | Humano toma decisión final |

---

## Recomendación Final

**Equipo Mínimo Viable con IA:**

| Rol | Dedicación | Responsabilidad |
|-----|:----------:|-----------------|
| **Tú** | Part-time | QA Lead, decisiones |
| **DevOps** | Part-time | Infra, monitoring |
| **Claude Code** | 24/7 | Genera tests, review |
| **Agentes AI** | 24/7 | QA automático |
| **AI Monitoring** | 24/7 | Detecta problemas |

**Inversión: ~$5,000/mes total (incluyendo herramientas)**

---

## Timeline QA Pre-Mundial

```
Ene 2026: Setup testing infrastructure
Feb 2026: Unit tests + Integration tests
Mar 2026: E2E tests + Load testing
Abr 2026: Dry runs + Bug fixes
May 2026: Final QA + Go/No-Go decision
Jun 2026: 🏆 MUNDIAL - War room 24/7
```

---

## Checklist Final Pre-Lanzamiento

### 2 Semanas Antes (Mayo 2026)

- [ ] App en App Store (aprobada)
- [ ] App en Play Store (aprobada)
- [ ] Web en produccion
- [ ] Quiniela Mundial creada
- [ ] Deep links testeados
- [ ] Push notifications testeadas
- [ ] Compartir funciona en todas las redes
- [ ] Load testing completado
- [ ] Monitoring configurado
- [ ] Plan de escalabilidad listo

### 1 Semana Antes

- [ ] Marketing campaign ready
- [ ] Influencers contactados
- [ ] Press release listo
- [ ] Social media calendar
- [ ] Support team ready
- [ ] Rollback plan

### Dia del Lanzamiento

- [ ] Quiniela Mundial abierta
- [ ] Push a todos los usuarios
- [ ] Social media posts
- [ ] Monitoreo 24/7
- [ ] War room activo

---

## Proximos Pasos Recomendados

### Sprint 1: Quinielas MVP (2-3 semanas)

| Tarea | Plataforma | Prioridad |
|-------|------------|:---------:|
| Completar UI quinielas | Web | 🔥 |
| Completar UI quinielas | App | 🔥 |
| Deep links funcionales | App | 🔥 |
| Compartir quiniela | Todos | 🔥 |

### Sprint 2: Viralidad (2 semanas)

| Tarea | Plataforma | Prioridad |
|-------|------------|:---------:|
| Invitar amigos | Todos | 🔥 |
| Compartir prediccion | Todos | 🔥 |
| Rankings globales | Backend + UI | 🔥 |

### Sprint 3: Polish (2 semanas)

| Tarea | Plataforma | Prioridad |
|-------|------------|:---------:|
| Apple Sign-in | App | Alta |
| Centro notificaciones | Web, App | Media |
| Seguidores basico | Backend + UI | Media |

---

## Metricas de Completitud

### Por Plataforma

| Plataforma | Features Totales | Listos | En Progreso | Pendientes |
|------------|:----------------:|:------:|:-----------:|:----------:|
| Backend | ~100 | 70 | 15 | 15 |
| Web | ~80 | 15 | 20 | 45 |
| App | ~90 | 40 | 20 | 30 |
| Telegram | ~25 | 18 | 3 | 4 |
| Slack | ~30 | 0 | 0 | 30 |

### Por Producto

| Producto | Features | Listos | % |
|----------|:--------:|:------:|:-:|
| Quinielas | 45 | 20 | 44% |
| Feed Social | 35 | 22 | 63% |
| Chat | 25 | 8 | 32% |
| SEO/Datos | 20 | 12 | 60% |
| Notificaciones | 30 | 18 | 60% |
| Perfil | 25 | 15 | 60% |
| Auth | 15 | 12 | 80% |

---

# MATRIZ DE FEATURES: QUE ESTA Y QUE FALTA

> Vista detallada del estado de cada feature en cada plataforma

## Leyenda Matriz

| Icono | Significado |
|-------|-------------|
| ✅ | Implementado y funcionando |
| 🚧 | En progreso / Parcial |
| ⏳ | Pendiente / No iniciado |
| ❌ | No aplica |
| 🔜 | Proxima prioridad |

---

## PRODUCTO 1: QUINIELAS

### Core Quinielas

| Feature | Backend | Web | App | Telegram | Slack |
|---------|:-------:|:---:|:---:|:--------:|:-----:|
| Crear quiniela | ✅ | ⏳ | ⏳ | ⏳ | ⏳ |
| Unirse a quiniela | ✅ | ⏳ | 🚧 | ✅ | ⏳ |
| Hacer predicciones | ✅ | ⏳ | 🚧 | ✅ | ⏳ |
| Editar predicciones | ✅ | ⏳ | ⏳ | ⏳ | ⏳ |
| Ver mis predicciones | ✅ | ⏳ | 🚧 | ✅ | ⏳ |
| Resultados automaticos | ✅ | ⏳ | ⏳ | ✅ | ⏳ |
| Leaderboard | ✅ | ⏳ | 🚧 | ✅ | ⏳ |
| Recordatorios | ✅ | ⏳ | ⏳ | ✅ | ⏳ |

### Rankings y Gamification

| Feature | Backend | Web | App | Telegram | Slack |
|---------|:-------:|:---:|:---:|:--------:|:-----:|
| Ranking global | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| Ranking semanal | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| Badges/Logros | ⏳ | ⏳ | ⏳ | ❌ | ❌ |
| Streaks (rachas) | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| Historial posiciones | ⏳ | ⏳ | ⏳ | ❌ | ❌ |

### Viralidad

| Feature | Backend | Web | App | Telegram | Slack |
|---------|:-------:|:---:|:---:|:--------:|:-----:|
| Invitar amigos | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| Compartir quiniela | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| Compartir prediccion | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| Deep links | ⏳ | ⏳ | 🚧 | ⏳ | ❌ |
| Challenge 1v1 | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |

### IA Quinielas

| Feature | Backend | Web | App | Telegram | Slack |
|---------|:-------:|:---:|:---:|:--------:|:-----:|
| Sugerencia prediccion | ✅ | ⏳ | ⏳ | ⏳ | ⏳ |
| Explicacion sugerencia | ✅ | ⏳ | ⏳ | ⏳ | ⏳ |
| Stats pre-partido | ✅ | ⏳ | ⏳ | ⏳ | ⏳ |

---

## PRODUCTO 2: FEED SOCIAL

### Core Feed

| Feature | Backend | Web | App | Telegram |
|---------|:-------:|:---:|:---:|:--------:|
| Ver feed principal | ✅ | 🚧 | ✅ | ❌ |
| Feed por quiniela | ⏳ | ⏳ | ⏳ | ❌ |
| Feed personalizado | ⏳ | ⏳ | ⏳ | ❌ |
| Scroll infinito | ✅ | 🚧 | ✅ | ❌ |

### Crear Contenido

| Feature | Backend | Web | App | Telegram |
|---------|:-------:|:---:|:---:|:--------:|
| Post texto | ✅ | 🚧 | ✅ | ❌ |
| Subir imagen | ✅ | 🚧 | ✅ | ❌ |
| Subir video | ✅ | 🚧 | ✅ | ❌ |
| Captura camara | ❌ | ❌ | ⏳ | ❌ |
| Video trimming | ❌ | ❌ | ⏳ | ❌ |
| Filtros imagen | ❌ | ❌ | ⏳ | ❌ |
| Filtros video | ❌ | ❌ | ⏳ | ❌ |
| Compresion media | ❌ | ❌ | ⏳ | ❌ |
| Menciones @usuario | ⏳ | ⏳ | ⏳ | ❌ |
| Hashtags | ⏳ | ⏳ | ⏳ | ❌ |

### Interaccion

| Feature | Backend | Web | App | Telegram |
|---------|:-------:|:---:|:---:|:--------:|
| Like/Clap | ✅ | 🚧 | ✅ | ❌ |
| Comentar | ✅ | 🚧 | ✅ | ❌ |
| Compartir interno | ⏳ | ⏳ | ⏳ | ❌ |
| Compartir externo | ⏳ | ⏳ | ⏳ | ⏳ |
| Guardar post | ⏳ | ⏳ | ⏳ | ❌ |
| Reportar | 🚧 | 🚧 | 🚧 | ❌ |

### Perfiles

| Feature | Backend | Web | App | Telegram |
|---------|:-------:|:---:|:---:|:--------:|
| Perfil publico | ✅ | 🚧 | ✅ | ❌ |
| Editar perfil | ✅ | 🚧 | ✅ | ❌ |
| Seguir usuario | ⏳ | ⏳ | ⏳ | ❌ |
| Lista seguidores | ⏳ | ⏳ | ⏳ | ❌ |
| Stats en perfil | ⏳ | ⏳ | ⏳ | ❌ |

---

## PRODUCTO 3: CHAT

### Chat por Partido

| Feature | Backend | Web | App | Telegram |
|---------|:-------:|:---:|:---:|:--------:|
| Chat en vivo | ✅ | ⏳ | 🚧 | ❌ |
| Reacciones rapidas | ⏳ | ⏳ | ⏳ | ❌ |
| Enviar GIFs | ⏳ | ⏳ | ⏳ | ❌ |
| Moderacion | ⏳ | ⏳ | ⏳ | ❌ |

### Chat por Quiniela

| Feature | Backend | Web | App | Telegram |
|---------|:-------:|:---:|:---:|:--------:|
| Chat grupal | 🚧 | ⏳ | 🚧 | ❌ |
| Compartir prediccion | ⏳ | ⏳ | ⏳ | ❌ |
| Bot resultados | ⏳ | ⏳ | ⏳ | ❌ |

### Mensajes Directos

| Feature | Backend | Web | App | Telegram |
|---------|:-------:|:---:|:---:|:--------:|
| DM a usuario | ⏳ | ⏳ | 🚧 | ❌ |
| Crear grupo | ⏳ | ⏳ | ⏳ | ❌ |
| Enviar imagen | ⏳ | ⏳ | ⏳ | ❌ |
| Visto/Leido | ⏳ | ⏳ | ⏳ | ❌ |

### Chat IA

| Feature | Backend | Web | App | Telegram |
|---------|:-------:|:---:|:---:|:--------:|
| Chat con IA | ✅ | ⏳ | ✅ | ❌ |
| Analisis partidos | ✅ | ⏳ | ✅ | ❌ |

---

## PRODUCTO 4: SEO Y DATOS (Solo Web)

### Paginas SEO

| Feature | Backend | Web | App |
|---------|:-------:|:---:|:---:|
| Landing home | ❌ | 🚧 | ❌ |
| Pagina /liga/:slug | ✅ | 🚧 | ❌ |
| Pagina /equipo/:slug | ✅ | 🚧 | ❌ |
| Pagina /partido/:id | ✅ | 🚧 | ❌ |
| Sitemap.xml | ❌ | 🚧 | ❌ |
| Schema.org | ❌ | ⏳ | ❌ |
| Meta tags dinamicos | ❌ | 🚧 | ❌ |

### Datos Deportivos

| Feature | Backend | Web | App |
|---------|:-------:|:---:|:---:|
| Standings ligas | ✅ | ⏳ | ⏳ |
| Stats partido | ✅ | ⏳ | ⏳ |
| H2H equipos | ✅ | ⏳ | ⏳ |
| Alineaciones | ✅ | ⏳ | ⏳ |
| Calendario partidos | ✅ | ⏳ | ⏳ |
| Partidos en vivo | ✅ | 🚧 | 🚧 |

---

## AUTENTICACION

| Feature | Backend | Web | App | Telegram |
|---------|:-------:|:---:|:---:|:--------:|
| Registro email | ✅ | 🚧 | ✅ | ❌ |
| Login email | ✅ | 🚧 | ✅ | ❌ |
| Login Google | ✅ | 🚧 | ✅ | ❌ |
| Login Apple | ⏳ | ⏳ | ⏳ | ❌ |
| Recuperar password | ✅ | ⏳ | ⏳ | ❌ |
| Confirmar email | ✅ | ⏳ | ⏳ | ❌ |
| Vincular Telegram | ✅ | ⏳ | ⏳ | ✅ |
| Vincular WhatsApp | ⏳ | ⏳ | ⏳ | ❌ |
| Biometrics (Face/Touch ID) | ❌ | ❌ | ⏳ | ❌ |
| Session management | ✅ | 🚧 | ✅ | ❌ |
| Logout | ✅ | 🚧 | ✅ | ❌ |
| Delete account | ✅ | ⏳ | ⏳ | ❌ |

---

## PERFIL DE USUARIO

### Perfil Basico

| Feature | Backend | Web | App | Telegram |
|---------|:-------:|:---:|:---:|:--------:|
| Ver mi perfil | ✅ | 🚧 | ✅ | ❌ |
| Editar nombre | ✅ | 🚧 | ✅ | ❌ |
| Editar username | ✅ | 🚧 | ✅ | ❌ |
| Editar bio | ✅ | 🚧 | ✅ | ❌ |
| Foto de perfil | ✅ | 🚧 | ✅ | ❌ |
| Cover/Banner | ⏳ | ⏳ | ⏳ | ❌ |
| Equipo favorito | ✅ | ⏳ | ✅ | ❌ |
| Pais/Ubicacion | ✅ | ⏳ | ✅ | ❌ |
| Fecha nacimiento | ✅ | ⏳ | ✅ | ❌ |

### Perfil Publico

| Feature | Backend | Web | App | Telegram |
|---------|:-------:|:---:|:---:|:--------:|
| Ver perfil de otro | ✅ | 🚧 | ✅ | ❌ |
| URL publica /@username | ✅ | 🚧 | ❌ | ❌ |
| Ver posts de usuario | ✅ | 🚧 | ✅ | ❌ |
| Ver quinielas de usuario | ⏳ | ⏳ | ⏳ | ❌ |
| Ver stats quinielas | ⏳ | ⏳ | ⏳ | ❌ |
| Ver badges/logros | ⏳ | ⏳ | ⏳ | ❌ |

### Social (Seguidores)

| Feature | Backend | Web | App | Telegram |
|---------|:-------:|:---:|:---:|:--------:|
| Seguir usuario | ⏳ | ⏳ | ⏳ | ❌ |
| Dejar de seguir | ⏳ | ⏳ | ⏳ | ❌ |
| Lista seguidores | ⏳ | ⏳ | ⏳ | ❌ |
| Lista siguiendo | ⏳ | ⏳ | ⏳ | ❌ |
| Contador seguidores | ⏳ | ⏳ | ⏳ | ❌ |
| Bloquear usuario | ⏳ | ⏳ | ⏳ | ❌ |
| Reportar usuario | 🚧 | 🚧 | 🚧 | ❌ |

### Verificacion y Badges

| Feature | Backend | Web | App | Telegram |
|---------|:-------:|:---:|:---:|:--------:|
| Badge verificado | ⏳ | ⏳ | ⏳ | ❌ |
| Badge experto quinielas | ⏳ | ⏳ | ⏳ | ❌ |
| Badge racha ganadora | ⏳ | ⏳ | ⏳ | ❌ |
| Badge early adopter | ⏳ | ⏳ | ⏳ | ❌ |
| Badge creador contenido | ⏳ | ⏳ | ⏳ | ❌ |

---

## NOTIFICACIONES

### Push Notifications

| Feature | Backend | Web | App | Telegram | Email |
|---------|:-------:|:---:|:---:|:--------:|:-----:|
| Infraestructura push | ✅ | ⏳ | ✅ | ❌ | ❌ |
| Registrar device token | ✅ | ⏳ | ✅ | ❌ | ❌ |
| Push basico | ✅ | ⏳ | ✅ | ❌ | ❌ |
| Rich notifications (imagen) | ✅ | ⏳ | ⏳ | ❌ | ❌ |
| Action buttons | ⏳ | ⏳ | ⏳ | ❌ | ❌ |
| Deep link en notif | ✅ | ⏳ | 🚧 | ❌ | ❌ |

### Local Notifications (Solo App)

| Feature | Backend | Web | App |
|---------|:-------:|:---:|:---:|
| Recordatorio local | ❌ | ❌ | ⏳ |
| Scheduled notification | ❌ | ❌ | ⏳ |
| Badge count (icono) | ❌ | ❌ | ⏳ |
| Notification channels | ❌ | ❌ | ⏳ |

### Tipos de Notificaciones

| Tipo | Backend | Web | App | Telegram | Email |
|------|:-------:|:---:|:---:|:--------:|:-----:|
| Recordatorio prediccion | ✅ | ⏳ | ⏳ | ✅ | ⏳ |
| Partido empieza | ⏳ | ⏳ | ⏳ | ⏳ | ❌ |
| Gol en partido seguido | ✅ | ⏳ | ⏳ | ⏳ | ❌ |
| Resultado final | ✅ | ⏳ | ⏳ | ✅ | ❌ |
| Cambio en ranking | ⏳ | ⏳ | ⏳ | ⏳ | ❌ |
| Nuevo seguidor | ⏳ | ⏳ | ⏳ | ❌ | ❌ |
| Mencion en comentario | ⏳ | ⏳ | ⏳ | ❌ | ❌ |
| Like en post | ⏳ | ⏳ | ⏳ | ❌ | ❌ |
| Nuevo comentario | ⏳ | ⏳ | ⏳ | ❌ | ❌ |
| Invitacion quiniela | ✅ | ⏳ | ⏳ | ✅ | ⏳ |
| Resumen diario | ✅ | ❌ | ❌ | ✅ | ⏳ |
| Resumen semanal | ✅ | ❌ | ❌ | ⏳ | ⏳ |

### Centro de Notificaciones (In-App)

| Feature | Backend | Web | App | Telegram |
|---------|:-------:|:---:|:---:|:--------:|
| Lista notificaciones | ⏳ | ⏳ | 🚧 | ❌ |
| Marcar como leida | ⏳ | ⏳ | 🚧 | ❌ |
| Marcar todas leidas | ⏳ | ⏳ | ⏳ | ❌ |
| Eliminar notificacion | ⏳ | ⏳ | ⏳ | ❌ |
| Filtrar por tipo | ⏳ | ⏳ | ⏳ | ❌ |
| Badge contador no leidas | ⏳ | ⏳ | 🚧 | ❌ |

### Preferencias de Notificaciones

| Feature | Backend | Web | App | Telegram |
|---------|:-------:|:---:|:---:|:--------:|
| UI preferencias | ✅ | ⏳ | ⏳ | ❌ |
| On/Off por tipo | ✅ | ⏳ | ⏳ | ❌ |
| On/Off por canal (push/email/tg) | ✅ | ⏳ | ⏳ | ❌ |
| Horario silencio | ⏳ | ⏳ | ⏳ | ❌ |
| Frecuencia resumenes | ⏳ | ⏳ | ⏳ | ⏳ |

---

## FEATURES NATIVOS APP (Solo Flutter)

| Feature | Status | Prioridad | Notas |
|---------|:------:|:---------:|-------|
| **CAMARA** |
| Captura foto | ⏳ | Alta | Para stories/posts |
| Captura video | ⏳ | Alta | Para feed |
| Galeria picker | ✅ | - | Ya funciona |
| **EDICION** |
| Crop imagen | ⏳ | Media | |
| Filtros imagen | ⏳ | Media | Instagram-style |
| Video trimming | ⏳ | Alta | Cortar antes de subir |
| Video filtros | ⏳ | Baja | |
| Compresion | ⏳ | Alta | Reducir tamano |
| **WIDGETS** |
| Widget partidos hoy | ⏳ | Media | iOS + Android |
| Widget mi ranking | ⏳ | Baja | |
| Live Activities | ⏳ | Baja | iOS 16+ |
| **SEGURIDAD** |
| Face ID | ⏳ | Media | iOS |
| Touch ID | ⏳ | Media | iOS legacy |
| Fingerprint | ⏳ | Media | Android |
| App lock | ⏳ | Baja | |
| **OFFLINE** |
| Cache datos | ⏳ | Alta | SQLite/Hive |
| Sync queue | ⏳ | Media | |
| Image cache | 🚧 | - | Parcial |
| **DEEP LINKS** |
| Universal links | 🚧 | Alta | futbolify.com |
| App links | 🚧 | Alta | Android |
| Dynamic links | ⏳ | Alta | Firebase |
| Share extension | ⏳ | Media | |
| **OTROS** |
| Haptic feedback | ⏳ | Baja | Vibracion goles |
| Calendar integration | ⏳ | Baja | Agregar partido |
| Contacts access | ⏳ | Media | Invitar amigos |

---

## FEATURES SOLO WEB

| Feature | Status | Prioridad | Notas |
|---------|:------:|:---------:|-------|
| **PWA** |
| Service Worker | ⏳ | Media | Offline basico |
| Web Push | ⏳ | Media | Notificaciones browser |
| Install prompt | ⏳ | Baja | "Agregar a inicio" |
| **SEO** |
| SSR/SSG | 🚧 | Alta | Next.js App Router |
| Meta tags | 🚧 | Alta | OG tags |
| Sitemap | 🚧 | Alta | Auto-generado |
| Schema.org | ⏳ | Media | Rich snippets |
| **ADMIN** |
| Dashboard analytics | ⏳ | Media | |
| User management | ⏳ | Media | |
| Content moderation | ⏳ | Media | |
| System health | ⏳ | Alta | Logs, status |
| **UI WEB** |
| Keyboard shortcuts | ⏳ | Baja | |
| Multi-tab support | ⏳ | Baja | |
| Drag & drop | ⏳ | Baja | |

---

## INTEGRACIONES B2B (Slack, Teams, etc.)

| Feature | Slack | MS Teams | Google Chat | Discord |
|---------|:-----:|:--------:|:-----------:|:-------:|
| App oficial | ⏳ | ⏳ | ⏳ | ⏳ |
| Slash commands | ⏳ | ⏳ | ⏳ | ⏳ |
| Crear quiniela | ⏳ | ⏳ | ⏳ | ⏳ |
| Hacer predicciones | ⏳ | ⏳ | ⏳ | ⏳ |
| Leaderboard | ⏳ | ⏳ | ⏳ | ⏳ |
| Alertas automaticas | ⏳ | ⏳ | ⏳ | ⏳ |
| Dashboard admin | ⏳ | ⏳ | ⏳ | ⏳ |
| SSO enterprise | ❌ | ⏳ | ⏳ | ❌ |

---

## RESUMEN RAPIDO POR PLATAFORMA

### Backend - Estado General: ✅ 80% Core Listo

| Area | Status | Pendiente |
|------|--------|-----------|
| Auth | ✅ | Apple Sign-in |
| Quinielas | ✅ | Rankings globales |
| Feed | ✅ | Seguidores, hashtags |
| Chat | 🚧 | DMs, grupos |
| Notificaciones | ✅ | Preferencias UI |
| Partidos | ✅ | - |
| SEO Data | ✅ | - |
| Betting | ✅ | - |

### Web - Estado General: 🚧 30% Implementado

| Area | Status | Pendiente |
|------|--------|-----------|
| Auth | 🚧 | Completar flujo |
| Quinielas | ⏳ | Todo el UI |
| Feed | 🚧 | Interacciones |
| Chat | ⏳ | Todo |
| SEO | 🚧 | Contenido paginas |
| Admin | ⏳ | Todo |
| PWA | ⏳ | Todo |

### App Flutter - Estado General: 🚧 50% Implementado

| Area | Status | Pendiente |
|------|--------|-----------|
| Auth | ✅ | Apple Sign-in |
| Quinielas | 🚧 | Completar UI/API |
| Feed | ✅ | Seguidores |
| Chat | 🚧 | Completar |
| Notificaciones | ✅ | Local notifs |
| Nativos | ⏳ | Camara, edicion, widgets |
| Offline | ⏳ | Todo |

### Telegram - Estado General: ✅ 70% Listo

| Area | Status | Pendiente |
|------|--------|-----------|
| Quinielas Bot | ✅ | Comandos grupo |
| Betting Bot | ✅ | - |
| Vincular cuenta | ✅ | - |

---

## Productos por Prioridad

| # | Producto | Descripcion | Objetivo |
|---|----------|-------------|----------|
| 1 | **QUINIELAS** | Sistema de predicciones, mejor UI/UX, viral y proactivo | Core principal - Retention & Engagement |
| 2 | **FEED SOCIAL** | Contenido propio (videos, imagenes), rankings, integracion quinielas | Comunidad & UGC |
| 3 | **CHAT** | Mensajeria tipo Telegram/WhatsApp para interaccion | Engagement & Stickiness |
| 4 | **SEO/DATOS** | Tablas, estadisticas tipo SofaScore (Solo Web) | Adquisicion organica |

## Estrategia de Mercado

| Segmento | Descripcion | Plataformas | Modelo |
|----------|-------------|-------------|--------|
| **B2C** | Usuarios individuales, grupos de amigos | Web, App, Telegram, WhatsApp | Freemium + Ads |
| **B2B** | Oficinas, team building, empresas | Slack, MS Teams, Google Chat | SaaS (Pro/Enterprise) |

> **Nota**: El producto B2B (integraciones workplace) es el path a monetizacion. Las quinielas como herramienta de team building para empresas.

---

## Leyenda

| Simbolo | Significado |
|---------|-------------|
| ✅ | Completado |
| 🚧 | En progreso |
| ⏳ | Planificado |
| ❌ | No aplica para esta plataforma |
| 🔜 | Siguiente prioridad |

---

## Plataformas

### Core

| Codigo | Plataforma | Descripcion |
|--------|------------|-------------|
| **BE** | Backend | NestJS + GraphQL + MongoDB |
| **WEB** | Web App | Frontend Web + PWA + Full Responsive |
| **APP** | Mobile App | Flutter (Android + iOS) |

### B2C (Usuarios)

| Codigo | Plataforma | Target | Status |
|--------|------------|--------|--------|
| **TG** | Telegram | Usuarios, grupos amigos | ✅ Core |
| **WA** | WhatsApp | LATAM, Europa | ⏳ Q4 2025 |

### B2B (Team Building - PRO)

| Codigo | Plataforma | Target | Status |
|--------|------------|--------|--------|
| **SL** | Slack | Startups, tech companies | ⏳ Q3 2025 |
| **Teams** | Microsoft Teams | Corporativos, enterprise | ⏳ Q4 2025 |
| **GChat** | Google Chat | Google Workspace users | ⏳ 2026 |
| **DC** | Discord | Gaming, tech communities | ⏳ 2026 |

### Otros

| Codigo | Plataforma | Descripcion |
|--------|------------|-------------|
| **EM** | Email | Notificaciones por correo |

---

# FEATURES ESPECIFICOS POR PLATAFORMA

> Cada plataforma tiene features unicos que no existen en otras. Esta seccion detalla que es exclusivo de cada una.

---

## BACKEND (Core - Manda Todo)

> El backend es el cerebro. Toda la logica de negocio vive aqui.

### APIs y Logica de Negocio

| Feature | Status | Descripcion |
|---------|--------|-------------|
| GraphQL API | ✅ | API principal para Web/App |
| REST API | ⏳ | Para integraciones 3rd party |
| WebSocket/Subscriptions | ✅ | Real-time updates |
| Auth (Cognito + JWT) | ✅ | Autenticacion centralizada |

### Servicios Core

| Servicio | Status | Descripcion |
|----------|--------|-------------|
| QuinielaService | ✅ | Logica de quinielas |
| UserService | ✅ | Gestion usuarios |
| MatchService | ✅ | Datos de partidos |
| NotificationService | ✅ | Dispatcher multi-canal |
| FeedService | ✅ | Logica del feed |
| ChatService | ✅ | Firebase RT wrapper |

### Integraciones APIs Externas

| API | Status | Uso |
|-----|--------|-----|
| API-Football | ✅ | Datos partidos, stats |
| Football-Data.org | ✅ | Backup API gratuita |
| The Odds API | ✅ | Cuotas (betting) |
| OpenAI | ✅ | Predicciones IA |
| Anthropic | ✅ | Goal-Guru analysis |
| Open-Meteo | ✅ | Clima partidos |

### Cron Jobs y Workers

| Job | Status | Frecuencia | Descripcion |
|-----|--------|------------|-------------|
| MatchEventsScheduler | ✅ | 60 seg | Detectar goles en vivo |
| ResultCollectorCron | ✅ | Post-partido | Actualizar resultados |
| ReminderCron | ✅ | Pre-partido | Enviar recordatorios |
| LeaderboardCron | ⏳ | Diario | Calcular rankings |
| DailySummaryCron | ✅ | 23:00 | Resumen del dia |
| WeeklyReportCron | ✅ | Lunes | Reporte semanal |

### Queues y Background Jobs

| Queue | Status | Uso |
|-------|--------|-----|
| NotificationQueue | ✅ | Push, Email, Telegram async |
| MediaProcessingQueue | ⏳ | Procesar videos/imagenes |
| AnalyticsQueue | ⏳ | Eventos analytics |

---

## WEB APP (PWA + Responsive)

> Features especificos de la web que no aplican a mobile o integraciones.

### PWA Features

| Feature | Status | Descripcion |
|---------|--------|-------------|
| Service Worker | ⏳ | Offline basico |
| Web Push | ⏳ | Notificaciones browser |
| Install prompt | ⏳ | "Agregar a inicio" |
| Offline cache | ⏳ | Cache de datos |
| Background sync | ⏳ | Sync cuando hay conexion |

### SEO (Solo Web)

| Feature | Status | Descripcion |
|---------|--------|-------------|
| SSR/SSG | ⏳ | Server-side rendering |
| Meta tags dinamicos | ⏳ | OG tags por pagina |
| Sitemap.xml | ⏳ | Auto-generado |
| Schema.org | ⏳ | Rich snippets Google |
| Canonical URLs | ⏳ | SEO best practices |
| robots.txt | ⏳ | Indexacion controlada |

### Landing Pages SEO

| Pagina | Status | URL Pattern |
|--------|--------|-------------|
| Home | ⏳ | / |
| Liga | ⏳ | /liga/:slug |
| Equipo | ⏳ | /equipo/:slug |
| Partido | ⏳ | /partido/:id |
| Jugador | ⏳ | /jugador/:slug |
| Quiniela publica | ⏳ | /quiniela/:code |

### Admin Dashboard (Solo Web)

| Feature | Status | Descripcion |
|---------|--------|-------------|
| Dashboard analytics | ⏳ | Metricas generales |
| User management | ⏳ | CRUD usuarios |
| Content moderation | ⏳ | Revisar reportes |
| Quiniela management | ⏳ | Admin quinielas |
| System health | ⏳ | Logs, status APIs |
| Billing (B2B) | ⏳ | Gestion suscripciones |

### Web-Specific UI

| Feature | Status | Descripcion |
|---------|--------|-------------|
| Keyboard shortcuts | ⏳ | Navegacion rapida |
| Multi-tab support | ⏳ | Varias pestanas |
| Print styles | ⏳ | Imprimir quinielas |
| Drag & drop | ⏳ | Reordenar predicciones |
| Context menus | ⏳ | Click derecho |

---

## FLUTTER APP (Android + iOS)

> Features nativos que solo existen en la app mobile. NO dependen del backend.

### Camara y Media (Nativo)

| Feature | Status | Descripcion |
|---------|--------|-------------|
| Captura foto | ⏳ | Camara nativa |
| Captura video | ⏳ | Grabar video |
| Galeria picker | ⏳ | Seleccionar de galeria |
| Crop/Resize imagen | ⏳ | Edicion basica local |
| Filtros imagen | ⏳ | Filtros tipo Instagram |
| Video trimming | ⏳ | Cortar video local |
| Video filters | ⏳ | Efectos en video |
| Compresion media | ⏳ | Reducir tamano antes de subir |
| Multi-select media | ⏳ | Seleccionar varios |

### Edicion de Contenido (Nativo)

| Feature | Status | Descripcion |
|---------|--------|-------------|
| Editor de stories | ⏳ | Agregar texto, stickers |
| Templates visuales | ⏳ | Plantillas para compartir |
| Prediccion como imagen | ⏳ | Generar imagen de prediccion |
| Resultado como imagen | ⏳ | "Acerte!" para compartir |
| Collage maker | ⏳ | Combinar imagenes |
| GIF creator | ⏳ | Crear GIFs |

### Notificaciones (Nativo)

| Feature | Status | Descripcion |
|---------|--------|-------------|
| Firebase Push | ✅ | Push notifications |
| Local notifications | ⏳ | Recordatorios locales |
| Notification channels | ⏳ | Android channels |
| Rich notifications | ⏳ | Con imagen, botones |
| Notification actions | ⏳ | Acciones directas |
| Scheduled notifications | ⏳ | Programar localmente |
| Badge count | ⏳ | Numero en icono app |

### Widgets (Solo Mobile)

| Feature | Status | Descripcion |
|---------|--------|-------------|
| Widget partidos hoy | ⏳ | iOS/Android widget |
| Widget mi posicion | ⏳ | Ranking en widget |
| Widget proximo partido | ⏳ | Countdown |
| Live Activities (iOS) | ⏳ | Partido en vivo Dynamic Island |
| Glance (watchOS) | ⏳ | Apple Watch |

### Biometrics y Seguridad

| Feature | Status | Descripcion |
|---------|--------|-------------|
| Face ID / Touch ID | ⏳ | Login biometrico |
| Fingerprint Android | ⏳ | Login biometrico |
| Secure storage | ⏳ | Keychain/Keystore |
| App lock | ⏳ | Bloquear app |

### Offline y Performance

| Feature | Status | Descripcion |
|---------|--------|-------------|
| Offline mode | ⏳ | Ver datos sin conexion |
| Local database | ⏳ | SQLite/Hive cache |
| Sync queue | ⏳ | Cola de acciones offline |
| Prefetch data | ⏳ | Precargar partidos |
| Image caching | ⏳ | Cache de imagenes |
| Lazy loading | ⏳ | Cargar bajo demanda |

### Deep Links y Sharing

| Feature | Status | Descripcion |
|---------|--------|-------------|
| Universal links (iOS) | ⏳ | futbolify.com/... abre app |
| App links (Android) | ⏳ | Same |
| Share extension | ⏳ | Compartir a Futbolify |
| Share sheet nativo | ⏳ | Compartir desde app |
| Dynamic links | ⏳ | Firebase Dynamic Links |
| Deferred deep links | ⏳ | Link -> Store -> App -> Content |

### Integraciones Nativas

| Feature | Status | Descripcion |
|---------|--------|-------------|
| Calendar integration | ⏳ | Agregar partido a calendario |
| Contacts access | ⏳ | Invitar de contactos |
| Location (opcional) | ⏳ | Timezone auto |
| Haptic feedback | ⏳ | Vibracion en goles |
| Sound effects | ⏳ | Sonidos celebracion |

### Platform Specific

#### iOS Only

| Feature | Status | Descripcion |
|---------|--------|-------------|
| Sign in with Apple | ⏳ | Requerido por Apple |
| App Clips | ⏳ | Mini experiencia sin instalar |
| Siri Shortcuts | ⏳ | "Hey Siri, mis predicciones" |
| Focus modes | ⏳ | Filtrar notifs por modo |
| SharePlay | ⏳ | Ver partido juntos |

#### Android Only

| Feature | Status | Descripcion |
|---------|--------|-------------|
| Material You theming | ⏳ | Colores dinamicos Android 12+ |
| Predictive back | ⏳ | Gesto Android 14+ |
| Split screen | ⏳ | Multi-window |
| PiP (Picture in Picture) | ⏳ | Video flotante |
| Google Assistant | ⏳ | Integracion asistente |

### Accessibility

| Feature | Status | Descripcion |
|---------|--------|-------------|
| VoiceOver (iOS) | ⏳ | Screen reader |
| TalkBack (Android) | ⏳ | Screen reader |
| Dynamic text size | ⏳ | Respetar font size sistema |
| High contrast | ⏳ | Modo alto contraste |
| Reduce motion | ⏳ | Menos animaciones |

---

## COMPARATIVA: QUE VA DONDE

### Features que van en TODAS las plataformas (via Backend)

| Feature | BE | WEB | APP | Bots |
|---------|:--:|:---:|:---:|:----:|
| Crear/unirse quiniela | ✅ | ✅ | ✅ | ✅ |
| Hacer predicciones | ✅ | ✅ | ✅ | ✅ |
| Ver leaderboard | ✅ | ✅ | ✅ | ✅ |
| Notificaciones | ✅ | ✅ | ✅ | ✅ |
| Perfil usuario | ✅ | ✅ | ✅ | ❌ |

### Features SOLO WEB

| Feature | Razon |
|---------|-------|
| SEO pages | Solo navegadores indexan |
| Admin dashboard | Pantalla grande necesaria |
| PWA install | Concepto web |
| Keyboard shortcuts | No hay teclado en mobile |

### Features SOLO APP

| Feature | Razon |
|---------|-------|
| Camara/Video | Hardware nativo |
| Push nativas | Mejor experiencia |
| Widgets | OS feature |
| Biometrics | Hardware seguro |
| Offline mode | Conexion variable |
| Deep links nativos | OS integration |
| Edicion media | GPU local |

### Features SOLO BOTS (Telegram, Slack, etc.)

| Feature | Razon |
|---------|-------|
| Comandos slash | UI de bots |
| Inline buttons | Interaccion rapida |
| Alertas en canal | Notificacion grupal |
| Integracion workspace | Contexto de equipo |

---

# PRODUCTO 1: QUINIELAS (Core Principal)

> Objetivo: Mejor UI/UX del mercado, sistema proactivo que genera viralidad

## 1.1 Core Quinielas

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Crear quiniela publica | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | |
| Crear quiniela privada | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | Invitacion por link |
| Unirse a quiniela | ✅ | ⏳ | ⏳ | ✅ | ⏳ | ⏳ | ⏳ | ❌ | |
| Hacer predicciones | ✅ | ⏳ | ⏳ | ✅ | ⏳ | ⏳ | ⏳ | ❌ | |
| Editar predicciones | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | Antes del partido |
| Ver mis predicciones | ✅ | ⏳ | ⏳ | ✅ | ⏳ | ⏳ | ⏳ | ❌ | |
| Resultados automaticos | ✅ | ⏳ | ⏳ | ✅ | ⏳ | ⏳ | ⏳ | ❌ | API-Football |

## 1.2 Leaderboard y Rankings

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Leaderboard por quiniela | ✅ | ⏳ | ⏳ | ✅ | ⏳ | ⏳ | ⏳ | ❌ | |
| Leaderboard global | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | Todos los usuarios |
| Ranking semanal | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | |
| Ranking mensual | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | |
| Historial de posiciones | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | Grafico de evolucion |
| Badges/Logros | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | Gamification |
| Streaks (rachas) | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | |

## 1.3 Sistema Proactivo (Viralidad)

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Invitar amigos | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | Deep links |
| Compartir quiniela | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | Social share |
| Compartir prediccion | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | Story/Post |
| Compartir resultado | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | "Acerte X!" |
| Notificar cuando amigo se une | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | |
| Notificar cuando te superan | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | Engagement |
| Challenge a amigo | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | 1v1 |
| Retar en redes sociales | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | Twitter/IG |

## 1.4 Recordatorios y Alertas

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Recordatorio hacer prediccion | ✅ | ⏳ | ⏳ | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | Antes que cierre |
| Alerta partido empieza | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | |
| Alerta gol en partido seguido | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | Real-time |
| Alerta resultado final | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | Con puntos ganados |
| Resumen diario puntos | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | |
| Resumen semanal | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | |

## 1.5 IA y Predicciones Asistidas

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Sugerencia prediccion IA | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | OpenAI |
| Explicacion de sugerencia | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | |
| Stats relevantes pre-partido | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | H2H, forma |
| Confianza de prediccion | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | % confianza |

## 1.6 Quinielas Especiales

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Quiniela Mundial 2026 | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | Prioridad alta |
| Quiniela Champions League | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | |
| Quiniela por jornada liga | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | Liga MX, LaLiga, etc |
| Quiniela personalizada | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | Usuario elige partidos |

---

# PRODUCTO 2: FEED SOCIAL

> Objetivo: Comunidad donde usuarios comparten contenido propio, integrado con quinielas

## 2.1 Core Feed

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Ver feed principal | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Feed por quiniela | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Feed por equipo | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Feed personalizado | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | Algoritmo |

## 2.2 Crear Contenido

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Crear post texto | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Subir imagen | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | Bunny CDN |
| Subir video | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | Bunny Stream |
| Subir desde camara | ❌ | ❌ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | App only |
| Mencionar usuarios | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | @usuario |
| Hashtags | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | #tema |
| Vincular a partido | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Vincular a quiniela | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |

## 2.3 Interaccion

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Like/Reaccion | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Comentar | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Responder comentario | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | Threads |
| Compartir interno | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | Repost |
| Compartir externo | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ❌ | Redes sociales |
| Guardar post | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | Bookmarks |
| Reportar contenido | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | Moderacion |

## 2.4 Perfiles y Seguidores

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Perfil publico | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Seguir usuario | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Lista seguidores | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Lista siguiendo | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Stats en perfil | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | Quinielas, aciertos |
| Badges en perfil | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |

## 2.5 Integracion con Rankings

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Post automatico al acertar | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | Opt-in |
| Post automatico top ranking | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Celebrar logro | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Ver predicciones de otros | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | Despues del partido |

---

# PRODUCTO 3: CHAT

> Objetivo: Interaccion en tiempo real, similar a Telegram/WhatsApp

## 3.1 Chat por Partido

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Chat en vivo por partido | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | Firebase RT |
| Reacciones rapidas | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | Gol!, etc |
| Enviar GIFs | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Enviar stickers | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Mencionar usuarios | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Moderacion | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |

## 3.2 Chat por Quiniela

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Chat grupal quiniela | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Notificar en grupo | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Compartir prediccion | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Bot automatico resultados | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |

## 3.3 Mensajes Directos

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| DM a usuario | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Crear grupo | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Enviar imagen | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Enviar audio | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Visto/Leido | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Typing indicator | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |

## 3.4 Funciones Tipo WhatsApp

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Estados/Stories | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | 24h |
| Responder mensaje | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | Quote |
| Reenviar mensaje | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Eliminar mensaje | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Buscar en chat | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |

---

# PRODUCTO 4: SEO Y DATOS (Solo Web)

> Objetivo: Adquisicion organica, tablas y stats tipo SofaScore

## 4.1 Paginas SEO

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Landing page SEO | ❌ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Pagina por liga | ✅ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | /liga/laliga |
| Pagina por equipo | ✅ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | /equipo/barcelona |
| Pagina por partido | ✅ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | /partido/123 |
| Pagina por jugador | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Sitemap dinamico | ❌ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Schema.org markup | ❌ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Rich snippets |

## 4.2 Tablas de Posiciones

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Standings por liga | ✅ | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | |
| Tabla local/visitante | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Forma ultimos 5 | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Goles a favor/contra | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Diferencia de goles | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Historico standings | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | |

## 4.3 Estadisticas de Partido

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Stats en vivo | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | Posesion, tiros, etc |
| Timeline eventos | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Alineaciones | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Cambios | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Tarjetas | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Corners | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Head to Head | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |

## 4.4 Estadisticas de Equipo

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Info general equipo | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Plantilla | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Proximos partidos | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Ultimos resultados | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Goleadores | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Asistidores | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |

## 4.5 Calendario

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Partidos del dia | ✅ | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | |
| Partidos en vivo | ✅ | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | |
| Calendario por liga | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Calendario por equipo | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Filtros fecha | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |

---

# INTEGRACIONES DE MENSAJERIA

## Estrategia de Mercado

| Segmento | Plataformas | Target | Modelo |
|----------|-------------|--------|--------|
| **B2C** | Telegram, WhatsApp | Usuarios individuales, grupos de amigos | Freemium |
| **B2B** | Slack, MS Teams, Google Chat, Discord | Oficinas, equipos de trabajo, empresas | Pro/Enterprise |

---

## B2C: TELEGRAM (Core - Usuarios)

> Integracion principal para usuarios individuales y grupos de amigos

| Feature | BE | TG | Notas |
|---------|:--:|:--:|-------|
| Bot de Quinielas | ✅ | ✅ | @FutbolifyBot |
| Crear quiniela desde chat | ✅ | ✅ | |
| Unirse a quiniela | ✅ | ✅ | Via deep link |
| Hacer predicciones | ✅ | ✅ | Inline buttons |
| Ver leaderboard | ✅ | ✅ | |
| Recordatorios | ✅ | ✅ | Antes de cierre |
| Notificar resultados | ✅ | ✅ | |
| Vincular cuenta web/app | ✅ | ✅ | PlatformLink |
| Comandos grupo | ✅ | ✅ | /quiniela, /ranking |
| Bot inline (compartir) | ⏳ | ⏳ | @FutbolifyBot partido |
| Mini App Telegram | ⏳ | ⏳ | WebApp dentro de TG |

## B2C: WHATSAPP

> Para mercados donde WhatsApp es dominante (LATAM, Europa)

| Feature | BE | WA | Notas |
|---------|:--:|:--:|-------|
| Bot WhatsApp Business | ⏳ | ⏳ | API oficial |
| Crear quiniela | ⏳ | ⏳ | |
| Unirse a quiniela | ⏳ | ⏳ | Via link |
| Hacer predicciones | ⏳ | ⏳ | Menus interactivos |
| Ver leaderboard | ⏳ | ⏳ | |
| Recordatorios | ⏳ | ⏳ | |
| Notificar resultados | ⏳ | ⏳ | |
| Grupos WhatsApp | ⏳ | ⏳ | Bot en grupos |

---

## B2B: SLACK (Pro - Team Building)

> Target: Oficinas, startups, empresas tech. Quinielas como herramienta de team building.

### Core Slack App

| Feature | BE | SL | Notas |
|---------|:--:|:--:|-------|
| Slack App oficial | ⏳ | ⏳ | Slack App Directory |
| OAuth workspace install | ⏳ | ⏳ | Admin instala |
| Slash commands | ⏳ | ⏳ | /quiniela, /predict |
| Interactive messages | ⏳ | ⏳ | Buttons, modals |
| Channel integration | ⏳ | ⏳ | #futbol, #quiniela |
| Home tab | ⏳ | ⏳ | Dashboard en Slack |
| Shortcuts | ⏳ | ⏳ | Acciones rapidas |

### Comandos Slack

| Comando | Descripcion | Status |
|---------|-------------|--------|
| `/quiniela create` | Crear nueva quiniela del equipo | ⏳ |
| `/quiniela join [code]` | Unirse a quiniela | ⏳ |
| `/quiniela predict` | Hacer predicciones (modal) | ⏳ |
| `/quiniela standings` | Ver ranking del equipo | ⏳ |
| `/quiniela matches` | Ver partidos disponibles | ⏳ |
| `/quiniela remind` | Activar recordatorios | ⏳ |
| `/quiniela stats` | Estadisticas personales | ⏳ |
| `/quiniela leaderboard` | Top del workspace | ⏳ |

### Features Team Building

| Feature | BE | SL | Notas |
|---------|:--:|:--:|-------|
| Quiniela por workspace | ⏳ | ⏳ | Toda la oficina |
| Quiniela por channel | ⏳ | ⏳ | #marketing vs #engineering |
| Quiniela cross-channel | ⏳ | ⏳ | Competencia entre equipos |
| Leaderboard semanal auto | ⏳ | ⏳ | Post automatico lunes |
| Celebrar ganador | ⏳ | ⏳ | Mensaje especial |
| Trash talk mode | ⏳ | ⏳ | Mensajes de banter |
| Integracion HR | ⏳ | ⏳ | Reportes engagement |
| Modo torneo | ⏳ | ⏳ | Brackets, eliminacion |
| Premios virtuales | ⏳ | ⏳ | Badges, trofeos |
| Racha del mes | ⏳ | ⏳ | Empleado del mes futbolero |

### Admin Workspace

| Feature | BE | SL | Notas |
|---------|:--:|:--:|-------|
| Dashboard admin | ⏳ | ⏳ | Para HR/Admin |
| Gestionar quinielas | ⏳ | ⏳ | |
| Ver participacion | ⏳ | ⏳ | Metricas engagement |
| Configurar recordatorios | ⏳ | ⏳ | |
| Exportar reportes | ⏳ | ⏳ | CSV, PDF |
| Billing por workspace | ⏳ | ⏳ | Plan Pro |

---

## B2B: MICROSOFT TEAMS (Enterprise)

> Target: Corporativos, empresas grandes, gobierno

### Core Teams App

| Feature | BE | Teams | Notas |
|---------|:--:|:-----:|-------|
| Teams App oficial | ⏳ | ⏳ | AppSource |
| Admin consent | ⏳ | ⏳ | IT Admin aprueba |
| Bot conversacional | ⏳ | ⏳ | |
| Tabs | ⏳ | ⏳ | Tab en canal |
| Message extensions | ⏳ | ⏳ | |
| Adaptive Cards | ⏳ | ⏳ | UI rica |
| Meeting extension | ⏳ | ⏳ | Quiniela en reuniones |

### Comandos Teams

| Comando | Descripcion | Status |
|---------|-------------|--------|
| `@Futbolify create` | Crear quiniela | ⏳ |
| `@Futbolify predict` | Hacer predicciones | ⏳ |
| `@Futbolify standings` | Ver ranking | ⏳ |
| `@Futbolify matches` | Partidos del dia | ⏳ |
| `@Futbolify help` | Ayuda | ⏳ |

### Features Enterprise

| Feature | BE | Teams | Notas |
|---------|:--:|:-----:|-------|
| SSO con Azure AD | ⏳ | ⏳ | Single Sign-On |
| Compliance/GDPR | ⏳ | ⏳ | Data residency |
| Auditoria | ⏳ | ⏳ | Logs para IT |
| Multi-tenant | ⏳ | ⏳ | |
| Private cloud | ⏳ | ⏳ | On-premise option |
| SLA enterprise | ⏳ | ⏳ | 99.9% uptime |
| Soporte dedicado | ⏳ | ⏳ | |

---

## B2B: GOOGLE CHAT / WORKSPACE

> Target: Empresas en ecosistema Google

| Feature | BE | GChat | Notas |
|---------|:--:|:-----:|-------|
| Google Chat App | ⏳ | ⏳ | Marketplace |
| Slash commands | ⏳ | ⏳ | |
| Cards | ⏳ | ⏳ | UI interactiva |
| Spaces integration | ⏳ | ⏳ | |
| Google Calendar | ⏳ | ⏳ | Recordatorios |
| SSO Google | ⏳ | ⏳ | |

---

## B2B: DISCORD (Gaming/Tech Companies)

> Target: Empresas tech, gaming, comunidades

| Feature | BE | DC | Notas |
|---------|:--:|:--:|-------|
| Discord Bot | ⏳ | ⏳ | |
| Slash commands | ⏳ | ⏳ | /quiniela |
| Embeds ricos | ⏳ | ⏳ | |
| Roles integration | ⏳ | ⏳ | Permisos |
| Server leaderboard | ⏳ | ⏳ | |
| Voice channel alerts | ⏳ | ⏳ | Anunciar goles |

---

## OTRAS INTEGRACIONES B2B (Futuro)

| Plataforma | Target | Prioridad | Status |
|------------|--------|-----------|--------|
| **Webex** | Cisco enterprises | Baja | ⏳ |
| **Zoom Chat** | Remote teams | Baja | ⏳ |
| **Mattermost** | Self-hosted teams | Baja | ⏳ |
| **Rocket.Chat** | Open source orgs | Baja | ⏳ |
| **Workplace (Meta)** | Grandes corporativos | Media | ⏳ |
| **Line Works** | Mercado asiatico | Baja | ⏳ |

---

## PRICING B2B (Propuesta)

| Plan | Precio | Incluye |
|------|--------|---------|
| **Free** | $0 | 1 quiniela, 10 usuarios, features basicos |
| **Team** | $29/mes | 5 quinielas, 50 usuarios, leaderboards, recordatorios |
| **Business** | $99/mes | Unlimited quinielas, 200 usuarios, analytics, branding |
| **Enterprise** | Custom | Unlimited todo, SSO, compliance, soporte dedicado |

---

## ARQUITECTURA INTEGRACIONES

```
                    +------------------+
                    |  Futbolify Core  |
                    |    (Backend)     |
                    +--------+---------+
                             |
        +--------------------+--------------------+
        |                    |                    |
   B2C Layer            B2B Layer           API Layer
        |                    |                    |
   +----+----+         +-----+-----+        +-----+-----+
   |         |         |           |        |           |
Telegram  WhatsApp   Slack    MS Teams   REST API   GraphQL
   |         |         |           |        |           |
   v         v         v           v        v           v
 Users    Users    Workspaces  Tenants   3rd Party   Web/App
```

### Core Services (Compartidos)

```
QuinielaService (Core Logic)
    |
    +-- QuinielaTelegramAdapter ✅
    +-- QuinielaWhatsAppAdapter ⏳
    +-- QuinielaSlackAdapter ⏳
    +-- QuinielaTeamsAdapter ⏳
    +-- QuinielaDiscordAdapter ⏳
    +-- QuinielaGoogleChatAdapter ⏳
```

Cada adapter implementa:
- Autenticacion de plataforma
- Comandos/interacciones
- Formateo de mensajes (cada plataforma diferente)
- Webhooks/eventos
- Rate limiting

---

# FEATURES ADICIONALES

## Autenticacion y Usuarios

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Registro email/password | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | AWS Cognito |
| Login email/password | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Login Google OAuth | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Login Apple | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | Requerido iOS |
| Recuperar password | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Perfil de usuario | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Vincular Telegram | ✅ | ⏳ | ⏳ | ✅ | ❌ | ❌ | ❌ | ❌ | |
| Vincular WhatsApp | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ⏳ | ❌ | ❌ | |

## Notificaciones

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Push notifications | ✅ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | Firebase |
| Smart notifications | ✅ | ⏳ | ⏳ | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | Multi-canal |
| Preferencias usuario | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | |
| Centro notificaciones | ⏳ | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | In-app |

## Sistema de Apuestas (Feature Secundario)

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Picks diarios | ✅ | ⏳ | ⏳ | ✅ | ⏳ | ⏳ | ⏳ | ❌ | |
| Combos inteligentes | ✅ | ⏳ | ⏳ | ✅ | ⏳ | ⏳ | ⏳ | ❌ | |
| Value detection | ✅ | ⏳ | ⏳ | ✅ | ⏳ | ⏳ | ⏳ | ❌ | |
| Stats y ROI | ✅ | ⏳ | ⏳ | ✅ | ⏳ | ⏳ | ⏳ | ❌ | |
| Alertas betting | ✅ | ⏳ | ⏳ | ✅ | ⏳ | ⏳ | ⏳ | ⏳ | |

## Admin (Solo Web)

| Feature | BE | WEB | APP | TG | SL | WA | DC | EM | Notas |
|---------|:--:|:---:|:---:|:--:|:--:|:--:|:--:|:--:|-------|
| Dashboard admin | ✅ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Gestion usuarios | ✅ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Moderacion contenido | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Analytics | ⏳ | ⏳ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | |

---

# INTEGRACIONES EXTERNAS

## APIs de Datos

| API | Status | Uso |
|-----|--------|-----|
| API-Football | ✅ | Datos principales de partidos |
| Football-Data.org | ✅ | API gratuita backup |
| SofaScore | ✅ | Datos en vivo (RapidAPI) |
| The Odds API | ✅ | Cuotas Pinnacle |
| Open-Meteo | ✅ | Datos climaticos |

## APIs de IA

| API | Status | Uso |
|-----|--------|-----|
| OpenAI GPT | ✅ | Analisis, predicciones |
| Anthropic Claude | ✅ | Goal-Guru, web search |

## Infraestructura

| Servicio | Status | Uso |
|----------|--------|-----|
| MongoDB Atlas | ✅ | Base de datos |
| Redis | ✅ | Cache |
| AWS Cognito | ✅ | Autenticacion |
| AWS SES | ✅ | Emails |
| Firebase | ✅ | Push, RT Database, Chat |
| Bunny CDN | ✅ | Media storage |
| Heroku | ✅ | Hosting backend |

---

# ROADMAP POR TRIMESTRE

## Q2 2025 (Actual)

### Prioridad 1: Quinielas MVP (B2C)
- [ ] Web: Auth completa (registro, login, Google)
- [ ] Web: Crear/unirse quiniela
- [ ] Web: Hacer predicciones
- [ ] Web: Leaderboard
- [ ] App: Auth completa
- [ ] App: Flujo basico quinielas

### Prioridad 2: Telegram Completo
- [ ] Mejorar bot quinielas existente
- [ ] Comandos de grupo
- [ ] Deep links compartir

### Prioridad 3: Viralidad Basica
- [ ] Compartir quiniela por link
- [ ] Invitar amigos
- [ ] Social share (Twitter, IG)

## Q3 2025

### Quinielas Completo
- [ ] Sistema de badges/logros
- [ ] Rankings globales
- [ ] Streaks
- [ ] IA sugerencias

### Slack MVP (B2B Launch)
- [ ] Slack App basica
- [ ] Slash commands core
- [ ] Quiniela por workspace
- [ ] Leaderboard automatico
- [ ] Plan Free + Team

### Feed Social MVP
- [ ] Ver feed
- [ ] Crear posts (texto, imagen)
- [ ] Likes y comentarios

### SEO Basico
- [ ] Paginas de ligas
- [ ] Paginas de equipos
- [ ] Standings

## Q4 2025

### Slack Completo
- [ ] Features team building
- [ ] Dashboard admin
- [ ] Analytics engagement
- [ ] Plan Business

### Microsoft Teams MVP
- [ ] Teams App basica
- [ ] Bot conversacional
- [ ] Adaptive Cards

### WhatsApp MVP
- [ ] Bot WhatsApp Business
- [ ] Flujo quinielas basico

### Chat MVP (Web/App)
- [ ] Chat por partido
- [ ] Chat por quiniela

### Feed Completo
- [ ] Videos
- [ ] Seguidores
- [ ] Perfiles publicos

### Mundial 2026 Prep
- [ ] Quiniela mundial configurada
- [ ] Contenido preparado
- [ ] Partnerships corporativos

## Q1 2026

### Mundial 2026 (Gran Evento)
- [ ] Quiniela mundial activa (B2C masivo)
- [ ] Quinielas corporativas Mundial (B2B)
- [ ] Chat mundial
- [ ] Escala para trafico alto

### Teams Enterprise
- [ ] SSO Azure AD
- [ ] Compliance features
- [ ] Plan Enterprise

### Polish
- [ ] Feature parity Web/App
- [ ] Performance optimization
- [ ] UX improvements

## Q2-Q4 2026 (Post-Mundial)

### Expansion B2B
- [ ] Google Chat App
- [ ] Discord Bot
- [ ] Webex / Zoom Chat

### Monetizacion
- [ ] Upsell equipos Free -> Team
- [ ] Enterprise deals
- [ ] Partnerships HR tools

---

# ARQUITECTURA DE MENSAJERIA

Las integraciones de mensajeria (Telegram, Slack, WhatsApp, Discord) siguen el mismo patron:

```
Core Services (Backend)
    |
    +-- QuinielaService -----> TelegramQuinielaBot ✅
    |                    +---> SlackQuinielaBot ⏳
    |                    +---> WhatsAppQuinielaBot ⏳
    |
    +-- BettingService ------> TelegramBettingBot ✅
    |                    +---> SlackBettingBot ⏳
    |                    +---> WhatsAppBettingBot ⏳
    |
    +-- NotificationService -> Multi-channel dispatcher ✅
```

Cada bot implementa:
- Comandos basicos del producto
- Alertas automaticas
- Deep links a Web/App
- Vincular cuenta

---

# COMO ACTUALIZAR ESTE DOCUMENTO

1. Cambiar status de ⏳ a 🚧 cuando inicies trabajo
2. Cambiar de 🚧 a ✅ cuando completes
3. Agregar nuevas features al final de cada seccion
4. Actualizar fecha de "Ultima actualizacion" arriba
5. Actualizar ROADMAP POR TRIMESTRE segun avances
6. Revisar prioridades mensualmente
