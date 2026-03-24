/**
 * Manual Betting Scan Script
 *
 * Run with: npx ts-node scripts/run-betting-scan.ts
 * Or add to package.json: "betting:scan": "ts-node scripts/run-betting-scan.ts"
 */

import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { NightlyAnalysisCron } from '../src/betting/cron/nightly-analysis.cron'

async function bootstrap() {
  // Get date from command line argument (e.g., node script.js 2026-03-28)
  const targetDate = process.argv[2]

  console.log('🚀 Starting betting scan...\n')
  if (targetDate) {
    console.log(`📅 Target date: ${targetDate}\n`)
  }

  // Create NestJS application context
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  })

  try {
    // Get the NightlyAnalysisCron service
    const nightlyAnalysis = app.get(NightlyAnalysisCron)

    // Run the manual analysis
    console.log('📊 Running nightly analysis...\n')
    const result = await nightlyAnalysis.triggerManualAnalysis(targetDate)

    console.log('\n✅ Scan completed!')
    console.log('━'.repeat(40))
    console.log(`📊 Leagues analyzed: ${result.leagues}`)
    console.log(`🎯 Picks generated: ${result.picks}`)
    console.log(`🔗 Combos generated: ${result.combos}`)
    console.log('━'.repeat(40))
  } catch (error) {
    console.error('❌ Scan failed:', error)
    process.exit(1)
  } finally {
    await app.close()
  }

  process.exit(0)
}

bootstrap()
