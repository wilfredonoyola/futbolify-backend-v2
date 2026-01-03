# Futbolify Backend - Project Context

## Overview

Backend API for Futbolify. Provides authentication, user management, and live match data with betting analysis.

## Tech Stack

| Technology | Version | Usage |
|------------|---------|-------|
| **NestJS** | 10.x | Backend framework |
| **GraphQL** | 16.8 | API (Apollo Server) |
| **MongoDB** | Mongoose 8.x | Database |
| **AWS Cognito** | SDK v3 | Authentication |
| **Passport JWT** | 4.x | Auth strategy |
| **OpenAI** | 4.x | Match analysis |

## Project Structure

```
src/
├── main.ts                 # Entry point (port 3001)
├── app.module.ts           # Main module
├── app.controller.ts       # Health check
├── app.service.ts          # Base service
├── auth/                   # Authentication module
│   ├── auth.module.ts
│   ├── auth.resolver.ts    # GraphQL resolvers
│   ├── auth.service.ts     # Cognito logic
│   ├── dto/                # Input/Output DTOs
│   ├── strategies/         # JWT strategy
│   ├── gql-auth.guard.ts   # Auth guard
│   └── roles.guard.ts      # Roles guard
├── users/                  # Users module
│   ├── users.module.ts
│   ├── users.resolver.ts
│   ├── users.service.ts
│   ├── dto/
│   └── schemas/
│       └── user.schema.ts  # MongoDB schema
└── matches/                # Live matches module
    ├── matches.module.ts
    ├── matches.resolver.ts
    ├── matches.service.ts
    ├── sofascore.service.ts      # SofaScore API
    ├── openai-analysis.service.ts # AI analysis
    ├── cache.service.ts          # Data cache
    ├── dto/
    ├── enums/
    ├── interfaces/
    └── utils/
```

## GraphQL Schema

Schema auto-generates to `schema.gql`. Main types:

### Queries
- `user(email)` - Get user by email
- `users` - List all users
- `liveMatches` - Live matches
- `lateMatches(options)` - Late-stage matches (for betting)
- `matchById(id)` - Specific match

### Mutations
- `signin` / `Signup` / `ConfirmSignup` - Auth
- `googleSignin` / `completeProfile` - Google auth
- `forgotPassword` / `confirmForgotPassword` - Password recovery
- `addUser` / `updateUser` / `removeUser` - User CRUD

### Enums
- `UserRole`: USER, ADMIN, SUPER_ADMIN
- `MatchState`: NotStarted, FirstHalf, HalfTime, SecondHalf, Finished, etc.

## Authentication

- **AWS Cognito** for user management
- **JWT** for session tokens
- Guards: `GqlAuthGuard`, `RolesGuard`
- Decorator: `@CurrentUser()` to get current user

## Useful Commands

```bash
# Development
yarn start:dev

# Production
yarn build && yarn start:prod

# Tests
yarn test
yarn test:e2e
yarn test:cov
```

## Environment Variables

Required (see `.env.example` if exists):
- `MONGODB_URI` - MongoDB connection
- `AWS_COGNITO_*` - Cognito credentials
- `OPENAI_API_KEY` - For match analysis
- `JWT_SECRET` - Token secret

## Deployment

- Configured for **Heroku** (`Procfile`)
- Command: `npm run start:prod`

## Important Notes

1. GraphQL schema auto-generates - don't edit `schema.gql` directly
2. DTOs use `class-validator` and `class-transformer` decorators
3. Matches module consumes SofaScore API for live data
4. OpenAI generates betting analysis (`BettingAnalysisDto`)
