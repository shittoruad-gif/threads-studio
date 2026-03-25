import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('PWA Configuration', () => {
  const publicDir = path.resolve(__dirname, '../client/public');

  it('should have a valid manifest.json', () => {
    const manifestPath = path.join(publicDir, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    
    // Required fields
    expect(manifest.name).toBeDefined();
    expect(manifest.short_name).toBeDefined();
    expect(manifest.start_url).toBeDefined();
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBeDefined();
    expect(manifest.theme_color).toBeDefined();
    expect(manifest.icons).toBeDefined();
    expect(Array.isArray(manifest.icons)).toBe(true);
  });

  it('should have required icon sizes in manifest', () => {
    const manifestPath = path.join(publicDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    
    const iconSizes = manifest.icons.map((icon: any) => icon.sizes);
    
    // Required PWA icon sizes
    expect(iconSizes).toContain('192x192');
    expect(iconSizes).toContain('512x512');
  });

  it('should have maskable icons in manifest', () => {
    const manifestPath = path.join(publicDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    
    const maskableIcons = manifest.icons.filter((icon: any) => icon.purpose === 'maskable');
    expect(maskableIcons.length).toBeGreaterThan(0);
  });

  it('should have all icon files referenced in manifest', () => {
    const manifestPath = path.join(publicDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    
    for (const icon of manifest.icons) {
      const iconPath = path.join(publicDir, icon.src.replace(/^\//, ''));
      expect(fs.existsSync(iconPath), `Missing icon: ${icon.src}`).toBe(true);
    }
  });

  it('should have a service worker file', () => {
    const swPath = path.join(publicDir, 'sw.js');
    expect(fs.existsSync(swPath)).toBe(true);
    
    const swContent = fs.readFileSync(swPath, 'utf-8');
    // Should have install, activate, and fetch event listeners
    expect(swContent).toContain("addEventListener('install'");
    expect(swContent).toContain("addEventListener('activate'");
    expect(swContent).toContain("addEventListener('fetch'");
  });

  it('should have an offline fallback page', () => {
    const offlinePath = path.join(publicDir, 'offline.html');
    expect(fs.existsSync(offlinePath)).toBe(true);
    
    const offlineContent = fs.readFileSync(offlinePath, 'utf-8');
    expect(offlineContent).toContain('オフライン');
  });

  it('should have apple-touch-icon', () => {
    const appleTouchIconPath = path.join(publicDir, 'apple-touch-icon.png');
    expect(fs.existsSync(appleTouchIconPath)).toBe(true);
  });

  it('should have favicon files', () => {
    expect(fs.existsSync(path.join(publicDir, 'favicon.ico'))).toBe(true);
    expect(fs.existsSync(path.join(publicDir, 'favicon-32x32.png'))).toBe(true);
    expect(fs.existsSync(path.join(publicDir, 'favicon-16x16.png'))).toBe(true);
  });

  it('should have PWA meta tags in index.html', () => {
    const indexPath = path.resolve(__dirname, '../client/index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf-8');
    
    // Manifest link
    expect(indexContent).toContain('rel="manifest"');
    expect(indexContent).toContain('manifest.json');
    
    // Theme color
    expect(indexContent).toContain('name="theme-color"');
    
    // Apple mobile web app
    expect(indexContent).toContain('apple-mobile-web-app-capable');
    expect(indexContent).toContain('apple-touch-icon');
    
    // Service worker registration
    expect(indexContent).toContain('serviceWorker');
    expect(indexContent).toContain("register('/sw.js')");
  });

  it('should have valid manifest JSON structure', () => {
    const manifestPath = path.join(publicDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    
    // Check theme color is valid hex
    expect(manifest.theme_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(manifest.background_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    
    // Check display mode
    expect(['standalone', 'fullscreen', 'minimal-ui', 'browser']).toContain(manifest.display);
    
    // Check start_url
    expect(manifest.start_url).toBeDefined();
    expect(typeof manifest.start_url).toBe('string');
  });

  it('should have shortcuts defined in manifest', () => {
    const manifestPath = path.join(publicDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    
    expect(manifest.shortcuts).toBeDefined();
    expect(Array.isArray(manifest.shortcuts)).toBe(true);
    expect(manifest.shortcuts.length).toBeGreaterThan(0);
    
    for (const shortcut of manifest.shortcuts) {
      expect(shortcut.name).toBeDefined();
      expect(shortcut.url).toBeDefined();
    }
  });

  it('should have Japanese language set in manifest', () => {
    const manifestPath = path.join(publicDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    
    expect(manifest.lang).toBe('ja');
  });
});
