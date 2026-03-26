# Changelog - Futbolify Backend

Todas las versiones notables del proyecto.

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [1.0.0] - 2026-03-26

### Resumen
Primera versión estable del backend de Futbolify con sistema de betting completo.

### Módulos

| Módulo | Versión | Estado |
|--------|---------|--------|
| Auth (Cognito) | 1.0.0 | Estable |
| Users | 1.0.0 | Estable |
| Matches | 1.0.0 | Estable |
| **Betting (GolPicks)** | **1.0.0** | **Estable** |

### Betting System v1.0.0
- Fórmulas matemáticas correctas implementadas
- VIG extraction para edges reales
- Kelly 10% (estándar profesional)
- Edge mínimo: 5%
- Drawdown protection automático
- Anti-patterns conectados
- Documentación técnica completa

Ver detalles en: [src/betting/CHANGELOG.md](./src/betting/CHANGELOG.md)

### Infraestructura
- NestJS 10.x
- MongoDB (Mongoose 8.x)
- GraphQL (Apollo Server)
- AWS Cognito para autenticación
- Telegram Bot para alertas
- Heroku deployment ready

---

## [Unreleased]

### Por implementar
- [ ] Dashboard de analytics
- [ ] Más mercados de betting
- [ ] Integración con más APIs

---

## Versionado

```
Backend v1.0.0
├── Auth Module v1.0.0
├── Users Module v1.0.0
├── Matches Module v1.0.0
└── Betting Module v1.0.0  ← Versionado independiente en src/betting/
```

- **MAJOR (X.0.0):** Cambios que rompen compatibilidad de API
- **MINOR (0.X.0):** Nueva funcionalidad compatible
- **PATCH (0.0.X):** Correcciones de bugs
