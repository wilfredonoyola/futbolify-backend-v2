/**
 * Migration script to fix photo URLs in the database
 * 
 * Issues fixed:
 * 1. Remove query params from thumbnailUrl (Bunny Storage doesn't support image transformation)
 * 2. Fix old Pull Zone URLs (futbolify.b-cdn.net -> futbolifystoragezone.b-cdn.net)
 * 
 * Run with: npx ts-node src/scripts/fix-photo-urls.ts
 */

import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/futbolify';
// Fix: futbolifystoragezone.b-cdn.net is NOT a valid Pull Zone
// The correct Pull Zone is futbolify.b-cdn.net
const OLD_CDN = 'futbolifystoragezone.b-cdn.net';
const NEW_CDN = 'futbolify.b-cdn.net';

// Simple schema for the migration
const MediaSchema = new mongoose.Schema({
  type: String,
  url: String,
  thumbnailUrl: String,
}, { collection: 'media', strict: false });

const Media = mongoose.model('MediaMigration', MediaSchema);

async function fixPhotoUrls() {
  console.log('🔧 Starting photo URL migration...\n');
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Find all photos
    const photos = await Media.find({ type: 'PHOTO' });
    console.log(`📸 Found ${photos.length} photos to check\n`);
    
    let fixedCount = 0;
    let errorCount = 0;
    
    for (const photo of photos) {
      const updates: any = {};
      let needsUpdate = false;
      
      // Fix URL - replace old CDN with new one
      if (photo.url && photo.url.includes(OLD_CDN)) {
        updates.url = photo.url.replace(OLD_CDN, NEW_CDN);
        needsUpdate = true;
        console.log(`  📝 Fixing URL: ${photo._id}`);
      }
      
      // Fix thumbnailUrl - remove query params AND fix CDN
      if (photo.thumbnailUrl) {
        let newThumbnailUrl = photo.thumbnailUrl;
        
        // Remove query params
        if (newThumbnailUrl.includes('?')) {
          newThumbnailUrl = newThumbnailUrl.split('?')[0];
          needsUpdate = true;
        }
        
        // Fix old CDN
        if (newThumbnailUrl.includes(OLD_CDN)) {
          newThumbnailUrl = newThumbnailUrl.replace(OLD_CDN, NEW_CDN);
          needsUpdate = true;
        }
        
        if (newThumbnailUrl !== photo.thumbnailUrl) {
          updates.thumbnailUrl = newThumbnailUrl;
          console.log(`  🖼️  Fixing thumbnail: ${photo._id}`);
        }
      }
      
      // Apply updates if needed
      if (needsUpdate) {
        try {
          await Media.updateOne(
            { _id: photo._id },
            { $set: updates }
          );
          fixedCount++;
        } catch (err) {
          console.error(`  ❌ Error updating ${photo._id}:`, err);
          errorCount++;
        }
      }
    }
    
    console.log('\n========================================');
    console.log(`✅ Migration complete!`);
    console.log(`   Fixed: ${fixedCount} photos`);
    console.log(`   Errors: ${errorCount}`);
    console.log(`   Skipped: ${photos.length - fixedCount - errorCount} (already correct)`);
    console.log('========================================\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the migration
fixPhotoUrls();
