# Teams Module - Futbolify Backend

## 📋 Overview

This module implements the complete team management system for Futbolify, including:
- **Teams**: Create and manage football teams
- **Team Members**: Manage team memberships with roles (ADMIN/MEMBER)
- **Matches**: Create and track team matches
- **Media**: Upload and manage photos/videos from matches
- **Tags**: Tag users in media content

## 🗄️ Database Collections

### 1. Teams
- Auto-generates unique 6-character code
- Creator is automatically added as ADMIN
- Supports multiple colors (GREEN, BLUE, RED, etc.)

### 2. Team Members
- Two roles: ADMIN (full permissions) and MEMBER (view + upload)
- Composite unique index on (teamId, userId)
- Tracks join date

### 3. Team Matches
- Linked to a team
- Optional opponent and location
- Tracks creation metadata

### 4. Media
- Photos and videos from matches
- Optional categories: GOAL, PLAY, FAIL
- Highlight toggle
- Duration tracking for videos

### 5. Media Tags
- Tag users in media
- Tracks who created the tag
- Composite unique index on (mediaId, userId)

## 🔐 Security & Permissions

### Permission Levels

**ADMIN:**
- All MEMBER permissions
- Create/edit/delete matches
- Remove members
- Change member roles
- Delete team
- Delete any media

**MEMBER:**
- View all team content
- Upload media
- Tag users in media
- Self-tag in media

### Guards

- `GqlAuthGuard`: Ensures user is authenticated
- `TeamMemberGuard`: Verifies user is a member of the team
- `TeamAdminGuard`: Verifies user is an admin of the team

## 📊 GraphQL API

### Queries (9)

```graphql
# Get all teams where I'm a member (with stats)
myTeams: [Team!]!

# Get team details with members
team(id: ID!): TeamWithMembers!

# Find team by code (for joining)
teamByCode(code: String!): Team!

# Get all members of a team
teamMembers(teamId: ID!): [TeamMember!]!

# Get all matches of a team (with stats)
teamMatches(teamId: ID!): [TeamMatch!]!

# Get match details (with stats)
teamMatch(id: ID!): TeamMatch!

# Get media from a match (with filters)
matchMedia(matchId: ID!, filters: MediaFiltersInput): [Media!]!

# Get specific media details
media(id: ID!): Media!

# Get media where I'm tagged
myTaggedMedia(type: MediaType): [Media!]!

# Get profile statistics
profileStats(userId: ID): ProfileStats!
```

### Mutations (21)

#### Teams (7)
```graphql
createTeam(input: CreateTeamInput!): Team!
updateTeam(id: ID!, input: UpdateTeamInput!): Team!
deleteTeam(id: ID!): Boolean!
joinTeam(code: String!): Team!
leaveTeam(teamId: ID!): Boolean!
removeTeamMember(teamId: ID!, userId: ID!): Boolean!
updateMemberRole(teamId: ID!, userId: ID!, role: String!): TeamMember!
```

#### Matches (3)
```graphql
createMatch(input: CreateMatchInput!): TeamMatch!
updateMatch(id: ID!, input: UpdateMatchInput!): TeamMatch!
deleteMatch(id: ID!): Boolean!
```

#### Media (7)
```graphql
uploadMedia(input: UploadMediaInput!): Media!
batchUploadMedia(inputs: [UploadMediaInput!]!): [Media!]!
updateMedia(id: ID!, input: UpdateMediaInput!): Media!
deleteMedia(id: ID!): Boolean!
toggleHighlight(mediaId: ID!): Media!
tagUsersInMedia(mediaId: ID!, userIds: [ID!]!): Boolean!
selfTagMedia(mediaId: ID!): Boolean!
removeMediaTag(mediaId: ID!, userId: ID!): Boolean!
```

## 🚀 Usage Examples

### Create a Team
```graphql
mutation {
  createTeam(input: {
    name: "Los Cracks FC"
    color: GREEN
  }) {
    id
    name
    code  # Auto-generated unique code
    memberCount
  }
}
```

### Join a Team
```graphql
mutation {
  joinTeam(code: "ABC123") {
    id
    name
    color
  }
}
```

### Create a Match
```graphql
mutation {
  createMatch(input: {
    teamId: "64f1234567890abcdef12345"
    date: "2024-01-15T18:00:00Z"
    opponent: "Los Tigres"
    location: "Estadio Municipal"
  }) {
    id
    date
    opponent
  }
}
```

### Upload Media
```graphql
mutation {
  uploadMedia(input: {
    matchId: "64f1234567890abcdef12345"
    type: VIDEO
    url: "https://storage.example.com/videos/goal.mp4"
    category: GOAL
    duration: 15.5
  }) {
    id
    url
    type
  }
}
```

### Tag Users in Media
```graphql
mutation {
  tagUsersInMedia(
    mediaId: "64f1234567890abcdef12345"
    userIds: ["64f111", "64f222", "64f333"]
  )
}
```

### Get Profile Stats
```graphql
query {
  profileStats(userId: "64f1234567890abcdef12345") {
    goalCount
    videoCount
    photoCount
  }
}
```

## 🔧 Key Features

### 1. Unique Code Generation
Teams automatically generate a unique 6-character alphanumeric code on creation for easy sharing and joining.

### 2. Automatic Admin Assignment
The user who creates a team is automatically added as an ADMIN.

### 3. Last Admin Protection
The system prevents:
- Removing the last admin
- The last admin leaving the team
- Demoting the last admin

### 4. Cascade Deletion
When a team is deleted, all related data is automatically removed:
- Team members
- Matches
- Media
- Media tags

### 5. Smart Permissions
- Only uploaders or team admins can delete media
- Only the tagger or tagged person can remove tags
- Admins can manage all team content

### 6. Statistics Aggregation
Real-time stats for:
- **Teams**: Match count, media count, member count
- **Matches**: Photo count, video count, highlight count
- **Profiles**: Goal count, video count, photo count (from tagged media)

## 📁 File Structure

```
src/teams/
├── schemas/
│   ├── team.schema.ts
│   ├── team-member.schema.ts
│   ├── team-match.schema.ts
│   ├── media.schema.ts
│   └── media-tag.schema.ts
├── dto/
│   ├── create-team.input.ts
│   ├── update-team.input.ts
│   ├── create-match.input.ts
│   ├── update-match.input.ts
│   ├── upload-media.input.ts
│   ├── update-media.input.ts
│   ├── media-filters.input.ts
│   ├── team-with-members.output.ts
│   ├── team-member-with-user.output.ts
│   ├── media-with-tags.output.ts
│   ├── profile-stats.output.ts
│   └── index.ts
├── guards/
│   ├── team-member.guard.ts
│   └── team-admin.guard.ts
├── decorators/
│   └── current-team-member.decorator.ts
├── utils/
│   └── stats.utils.ts
├── teams.service.ts
├── media.service.ts
├── teams.resolver.ts
├── media.resolver.ts
├── teams.module.ts
└── README.md
```

## 🧪 Testing Flow

1. **Create Team** → Verify code is unique and creator is admin
2. **Join Team** → Verify member can view but not edit
3. **Create Match** → Verify any member can create
4. **Upload Media** → Verify storage integration
5. **Tag Users** → Verify tagging works
6. **Delete Media** → Verify only uploader/admin can delete
7. **Leave Team** → Verify last admin protection
8. **Delete Team** → Verify cascade deletion

## 🔗 Integration with Frontend

The frontend should:
1. Upload files to storage (Supabase/Cloudinary/S3) first
2. Get the URL from storage
3. Call `uploadMedia` mutation with the URL
4. Display media using the stored URL

## 📝 Notes

- All dates use ISO 8601 format
- ObjectIds are converted to strings for GraphQL
- Timestamps are automatically managed by Mongoose
- Indexes are created for optimal query performance
- Error messages are user-friendly and descriptive

## 🚀 Next Steps

1. Configure storage provider (Supabase/Cloudinary/S3)
2. Set up file upload endpoints if needed
3. Test all mutations and queries
4. Add custom validations if needed
5. Implement real-time subscriptions (optional)

