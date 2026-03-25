import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('OGP Meta Tags', () => {
  const indexPath = path.resolve(__dirname, '../client/index.html');
  let indexContent: string;

  beforeAll(() => {
    indexContent = fs.readFileSync(indexPath, 'utf-8');
  });

  it('should have og:type meta tag', () => {
    expect(indexContent).toContain('property="og:type"');
    expect(indexContent).toContain('content="website"');
  });

  it('should have og:title meta tag', () => {
    expect(indexContent).toContain('property="og:title"');
  });

  it('should have og:description meta tag', () => {
    expect(indexContent).toContain('property="og:description"');
  });

  it('should have og:site_name meta tag', () => {
    expect(indexContent).toContain('property="og:site_name"');
  });

  it('should have og:image meta tag with valid URL', () => {
    const ogImageMatch = indexContent.match(/property="og:image"\s+content="([^"]+)"/);
    expect(ogImageMatch).not.toBeNull();
    expect(ogImageMatch![1]).toMatch(/^https:\/\//);
    expect(ogImageMatch![1]).toMatch(/\.(png|jpg|jpeg|webp)$/i);
  });

  it('should have og:image:width and og:image:height', () => {
    expect(indexContent).toContain('property="og:image:width"');
    expect(indexContent).toContain('property="og:image:height"');
  });

  it('should have og:image:alt for accessibility', () => {
    expect(indexContent).toContain('property="og:image:alt"');
  });

  it('should have twitter:card set to summary_large_image', () => {
    expect(indexContent).toContain('name="twitter:card"');
    expect(indexContent).toContain('content="summary_large_image"');
  });

  it('should have twitter:title meta tag', () => {
    expect(indexContent).toContain('name="twitter:title"');
  });

  it('should have twitter:description meta tag', () => {
    expect(indexContent).toContain('name="twitter:description"');
  });

  it('should have twitter:image meta tag with valid URL', () => {
    const twitterImageMatch = indexContent.match(/name="twitter:image"\s+content="([^"]+)"/);
    expect(twitterImageMatch).not.toBeNull();
    expect(twitterImageMatch![1]).toMatch(/^https:\/\//);
  });

  it('should have twitter:image:alt for accessibility', () => {
    expect(indexContent).toContain('name="twitter:image:alt"');
  });

  it('should have matching og:image and twitter:image URLs', () => {
    const ogImageMatch = indexContent.match(/property="og:image"\s+content="([^"]+)"/);
    const twitterImageMatch = indexContent.match(/name="twitter:image"\s+content="([^"]+)"/);
    expect(ogImageMatch).not.toBeNull();
    expect(twitterImageMatch).not.toBeNull();
    expect(ogImageMatch![1]).toBe(twitterImageMatch![1]);
  });

  it('should have page title tag', () => {
    const titleMatch = indexContent.match(/<title>([^<]+)<\/title>/);
    expect(titleMatch).not.toBeNull();
    expect(titleMatch![1].length).toBeGreaterThan(0);
  });

  it('should have meta description', () => {
    expect(indexContent).toContain('name="description"');
    const descMatch = indexContent.match(/name="description"\s+content="([^"]+)"/);
    expect(descMatch).not.toBeNull();
    expect(descMatch![1].length).toBeGreaterThan(50);
  });
});
