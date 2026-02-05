/**
 * Seed Preset Templates
 *
 * This script seeds the database with preset templates from the JSON export.
 * It uses upsert (findOneAndUpdate with upsert) to be idempotent - safe to run multiple times.
 *
 * Prerequisites:
 * 1. Run export-presets.ts in futbolify-web-v2 to generate the JSON file
 * 2. Copy the JSON file to this project: data/preset-templates.json
 *
 * Run with: npx ts-node src/scripts/seed-preset-templates.ts
 */

import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/futbolify';

// System user ObjectId for preset templates (fixed ID for consistency)
const SYSTEM_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');

// Template schema for seeding (simplified)
const TemplateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
    name: { type: String, required: true },
    description: String,
    category: { type: String, required: true },
    thumbnail: String,
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    backgroundColor: { type: String, required: true },
    templateData: { type: mongoose.Schema.Types.Mixed, required: true },
    tags: [String],
    isPublished: { type: Boolean, default: false },
    isPreset: { type: Boolean, default: false },
    presetId: String,
    type: {
      type: String,
      enum: ['template', 'design'],
      default: 'template',
    },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    presetCategory: String,
  },
  { timestamps: true, collection: 'templates' },
);

const Template = mongoose.model('TemplateSeed', TemplateSchema);

interface PresetData {
  presetId: string;
  name: string;
  description: string;
  presetCategory: string;
  thumbnail: string | null;
  width: number;
  height: number;
  backgroundColor: string;
  templateData: Record<string, unknown>;
}

interface ExportData {
  version: string;
  exportedAt: string;
  totalPresets: number;
  categories: Array<{ id: string; name: string; icon: string }>;
  presets: PresetData[];
}

async function seedPresetTemplates() {
  console.log('🌱 Starting preset templates seed...\n');

  // Read the JSON file
  const jsonPath = path.join(__dirname, '..', '..', 'data', 'preset-templates.json');

  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ JSON file not found: ${jsonPath}`);
    console.error('\nPlease run export-presets.ts in futbolify-web-v2 first:');
    console.error(
      '  cd ../futbolify-web-v2 && npx ts-node scripts/export-presets.ts',
    );
    console.error('\nThen copy the file:');
    console.error(
      '  cp ../futbolify-web-v2/data/preset-templates.json ./data/',
    );
    process.exit(1);
  }

  const rawData = fs.readFileSync(jsonPath, 'utf8');
  const exportData: ExportData = JSON.parse(rawData);

  console.log(`📦 Loaded export data:`);
  console.log(`   Version: ${exportData.version}`);
  console.log(`   Exported at: ${exportData.exportedAt}`);
  console.log(`   Total presets: ${exportData.totalPresets}`);
  console.log(`   Categories: ${exportData.categories.length}\n`);

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    let created = 0;
    let updated = 0;
    let errors = 0;

    // Group presets by category for logging
    const byCategory: Record<string, number> = {};

    for (const preset of exportData.presets) {
      try {
        const templateDoc = {
          userId: SYSTEM_USER_ID,
          name: preset.name,
          description: preset.description,
          category: preset.presetCategory, // Use presetCategory as the main category
          thumbnail: preset.thumbnail,
          width: preset.width,
          height: preset.height,
          backgroundColor: preset.backgroundColor,
          templateData: preset.templateData,
          tags: [preset.presetCategory, 'preset'],
          isPublished: true, // Presets are public
          isPreset: true, // Mark as preset
          presetId: preset.presetId, // Original preset ID
          type: 'template' as const,
          presetCategory: preset.presetCategory, // New field for filtering
        };

        const result = await Template.findOneAndUpdate(
          { presetId: preset.presetId }, // Find by presetId
          { $set: templateDoc },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        // Track stats
        byCategory[preset.presetCategory] =
          (byCategory[preset.presetCategory] || 0) + 1;

        // Check if it was created or updated (rough check by comparing updatedAt)
        const wasCreated =
          result.createdAt.getTime() === result.updatedAt.getTime();
        if (wasCreated) {
          created++;
        } else {
          updated++;
        }
      } catch (err) {
        console.error(`  ❌ Error seeding ${preset.presetId}:`, err);
        errors++;
      }
    }

    console.log('📊 Results by category:');
    Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        console.log(`   ${cat}: ${count}`);
      });

    console.log('\n========================================');
    console.log('✅ Seed complete!');
    console.log(`   Created: ${created}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total processed: ${exportData.presets.length}`);
    console.log('========================================\n');

    // Verify the count in DB
    const dbCount = await Template.countDocuments({ isPreset: true });
    console.log(`📈 Total presets in database: ${dbCount}\n`);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the seed
seedPresetTemplates();
