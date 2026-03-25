/**
 * Seed default AI generation presets into the database
 * Run with: node server/seed-presets.mjs
 */

import { drizzle } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import { aiGenerationPresets } from '../drizzle/schema.ts';
import { DEFAULT_PRESETS } from './presets-data.ts';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

async function seedPresets() {
  const db = drizzle(DATABASE_URL);

  console.log('Starting preset seeding...');

  for (const preset of DEFAULT_PRESETS) {
    try {
      // Check if preset with the same name already exists
      const existing = await db.select()
        .from(aiGenerationPresets)
        .where(eq(aiGenerationPresets.name, preset.name))
        .limit(1);

      if (existing.length > 0) {
        console.log(`Skipping existing preset: ${preset.name}`);
        continue;
      }

      // Insert new preset
      await db.insert(aiGenerationPresets).values({
        category: preset.category,
        name: preset.name,
        description: preset.description,
        icon: preset.icon,
        postType: preset.postType,
        defaultParams: JSON.stringify(preset.defaultParams),
        isSystem: true,
        displayOrder: preset.displayOrder,
        usageCount: 0,
      });

      console.log(`✓ Inserted preset: ${preset.name}`);
    } catch (error) {
      console.error(`✗ Failed to insert preset: ${preset.name}`, error);
    }
  }

  console.log('Preset seeding completed!');
  process.exit(0);
}

seedPresets().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
