# 🧠 CEREBRO FUTBOLERO — Documento de Contexto para IA v6

> **PROPÓSITO DE ESTE DOCUMENTO:** Servir como contexto completo para Claude Code / Cursor. Cada sección está diseñada para que una IA pueda implementar sin ambigüedad.

---

## 🎯 RESUMEN EJECUTIVO (Léelo primero)

**Qué es:** Sistema de generación automática de contenido de fútbol para redes sociales.

**Stack técnico:**
- Backend: NestJS + MongoDB + GraphQL
- Frontend: Next.js + Apollo Client
- LLM: Claude (primary) + OpenAI (fallback)
- Deploy: Vercel (front) + Digital Ocean (back)

**Objetivo principal:** Ser el PRIMERO en publicar contenido de calidad sobre eventos de fútbol.

**Usuarios:** 5 editores que aprueban/editan contenido antes de publicar (excepto auto-publish).

**Flujo básico:**
```
[Fuentes] → [Detectar evento] → [Generar post con IA] → [Editor revisa] → [Publicar]
```

**Flujo auto-publish (eventos seguros):**
```
[Fuentes] → [Detectar evento] → [Generar post] → [Auto-publicar] → [Notificar editor]
```

---

## 🤖 METODOLOGÍA DE DESARROLLO

**Este proyecto se desarrollará casi en su totalidad con asistentes de IA:**

| Herramienta | Uso | Porcentaje |
|-------------|-----|------------|
| **Claude Code** | Generación de módulos, servicios, resolvers, schemas, tests, lógica de negocio | 99% |
| **Cursor** | Ajustes puntuales, debugging específico, navegación de código | 1% |

### Implicaciones

- **Velocidad**: Los batches se ejecutan más rápido que desarrollo tradicional
- **Contexto es rey**: Este documento es la fuente de verdad para generar código consistente
- **Modularidad**: Cada módulo debe poder generarse de forma aislada
- **Revisión humana**: El trabajo principal es revisar, probar e iterar, no escribir código

### Patrón de trabajo

```
1. Cargar este documento como contexto
2. Pedir módulo específico: "Genera el EventsModule con CRUD completo"
3. Claude Code genera código completo
4. Revisar + probar + ajustar si necesario
5. Commit y siguiente módulo
```

### Qué SÍ requiere trabajo manual

- Configuración inicial de infra (MongoDB Atlas, Redis, etc.)
- Variables de entorno y secrets
- Deploy y CI/CD pipelines
- Validación de calidad del contenido generado por LLM

### Qué NO es barrera

- Cantidad de módulos (la IA los genera rápido)
- Código repetitivo (CRUD, resolvers, etc.)
- Documentación inline y tipos TypeScript

---

## 🧪 ESTRATEGIA DE TESTING

> **Objetivo:** Poder probar cada módulo de forma aislada ANTES de conectar el frontend.

### Niveles de testing

| Nivel | Qué prueba | Herramienta | Cuándo |
|-------|-----------|-------------|--------|
| **Unit** | Servicios aislados, lógica de negocio | Jest + mocks | Cada módulo |
| **Integration** | Módulos con MongoDB real | Jest + MongoDB Memory Server | Cada batch |
| **E2E API** | Endpoints GraphQL completos | Jest + Supertest | Antes de FE |
| **Manual API** | Probar queries/mutations a mano | GraphQL Playground | Durante desarrollo |

### Herramientas incluidas en el proyecto

```
# Testing
jest                    # Test runner
@nestjs/testing         # Utilities de NestJS
mongodb-memory-server   # MongoDB en memoria para tests
supertest              # HTTP assertions

# Dev tools
@nestjs/graphql        # Incluye GraphQL Playground en /graphql
```

### GraphQL Playground (tu herramienta principal)

Cuando el backend esté corriendo, vas a `http://localhost:3000/graphql` y puedes:

```graphql
# Crear un evento manualmente
mutation {
  createManualEvent(input: {
    title: "Gol de Vinicius"
    type: GOAL
    players: ["vinicius-jr"]
    teams: ["real-madrid"]
  }) {
    _id
    title
    status
  }
}

# Ver posts pendientes
query {
  pendingPosts {
    _id
    content { text }
    priority
    workflow { status }
  }
}

# Probar generación de post
mutation {
  triggerProactiveContent(contentType: COMPARISON) {
    _id
    content { text }
    generation { model tokensUsed }
  }
}
```

### Scripts de testing en package.json

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "test:debug": "node --inspect-brk -r tsconfig-paths/register node_modules/.bin/jest"
  }
}
```

### Estructura de tests

```
src/
├── modules/
│   ├── events/
│   │   ├── events.service.ts
│   │   ├── events.service.spec.ts      # Unit tests
│   │   └── events.resolver.spec.ts     # Resolver tests
│   ├── posts/
│   │   ├── posts.service.spec.ts
│   │   └── workflow.service.spec.ts
│   └── ai/
│       ├── ai.service.spec.ts
│       └── __mocks__/                   # Mocks de Claude/OpenAI
│           └── claude.mock.ts
test/
├── app.e2e-spec.ts                      # E2E completo
├── events.e2e-spec.ts                   # E2E por módulo
└── fixtures/                            # Datos de prueba
    ├── events.fixture.ts
    └── posts.fixture.ts
```

### Fixtures (datos de prueba)

```typescript
// test/fixtures/events.fixture.ts
export const mockGoalEvent = {
  title: "Gol de Vinicius Jr",
  type: "GOAL",
  source: "api-football",
  players: ["vinicius-jr"],
  teams: ["real-madrid"],
  rawData: {
    minute: 45,
    score: { home: 1, away: 0 }
  }
};

export const mockTransferEvent = {
  title: "Mbappé ficha por el Real Madrid",
  type: "TRANSFER_OFFICIAL",
  source: "rss",
  players: ["mbappe"],
  teams: ["real-madrid", "psg"]
};
```

### Mocks para APIs externas

```typescript
// src/modules/ai/__mocks__/claude.mock.ts
export const mockClaudeResponse = {
  content: [{ 
    text: "⚽ VINI JR NO PARA 🔥\n\nGol del brasileño para adelantar al Madrid.\n\n¿Es el mejor del mundo ahora mismo? 👇" 
  }],
  usage: { input_tokens: 150, output_tokens: 50 }
};

// En el test
jest.mock('./claude.client', () => ({
  generate: jest.fn().mockResolvedValue(mockClaudeResponse)
}));
```

### Checklist de testing por batch

**Batch 1 - Core:**
- [ ] EventsService: crear, buscar, actualizar estado
- [ ] PostsService: crear, claim, release, publish
- [ ] WorkflowService: transiciones de estado válidas/inválidas
- [ ] AIService: genera post (con mock), maneja errores
- [ ] BudgetService: verifica límites, registra uso
- [ ] E2E: Flujo completo evento → post → publish

**Batch 2 - Proactivo:**
- [ ] TemplateService: CRUD, cooldown respetado
- [ ] ProactiveGenerator: genera cada contentType
- [ ] E2E: Trigger manual de contenido proactivo

**Batch 3 - Auto-publish:**
- [ ] AutoPublishService: evalúa reglas correctamente
- [ ] SensitiveEntities: bloquea cuando debe
- [ ] E2E: Evento → Auto-publish → Cancelación

### Modo "Dry Run" para producción segura

```typescript
// En settings
{
  "dryRunMode": true  // Nada se publica realmente
}

// En PublishService
async publishPost(postId: string): Promise<Post> {
  const post = await this.findById(postId);
  
  if (this.settings.dryRunMode) {
    this.logger.log(`[DRY RUN] Would publish: ${post.content.text}`);
    // Actualiza estado pero no llama a Facebook API
    return this.updateStatus(postId, 'published_dry_run');
  }
  
  // Publicación real
  return this.facebookService.publish(post);
}
```

### Comando para probar flujo completo

```bash
# 1. Levantar backend
npm run start:dev

# 2. En otra terminal, correr tests
npm run test

# 3. Abrir GraphQL Playground
open http://localhost:3000/graphql

# 4. Probar manualmente con las queries de arriba
```

---

## 📁 ESTRUCTURA DE MÓDULOS NESTJS

```
src/
├── modules/
│   ├── ingestion/          # Conecta con fuentes externas
│   ├── processing/         # Clasifica, deduplica, prioriza
│   ├── ai/                 # LLM, prompts, validación
│   ├── posts/              # CRUD posts, workflow
│   ├── events/             # CRUD eventos
│   ├── auto-publish/       # Sistema de auto-publicación
│   ├── templates/          # Content templates + pre-cached
│   ├── trending/           # Detección de tendencias
│   ├── notifications/      # Push, in-app, email
│   ├── sources/            # Gestión de fuentes
│   └── analytics/          # Métricas, feedback
├── jobs/                   # Crons y workers
└── common/                 # Utils, guards, decorators
```

---

## 📊 MODELOS DE DATOS (MongoDB)

### Collection: `events`

```typescript
interface Event {
  _id: ObjectId;
  
  // Identificación
  externalId: string;           // ID de la fuente original
  source: 'rss' | 'api-football' | 'twitter' | 'sofascore' | 'manual';
  sourceUrl?: string;
  
  // Clasificación
  type: EventType;              // Ver enum abajo
  priority: 'urgent' | 'high' | 'normal' | 'low';
  
  // Contenido
  title: string;
  description: string;
  rawData: object;              // Datos crudos de la fuente
  
  // Entidades
  players: string[];            // Slugs: ['vinicius-jr', 'mbappe']
  teams: string[];              // Slugs: ['real-madrid']
  competition?: string;
  
  // Corroboración (para tiempo real)
  corroboratedBy: string[];     // Fuentes que confirmaron
  corroborationConfidence: number; // 0-1
  
  // Deduplicación
  fingerprint: string;          // Hash único del evento
  
  // Estado
  status: 'pending' | 'processing' | 'processed' | 'ignored' | 'failed';
  
  // Timestamps
  occurredAt?: Date;            // Cuándo pasó realmente
  detectedAt: Date;             // Cuándo lo detectamos
  createdAt: Date;
  updatedAt: Date;
}

enum EventType {
  // Partido en vivo
  GOAL = 'goal',
  ASSIST = 'assist',
  RED_CARD = 'red_card',
  YELLOW_CARD = 'yellow_card',
  PENALTY = 'penalty',
  OWN_GOAL = 'own_goal',
  
  // Resultados
  MATCH_RESULT = 'match_result',
  
  // Fichajes
  TRANSFER_OFFICIAL = 'transfer_official',
  TRANSFER_RUMOR = 'transfer_rumor',
  
  // Otros
  INJURY = 'injury',
  STATEMENT = 'statement',
  CONTROVERSY = 'controversy',
  AWARD = 'award',
  MILESTONE = 'milestone',
  OTHER = 'other'
}
```

### Collection: `posts`

```typescript
interface Post {
  _id: ObjectId;
  
  // Origen
  origin: 'reactive' | 'proactive';
  eventId?: ObjectId;           // Si viene de un evento
  templateId?: ObjectId;        // Si usó un template
  preCachedTemplateId?: ObjectId;
  
  // Tipo de contenido
  contentType: ContentType;
  
  // Contenido generado
  content: {
    text: string;
    variants?: string[];        // Alternativas generadas
    hashtags?: string[];
    suggestedMedia?: string;
  };
  
  // Contenido final (post-edición)
  finalContent?: {
    text: string;
    imageUrl?: string;
  };
  
  // Metadata de generación
  generation: {
    model: string;
    promptVersion: string;
    tokensUsed: number;
    confidence: number;         // 0-1
    generatedAt: Date;
    generationTimeMs: number;
    source: 'llm' | 'pre-cached';
  };
  
  // Validación
  validation: {
    passedFacebookRules: boolean;
    warnings: string[];
    controversyScore: number;   // 0-100
  };
  
  // Workflow
  workflow: {
    status: PostStatus;
    claimedBy?: ObjectId;
    claimedAt?: Date;
    claimExpiresAt?: Date;
  };
  
  // Auto-publish
  autoPublish?: {
    eligible: boolean;
    ruleId?: ObjectId;
    decision: 'approved' | 'rejected' | 'pending';
    rejectionReason?: string;
    scheduledAt?: Date;
    cancelledAt?: Date;
    cancelledBy?: ObjectId;
  };
  
  // Prioridad
  priority: 'urgent' | 'high' | 'normal' | 'low';
  
  // Publicación
  publishedAt?: Date;
  publishedUrl?: string;
  
  // Feedback
  feedback?: {
    rating: 1 | 2 | 3 | 4 | 5;
    issues?: string[];
    notes?: string;
    reviewedBy: ObjectId;
    reviewedAt: Date;
  };
  
  // Engagement (se actualiza después)
  engagement?: {
    likes: number;
    comments: number;
    shares: number;
    reach: number;
    fetchedAt: Date;
  };
  
  // Latencia
  latency?: {
    eventOccurredAt?: Date;
    eventDetectedAt?: Date;
    postGeneratedAt: Date;
    publishedAt?: Date;
    totalMs?: number;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

enum ContentType {
  // Reactivos
  GOAL_REACTION = 'goal_reaction',
  TRANSFER_NEWS = 'transfer_news',
  MATCH_RECAP = 'match_recap',
  BREAKING_NEWS = 'breaking_news',
  
  // Proactivos
  COMPARISON = 'comparison',
  DEBATE = 'debate',
  RANKING = 'ranking',
  THROWBACK = 'throwback',
  STAT_ATTACK = 'stat_attack',
  HOT_TAKE = 'hot_take',
  PREDICTION = 'prediction',
  XI_OF_THE_WEEK = 'xi_of_the_week',
  LIVE_REACTION = 'live_reaction',
  AGED_LIKE_MILK = 'aged_like_milk',
  ON_THIS_DAY = 'on_this_day',
  POLL = 'poll'
}

enum PostStatus {
  PENDING = 'pending',
  CLAIMED = 'claimed',
  AUTO_PUBLISH_PENDING = 'auto_publish_pending',
  READY = 'ready',
  SCHEDULED = 'scheduled',
  PUBLISHED = 'published',
  REJECTED = 'rejected'
}
```

### Collection: `auto_publish_rules`

```typescript
interface AutoPublishRule {
  _id: ObjectId;
  
  name: string;
  description: string;
  
  // Cuándo aplica
  triggers: {
    contentTypes: ContentType[];
    eventTypes?: EventType[];
    players?: string[];
    teams?: string[];
    competitions?: string[];
  };
  
  // Requisitos
  conditions: {
    minConfidence: number;      // 0.90-1.0
    maxControversy: number;     // 0-100
    requireMultipleSources: boolean;
    minSourceTier: 1 | 2 | 3;
    requireHighRatedTemplate: boolean;
    minTemplateRating?: number;
    minTemplateUses?: number;
    allowedHours?: number[];
    blockDuringLiveMatch?: boolean;
  };
  
  // Acciones
  actions: {
    autoPublish: boolean;
    notifyBefore: boolean;
    notifyBeforeSeconds: number;
    notifyAfter: boolean;
    addToReviewQueue: boolean;
  };
  
  fallbackAction: 'queue_urgent' | 'queue_normal' | 'discard';
  
  limits: {
    maxPerHour: number;
    maxPerDay: number;
    cooldownMinutes: number;
  };
  
  stats: {
    triggered: number;
    autoPublished: number;
    cancelled: number;
    issues: number;
  };
  
  isActive: boolean;
  priority: number;
  
  createdAt: Date;
  updatedAt: Date;
}
```

### Collection: `sensitive_entities`

```typescript
interface SensitiveEntity {
  _id: ObjectId;
  
  type: 'player' | 'team' | 'topic';
  identifier: string;
  reason: string;
  
  restrictions: {
    noAutoPublish: boolean;
    requireSeniorEditor: boolean;
    maxControversy: number;
  };
  
  expiresAt?: Date;
  
  createdBy: ObjectId;
  createdAt: Date;
}
```

### Collection: `pre_cached_templates`

```typescript
interface PreCachedTemplate {
  _id: ObjectId;
  
  trigger: {
    eventType: EventType;
    player?: string;
    team?: string;
    context?: string;
  };
  
  templates: {
    text: string;
    placeholders: string[];
    confidence: number;
    timesUsed: number;
    lastUsedAt?: Date;
    avgRating?: number;
  }[];
  
  placeholderSources: {
    placeholder: string;
    source: 'event' | 'api' | 'calculated';
    path?: string;
    apiCall?: string;
    formula?: string;
  }[];
  
  isActive: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}
```

### Collection: `content_templates`

```typescript
interface ContentTemplate {
  _id: ObjectId;
  
  contentType: ContentType;
  name: string;
  description: string;
  
  players: string[];
  teams: string[];
  
  promptTemplate: string;
  exampleOutput?: string;
  
  requiredData: {
    field: string;
    source: 'api' | 'manual' | 'calculated';
    description: string;
  }[];
  
  cooldownHours: number;
  lastUsedAt?: Date;
  timesUsed: number;
  
  avgRating?: number;
  avgEngagement?: number;
  
  isActive: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}
```

### Collection: `trending_topics`

```typescript
interface TrendingTopic {
  _id: ObjectId;
  
  topic: string;
  normalizedTopic: string;
  
  metrics: {
    twitterVolume: number;
    twitterVelocity: number;
    competitorPosts: number;
  };
  
  analysis: {
    category: 'player' | 'team' | 'match' | 'transfer' | 'controversy' | 'other';
    sentiment: 'positive' | 'negative' | 'mixed' | 'neutral';
    relatedEntities: string[];
    suggestedAngle?: string;
  };
  
  status: 'rising' | 'peak' | 'declining' | 'stale';
  
  postsCreated: ObjectId[];
  
  firstDetectedAt: Date;
  lastUpdatedAt: Date;
}
```

### Collection: `sources`

```typescript
interface Source {
  _id: ObjectId;
  
  name: string;
  type: 'rss' | 'twitter' | 'api-football' | 'sofascore';
  
  connectionMode: 'polling' | 'streaming' | 'websocket';
  
  config: {
    feedUrl?: string;
    username?: string;
    keywords?: string[];
    leagueIds?: number[];
    teamIds?: number[];
    wsUrl?: string;
  };
  
  tier: 1 | 2 | 3;
  
  health: {
    status: 'healthy' | 'degraded' | 'down';
    lastSuccess: Date;
    lastError?: string;
    consecutiveErrors: number;
  };
  
  metrics: {
    avgLatencyMs: number;
    totalEvents: number;
    lastEventAt?: Date;
  };
  
  pollIntervalSeconds?: number;
  isActive: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}
```

### Collection: `notifications`

```typescript
interface Notification {
  _id: ObjectId;
  
  type: 'new_post' | 'urgent_event' | 'auto_publish_pending' | 'auto_publish_done' | 'claim_expired' | 'opportunity';
  
  title: string;
  body: string;
  
  relatedPostId?: ObjectId;
  relatedEventId?: ObjectId;
  actionUrl?: string;
  
  userId?: ObjectId;
  role?: string;
  
  readBy: ObjectId[];
  
  priority: 'urgent' | 'high' | 'normal' | 'low';
  expiresAt?: Date;
  
  createdAt: Date;
}
```

### Collection: `settings`

```typescript
interface Settings {
  priority_players: string[];
  priority_teams: string[];
  priority_competitions: string[];
  
  llm: {
    primary: string;
    fallback: string;
    temperature: number;
    maxTokens: number;
  };
  
  systemPrompt: string;
  systemPromptVersion: string;
  
  autoPublishEnabled: boolean;
  
  proactive: {
    enabled: boolean;
    postsPerDay: number;
    preferredHours: number[];
    contentTypeMix: Record<ContentType, number>;
  };
  
  controversy: {
    min: number;
    max: number;
  };
  
  claimTimeoutMinutes: number;
  quietHours: {
    start: string;
    end: string;
  };
  
  knownIssues: string[];
}
```

### Collection: `api_usage`

```typescript
interface ApiUsage {
  _id: ObjectId;
  
  service: 'claude' | 'openai' | 'api-football' | 'twitter' | 'sofascore';
  operation: string;
  
  triggeredBy: 'event' | 'proactive' | 'manual' | 'job';
  relatedEventId?: ObjectId;
  relatedPostId?: ObjectId;
  userId?: ObjectId;
  
  requestData?: {
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    endpoint?: string;
  };
  
  responseTimeMs: number;
  success: boolean;
  errorMessage?: string;
  
  cost: number;
  
  createdAt: Date;
}
```

### Collection: `budget_config`

```typescript
interface BudgetConfig {
  _id: ObjectId;
  
  service: 'claude' | 'openai' | 'api-football' | 'twitter' | 'all';
  
  limits: {
    daily: number;
    monthly: number;
    perRequest?: number;
  };
  
  rateLimit: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
  };
  
  onLimitReached: {
    action: 'block' | 'warn' | 'fallback';
    fallbackService?: string;
    notifyRoles: string[];
  };
  
  currentUsage: {
    today: number;
    thisMonth: number;
    lastUpdated: Date;
  };
  
  isActive: boolean;
  
  updatedAt: Date;
  updatedBy?: ObjectId;
}
```

### Collection: `analytics_daily`

```typescript
interface DailyAnalytics {
  _id: ObjectId;
  date: string;
  
  events: {
    total: number;
    byType: Record<EventType, number>;
    bySource: Record<string, number>;
    duplicatesDetected: number;
  };
  
  posts: {
    generated: number;
    published: number;
    rejected: number;
    autoPublished: number;
    byContentType: Record<ContentType, number>;
  };
  
  autoPublish: {
    eligible: number;
    executed: number;
    cancelled: number;
    issues: number;
  };
  
  latency: {
    avgDetectionMs: number;
    avgGenerationMs: number;
    avgTotalMs: number;
    postsUnder1Min: number;
    postsUnder5Min: number;
  };
  
  llm: {
    totalCalls: number;
    totalTokens: number;
    avgResponseMs: number;
    errors: number;
  };
  
  feedback: {
    avgRating: number;
    totalRatings: number;
    byContentType: Record<ContentType, { avg: number; count: number }>;
  };
  
  engagement: {
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    topPostId?: ObjectId;
  };
}
```

---

## 🔗 GRAPHQL SCHEMA

### Enums

```graphql
enum EventType {
  GOAL, ASSIST, RED_CARD, YELLOW_CARD, PENALTY, OWN_GOAL,
  MATCH_RESULT, TRANSFER_OFFICIAL, TRANSFER_RUMOR,
  INJURY, STATEMENT, CONTROVERSY, AWARD, MILESTONE, OTHER
}

enum ContentType {
  GOAL_REACTION, TRANSFER_NEWS, MATCH_RECAP, BREAKING_NEWS,
  COMPARISON, DEBATE, RANKING, THROWBACK, STAT_ATTACK, HOT_TAKE,
  PREDICTION, XI_OF_THE_WEEK, LIVE_REACTION, AGED_LIKE_MILK, ON_THIS_DAY, POLL
}

enum PostStatus {
  PENDING, CLAIMED, AUTO_PUBLISH_PENDING, READY, SCHEDULED, PUBLISHED, REJECTED
}

enum Priority {
  URGENT, HIGH, NORMAL, LOW
}
```

### Queries

```graphql
type Query {
  # Posts
  pendingPosts: [Post!]!
  myClaimedPosts: [Post!]!
  autoPublishPending: [Post!]!
  postPublishReviewQueue: [Post!]!
  posts(status: PostStatus, contentType: ContentType, limit: Int, offset: Int): [Post!]!
  post(id: ID!): Post
  
  # Events
  events(status: String, type: EventType, limit: Int): [Event!]!
  event(id: ID!): Event
  
  # Auto-publish
  autoPublishRules(isActive: Boolean): [AutoPublishRule!]!
  sensitiveEntities: [SensitiveEntity!]!
  
  # Templates
  contentTemplates(contentType: ContentType): [ContentTemplate!]!
  preCachedTemplates(player: String, eventType: EventType): [PreCachedTemplate!]!
  
  # Trending
  trendingTopics(limit: Int): [TrendingTopic!]!
  contentOpportunities(status: String): [ContentOpportunity!]!
  
  # Notifications
  myNotifications(unreadOnly: Boolean): [Notification!]!
  unreadCount: Int!
  
  # Analytics
  dailyStats(startDate: String!, endDate: String!): [DailyAnalytics!]!
  latencyStats(days: Int): LatencyStats!
  
  # Budget
  budgetStatus: [BudgetStatus!]!
  budgetStatusByService(service: String!): BudgetStatus
  apiUsage(service: String, startDate: String!, endDate: String!): ApiUsageReport!
  costAlerts(acknowledged: Boolean): [CostAlert!]!
  costProjections: CostProjections!
  
  # Settings
  settings: Settings!
}
```

### Mutations

```graphql
type Mutation {
  # Workflow de posts
  claimPost(id: ID!): Post!
  releasePost(id: ID!): Post!
  updatePostContent(id: ID!, text: String!, imageUrl: String): Post!
  regeneratePost(id: ID!, instructions: String): Post!
  markPostReady(id: ID!): Post!
  publishPost(id: ID!): Post!
  rejectPost(id: ID!, reason: String): Post!
  submitFeedback(id: ID!, rating: Int!, issues: [String!], notes: String): Post!
  
  # Auto-publish
  cancelAutoPublish(postId: ID!): Post!
  reportAutoPublishIssue(postId: ID!, issue: String!): Boolean!
  createAutoPublishRule(input: CreateAutoPublishRuleInput!): AutoPublishRule!
  updateAutoPublishRule(id: ID!, input: UpdateAutoPublishRuleInput!): AutoPublishRule!
  toggleAutoPublishRule(id: ID!, isActive: Boolean!): AutoPublishRule!
  
  # Sensitive entities
  addSensitiveEntity(input: AddSensitiveEntityInput!): SensitiveEntity!
  removeSensitiveEntity(id: ID!): Boolean!
  
  # Events
  ignoreEvent(id: ID!): Event!
  reprocessEvent(id: ID!): Event!
  createManualEvent(input: CreateManualEventInput!): Event!
  
  # Templates
  createContentTemplate(input: CreateContentTemplateInput!): ContentTemplate!
  updateContentTemplate(id: ID!, input: UpdateContentTemplateInput!): ContentTemplate!
  createPreCachedTemplate(input: CreatePreCachedTemplateInput!): PreCachedTemplate!
  
  # Trending
  acceptOpportunity(id: ID!, customAngle: String): Post!
  rejectOpportunity(id: ID!): Boolean!
  
  # Proactive
  triggerProactiveContent(contentType: ContentType): Post!
  
  # Notifications
  markNotificationRead(id: ID!): Notification!
  markAllRead: Boolean!
  
  # Budget
  updateBudgetConfig(service: String!, input: BudgetConfigInput!): BudgetConfig!
  acknowledgeCostAlert(id: ID!): CostAlert!
  overrideBudgetLimit(service: String!, temporaryLimit: Float!, expiresAt: DateTime!): Boolean!
  
  # Settings
  updateSettings(input: UpdateSettingsInput!): Settings!
}
```

### Subscriptions

```graphql
type Subscription {
  postCreated: Post!
  postStatusChanged: Post!
  autoPublishScheduled: Post!
  newNotification: Notification!
  newOpportunity: ContentOpportunity!
}
```

---

## ⚙️ SERVICIOS CLAVE

### IngestionService
**Responsabilidad:** Conectar con fuentes y crear eventos.

```typescript
interface IngestionService {
  pollRssFeed(sourceId: string): Promise<Event[]>;
  processTwitterStream(tweet: Tweet): Promise<Event | null>;
  processFootballApiEvent(data: any): Promise<Event>;
  processWebsocketMessage(source: Source, message: any): Promise<Event>;
}
```

### EventCorroboratorService
**Responsabilidad:** Verificar eventos cruzando fuentes.

```typescript
interface EventCorroboratorService {
  handleIncomingEvent(event: Event, source: Source): Promise<void>;
  evaluateCorroboration(events: Event[]): Promise<boolean>;
  createCorroboratedEvent(events: Event[]): Promise<Event>;
}
```

**Reglas:**
- Ventana de correlación: 60 segundos
- Goles: 1 fuente Tier 1 suficiente
- Fichajes: Tier 1, o 2+ fuentes Tier 2

### ProcessingService
**Responsabilidad:** Clasificar y priorizar eventos.

```typescript
interface ProcessingService {
  processEvent(eventId: string): Promise<void>;
  classifyEvent(event: Event): EventType;
  checkDuplication(event: Event): Promise<boolean>;
  calculatePriority(event: Event): Priority;
}
```

**Prioridades:**
- URGENT: Gol jugador prioritario, fichaje oficial Tier 1
- HIGH: Resultado, fichaje, lesión importante
- NORMAL: Rumores, declaraciones
- LOW: Stats, milestones menores

### AIService
**Responsabilidad:** Generar contenido con LLM.

```typescript
interface AIService {
  generatePost(event: Event, contentType: ContentType): Promise<GeneratedContent>;
  generateFromTemplate(template: ContentTemplate, data: any): Promise<string>;
  fillPreCachedTemplate(template: PreCachedTemplate, event: Event): Promise<string>;
  validateContent(content: string): ValidationResult;
  calculateControversy(content: string): number;
}
```

**Flujo:**
1. Verificar budget con BudgetService
2. Intentar template pre-armado primero (más rápido, $0)
3. Si no hay, usar LLM (Claude primary, OpenAI fallback)
4. Timeout: 30 segundos, 2 reintentos
5. Registrar uso en BudgetService

### AutoPublishService
**Responsabilidad:** Decidir y ejecutar auto-publicación.

```typescript
interface AutoPublishService {
  evaluateForAutoPublish(post: Post): Promise<AutoPublishDecision>;
  scheduleAutoPublish(post: Post, rule: AutoPublishRule): Promise<void>;
  executeAutoPublish(post: Post): Promise<void>;
  cancelAutoPublish(postId: string, userId: string): Promise<void>;
}
```

**Flujo:**
1. Buscar reglas que aplican
2. Verificar entidades sensibles
3. Evaluar condiciones
4. Verificar límites
5. Si aprobado: programar con ventana de cancelación
6. Notificar → Esperar → Publicar si no cancelado

### BudgetService
**Responsabilidad:** Controlar gastos y rate limits.

```typescript
interface BudgetService {
  canMakeRequest(service: string, estimatedCost?: number): Promise<BudgetCheck>;
  recordUsage(usage: UsageRecord): Promise<void>;
  getCurrentUsage(service: string): Promise<UsageStatus>;
  checkRateLimit(service: string): Promise<RateLimitCheck>;
  getProjectedCosts(): Promise<CostProjection>;
}
```

### WorkflowService
**Responsabilidad:** Manejar flujo de trabajo de posts.

```typescript
interface WorkflowService {
  claimPost(postId: string, userId: string): Promise<Post>;
  releasePost(postId: string): Promise<Post>;
  expireClaims(): Promise<number>;
  transitionStatus(postId: string, newStatus: PostStatus): Promise<Post>;
}
```

### NotificationService
**Responsabilidad:** Enviar notificaciones.

```typescript
interface NotificationService {
  notifyNewPost(post: Post): Promise<void>;
  notifyAutoPublishPending(post: Post, seconds: number): Promise<void>;
  notifyAutoPublishDone(post: Post): Promise<void>;
  notifyOpportunity(opportunity: ContentOpportunity): Promise<void>;
  sendPush(userId: string, notification: Notification): Promise<void>;
}
```

---

## 🕐 JOBS Y CRONS

### Tiempo real

| Job | Intervalo | Función |
|-----|-----------|---------|
| `football-live-poller` | 10 seg | Poll API-Football durante partidos |
| `twitter-stream` | Continuo | Stream de Twitter |
| `websocket-manager` | Continuo | Mantener conexiones WS |

### Periódicos

| Job | Cron | Función |
|-----|------|---------|
| `rss-poller` | `*/5 * * * *` | Poll feeds RSS |
| `trending-detector` | `*/15 * * * *` | Detectar tendencias |
| `claim-expiry` | `* * * * *` | Expirar claims |
| `source-health` | `*/5 * * * *` | Verificar salud fuentes |
| `engagement-fetcher` | `0 * * * *` | Obtener engagement |
| `analytics-aggregator` | `0 0 * * *` | Agregar analytics |
| `on-this-day` | `0 9 * * *` | Generar efemérides |
| `xi-of-the-week` | `0 10 * * 1` | Generar XI lunes |

---

## 📝 PROMPTS DEL SISTEMA

### System Prompt Base

```
Eres un generador de contenido para una página de fútbol en Facebook con millones de seguidores.

Tu objetivo es crear posts que:
1. Generen ENGAGEMENT (comentarios, shares)
2. Sean informativos pero con PERSONALIDAD
3. Inviten al DEBATE sin ser ofensivos
4. Tengan el TONO de un fan apasionado, no de un periodista

Reglas:
- Máximo 280 caracteres para posts normales
- Incluir 1-2 emojis relevantes
- Terminar con pregunta o CTA
- Nunca inventar datos
- Nunca insultar jugadores/equipos
- Evitar clickbait vacío

Issues conocidos a evitar:
{KNOWN_ISSUES}

Feedback reciente:
{RECENT_FEEDBACK}
```

---

## 🚀 CONFIGURACIÓN INICIAL

```json
{
  "priority_players": [
    "vinicius-jr", "mbappe", "bellingham", "haaland",
    "messi", "cristiano-ronaldo", "pedri", "gavi",
    "rodrygo", "valverde", "yamal", "saka"
  ],
  "priority_teams": [
    "real-madrid", "barcelona", "manchester-city",
    "liverpool", "psg", "bayern-munich", "arsenal"
  ],
  "priority_competitions": [
    "champions-league", "la-liga", "premier-league", "world-cup"
  ],
  "llm": {
    "primary": "claude-sonnet-4-20250514",
    "fallback": "gpt-4o",
    "temperature": 0.7,
    "maxTokens": 500
  },
  "autoPublishEnabled": true,
  "proactive": {
    "enabled": true,
    "postsPerDay": 5,
    "preferredHours": [9, 12, 15, 18, 21]
  },
  "controversy": { "min": 30, "max": 75 },
  "claimTimeoutMinutes": 30,
  "quietHours": { "start": "02:00", "end": "08:00" }
}
```

---

## 💰 BUDGETS POR DEFECTO

```json
{
  "claude": {
    "daily": 10.00,
    "monthly": 200.00,
    "perRequest": 0.50,
    "rateLimit": { "minute": 20, "hour": 200, "day": 2000 },
    "onLimit": "fallback:openai"
  },
  "openai": {
    "daily": 5.00,
    "monthly": 100.00,
    "perRequest": 0.50,
    "onLimit": "block"
  },
  "api-football": {
    "daily": 2.00,
    "monthly": 50.00,
    "onLimit": "warn"
  }
}
```

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### Batch 1: Core (MVP)
- [ ] Setup NestJS + MongoDB + GraphQL
- [ ] Schemas: Event, Post, Source, Notification, Settings
- [ ] BudgetModule: api_usage, budget_config
- [ ] BudgetService: canMakeRequest, recordUsage, checkRateLimit
- [ ] EventsModule: CRUD básico
- [ ] PostsModule: CRUD + workflow
- [ ] IngestionModule: RSS polling
- [ ] AIModule: Claude integration + budget checks
- [ ] NotificationsModule: In-app
- [ ] UI: Dashboard con cola de posts

### Batch 2: Contenido Proactivo
- [ ] ContentTemplatesModule
- [ ] Generadores: comparison, debate, ranking, throwback
- [ ] ProactiveScheduler
- [ ] UI: Gestión de templates

### Batch 3: Auto-Publish
- [ ] AutoPublishRulesModule
- [ ] SensitiveEntitiesModule
- [ ] AutoPublishService
- [ ] Ventana de cancelación
- [ ] UI: Control panel

### Batch 4: Tiempo Real
- [ ] API-Football polling rápido
- [ ] Twitter streaming
- [ ] EventCorroborator
- [ ] LatencyTracking

### Batch 5: Templates Pre-armados
- [ ] PreCachedTemplatesModule
- [ ] FastGenerationService
- [ ] Placeholder resolution

### Batch 6: Trending
- [ ] TrendingTopicsModule
- [ ] CompetitorMonitor
- [ ] OpportunitiesModule

### Batch 7: Nuevos ContentTypes
- [ ] Prediction, XI of the week, On this day, Aged like milk

### Batch 8: Analytics Avanzados
- [ ] EngagementFetcher
- [ ] Dashboard de costos completo
- [ ] Proyecciones y reportes

---

*Documento v6 - Optimizado para Claude Code / Cursor*
