/**
 * Diagnostic script to check what data API-Football actually returns
 * Run with: npx ts-node scripts/diagnose-betting-api.ts
 */
import 'dotenv/config'
import axios from 'axios'

const API_KEY = process.env.API_FOOTBALL_KEY
const BASE_URL = 'https://v3.football.api-sports.io'

interface DiagnosticResult {
  fixtures: any
  teamStats: any
  odds: any
  h2h: any
}

async function fetchWithLogging(endpoint: string, params: Record<string, any>) {
  console.log(`\n📡 Fetching: ${endpoint}`)
  console.log(`   Params: ${JSON.stringify(params)}`)

  try {
    const response = await axios.get(`${BASE_URL}${endpoint}`, {
      headers: {
        'x-apisports-key': API_KEY,
      },
      params,
    })

    console.log(`   ✅ Status: ${response.status}`)
    console.log(`   📊 Results: ${response.data.results || 0}`)
    console.log(`   ⚡ API calls remaining: ${response.headers['x-ratelimit-requests-remaining']}`)

    return response.data
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`)
    return null
  }
}

async function diagnoseFixtures(date: string, leagueId: number) {
  console.log('\n' + '='.repeat(60))
  console.log('1️⃣ FIXTURES DIAGNOSIS')
  console.log('='.repeat(60))

  const data = await fetchWithLogging('/fixtures', {
    date,
    league: leagueId,
    season: 2025,
  })

  if (data?.response?.length > 0) {
    const fixture = data.response[0]
    console.log('\n📋 Sample Fixture Structure:')
    console.log(JSON.stringify(fixture, null, 2))
    return fixture.fixture.id
  }

  return null
}

async function diagnoseTeamStats(leagueId: number, teamId: number) {
  console.log('\n' + '='.repeat(60))
  console.log('2️⃣ TEAM STATS DIAGNOSIS')
  console.log('='.repeat(60))

  const data = await fetchWithLogging('/teams/statistics', {
    league: leagueId,
    team: teamId,
    season: 2025,
  })

  if (data?.response) {
    const stats = data.response
    console.log('\n📋 Available Stats Fields:')
    console.log('   - fixtures:', Object.keys(stats.fixtures || {}))
    console.log('   - goals:', Object.keys(stats.goals || {}))
    console.log('   - goals.for.minute:', stats.goals?.for?.minute)
    console.log('   - clean_sheet:', stats.clean_sheet)
    console.log('   - failed_to_score:', stats.failed_to_score)
    console.log('   - lineups:', stats.lineups?.length || 0, 'formations')

    // Check for first half specific data
    console.log('\n🔍 First Half Goals Data:')
    const goalsFor = stats.goals?.for?.minute
    if (goalsFor) {
      console.log('   0-15 min:', goalsFor['0-15'])
      console.log('   16-30 min:', goalsFor['16-30'])
      console.log('   31-45 min:', goalsFor['31-45'])
      console.log('   46-60 min:', goalsFor['46-60'])
    }

    // Check for corners data
    console.log('\n🔍 Corners Data:')
    console.log('   Has corners field?', !!stats.corners)
    if (stats.corners) {
      console.log('   Corners data:', JSON.stringify(stats.corners, null, 2))
    }

    // Check for form data
    console.log('\n🔍 Form Data:')
    console.log('   Form string:', stats.form)
    console.log('   Biggest win:', stats.biggest?.wins)
    console.log('   Biggest goals for:', stats.biggest?.goals?.for)

    return stats
  }

  return null
}

async function diagnoseOdds(fixtureId: number) {
  console.log('\n' + '='.repeat(60))
  console.log('3️⃣ ODDS DIAGNOSIS - CRITICAL!')
  console.log('='.repeat(60))

  const data = await fetchWithLogging('/odds', {
    fixture: fixtureId,
  })

  if (data?.response?.length > 0) {
    const odds = data.response[0]

    console.log('\n📋 Bookmakers Available:', odds.bookmakers?.length || 0)

    // List all unique market names
    const allMarkets = new Set<string>()
    const goalMarkets: any[] = []
    const cornerMarkets: any[] = []

    odds.bookmakers?.forEach((bk: any) => {
      bk.bets?.forEach((bet: any) => {
        allMarkets.add(bet.name)

        // Check for goal-related markets
        if (bet.name.toLowerCase().includes('goal') ||
            bet.name.toLowerCase().includes('half')) {
          goalMarkets.push({
            bookmaker: bk.name,
            market: bet.name,
            values: bet.values?.slice(0, 4), // First 4 values
          })
        }

        // Check for corner markets
        if (bet.name.toLowerCase().includes('corner')) {
          cornerMarkets.push({
            bookmaker: bk.name,
            market: bet.name,
            values: bet.values?.slice(0, 4),
          })
        }
      })
    })

    console.log('\n📋 ALL AVAILABLE MARKETS:')
    Array.from(allMarkets).sort().forEach(m => console.log(`   - ${m}`))

    console.log('\n🎯 GOAL-RELATED MARKETS (First Half):')
    const uniqueGoalMarkets = [...new Set(goalMarkets.map(g => g.market))]
    uniqueGoalMarkets.forEach(market => {
      console.log(`\n   Market: "${market}"`)
      const sample = goalMarkets.find(g => g.market === market)
      if (sample?.values) {
        sample.values.forEach((v: any) => {
          console.log(`      ${v.value}: @${v.odd}`)
        })
      }
    })

    console.log('\n⚽ CORNER MARKETS:')
    const uniqueCornerMarkets = [...new Set(cornerMarkets.map(c => c.market))]
    uniqueCornerMarkets.forEach(market => {
      console.log(`\n   Market: "${market}"`)
      const sample = cornerMarkets.find(c => c.market === market)
      if (sample?.values) {
        sample.values.forEach((v: any) => {
          console.log(`      ${v.value}: @${v.odd}`)
        })
      }
    })

    // CRITICAL CHECK: Over 0.5 First Half Goals
    console.log('\n' + '⚠️'.repeat(20))
    console.log('🔴 CRITICAL CHECK: Over 0.5 First Half Goals')
    console.log('⚠️'.repeat(20))

    let foundOver05_1H = false
    let foundOver15_1H = false

    goalMarkets.forEach(gm => {
      const marketLower = gm.market.toLowerCase()
      if (marketLower.includes('half') || marketLower.includes('1st')) {
        gm.values?.forEach((v: any) => {
          const valueLower = String(v.value).toLowerCase()
          if (valueLower.includes('over') && valueLower.includes('0.5')) {
            console.log(`   ✅ FOUND Over 0.5 1H: "${gm.market}" -> "${v.value}" @${v.odd}`)
            foundOver05_1H = true
          }
          if (valueLower.includes('over') && valueLower.includes('1.5')) {
            console.log(`   ✅ FOUND Over 1.5 1H: "${gm.market}" -> "${v.value}" @${v.odd}`)
            foundOver15_1H = true
          }
        })
      }
    })

    if (!foundOver05_1H) {
      console.log('   ❌ NOT FOUND: Over 0.5 First Half Goals')
      console.log('   📝 This explains why no Over 0.5 1H picks are generated!')
    }

    if (!foundOver15_1H) {
      console.log('   ❌ NOT FOUND: Over 1.5 First Half Goals')
    }

    return { allMarkets, goalMarkets, cornerMarkets, foundOver05_1H, foundOver15_1H }
  }

  return null
}

async function diagnoseH2H(teamA: number, teamB: number) {
  console.log('\n' + '='.repeat(60))
  console.log('4️⃣ H2H DIAGNOSIS')
  console.log('='.repeat(60))

  const data = await fetchWithLogging('/fixtures/headtohead', {
    h2h: `${teamA}-${teamB}`,
    last: 5,
  })

  if (data?.response?.length > 0) {
    console.log('\n📋 H2H Matches Found:', data.response.length)

    data.response.forEach((match: any, idx: number) => {
      console.log(`\n   Match ${idx + 1}: ${match.teams.home.name} vs ${match.teams.away.name}`)
      console.log(`      Score: ${match.goals.home} - ${match.goals.away}`)
      console.log(`      HT Score: ${match.score.halftime.home} - ${match.score.halftime.away}`)

      // Check for statistics
      if (match.statistics) {
        console.log(`      Statistics available: ${match.statistics.length} entries`)
      }
    })

    return data.response
  }

  return null
}

async function checkAPISubscription() {
  console.log('\n' + '='.repeat(60))
  console.log('5️⃣ API SUBSCRIPTION CHECK')
  console.log('='.repeat(60))

  const data = await fetchWithLogging('/status', {})

  if (data?.response) {
    const status = data.response
    console.log('\n📋 Subscription Details:')
    console.log(`   Plan: ${status.subscription?.plan}`)
    console.log(`   End date: ${status.subscription?.end}`)
    console.log(`   Requests today: ${status.requests?.current}/${status.requests?.limit_day}`)

    // Check available endpoints
    console.log('\n📋 Key Endpoints Access:')
    console.log(`   Fixtures: ✅`)
    console.log(`   Odds: ${status.subscription?.plan?.toLowerCase().includes('free') ? '❌ Limited' : '✅'}`)
    console.log(`   Statistics: ${status.subscription?.plan?.toLowerCase().includes('free') ? '❌ Limited' : '✅'}`)

    return status
  }

  return null
}

async function main() {
  console.log('🔍 BETTING API DIAGNOSTIC TOOL')
  console.log('='.repeat(60))
  console.log(`API Key: ${API_KEY ? '✅ Set (' + API_KEY.substring(0, 8) + '...)' : '❌ Not set'}`)

  if (!API_KEY) {
    console.log('\n❌ ERROR: API_FOOTBALL_KEY not set in .env')
    process.exit(1)
  }

  // Check subscription first
  await checkAPISubscription()

  // Use a date with fixtures (tomorrow or a known date)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 4) // 4 days ahead for better fixture availability
  const testDate = tomorrow.toISOString().split('T')[0]

  // Test with La Liga 2 (league 141) which we know has fixtures
  const testLeagueId = 141

  console.log(`\n📅 Testing with date: ${testDate}, league: ${testLeagueId}`)

  // 1. Get fixtures
  const fixtureId = await diagnoseFixtures(testDate, testLeagueId)

  if (!fixtureId) {
    console.log('\n⚠️ No fixtures found. Trying with a different league...')
    // Try Premier League
    const altFixtureId = await diagnoseFixtures(testDate, 39)
    if (altFixtureId) {
      await diagnoseOdds(altFixtureId)
    }
  } else {
    // 2. Get odds for this fixture
    await diagnoseOdds(fixtureId)
  }

  // 3. Get team stats (use known teams)
  // Real Madrid = 541, Barcelona = 529 (La Liga teams)
  await diagnoseTeamStats(140, 541)

  // 4. H2H
  await diagnoseH2H(541, 529)

  console.log('\n' + '='.repeat(60))
  console.log('📊 DIAGNOSIS COMPLETE')
  console.log('='.repeat(60))
  console.log('\n🔑 Key Questions Answered:')
  console.log('   1. Does API return Over 0.5 1H odds? → See CRITICAL CHECK above')
  console.log('   2. What team stats are available? → See TEAM STATS section')
  console.log('   3. Are corners available? → See CORNER MARKETS section')
  console.log('   4. What is API subscription level? → See SUBSCRIPTION CHECK')
}

main().catch(console.error)
