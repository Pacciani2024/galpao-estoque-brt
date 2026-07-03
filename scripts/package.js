
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

async function packageApp() {
    const rootDir = path.join(__dirname, '..');
    const distDir = path.join(rootDir, 'dist');

    // Folders and files to include in the package
    const includeItems = [
        'public',
        'logs',
        'data',
        'agent',
        'modules',
        'services',
        '.env',
        'mark_ears.py',
        'requirements.txt',
        'scheduler.js'
    ];

    const platforms = [
        { name: 'windows', suffix: '-win.exe', buildAlias: 'build:win' },
        { name: 'linux', suffix: '-linux', buildAlias: 'build:linux' }
    ];

    try {
        console.log('🚀 Starting Packaging Process...');

        for (const platform of platforms) {
            const platformDist = path.join(distDir, platform.name);
            console.log(`\n📦 Packaging for ${platform.name.toUpperCase()}...`);

            // 1. Clean and create platform dist folder
            if (fs.existsSync(platformDist)) {
                fs.removeSync(platformDist);
            }
            fs.ensureDirSync(platformDist);

            // 2. Build binary
            console.log(`   🛠️  Building binary (${platform.buildAlias})...`);
            execSync(`npm run ${platform.buildAlias}`, { stdio: 'inherit', cwd: rootDir });

            // 3. The binary is already in the correct folder (dist/platform) due to package.json scripts
            const binaryName = `BRT-Audiovisual${platform.suffix}`;
            console.log(`   ✅ Binary built at: dist/${platform.name}/${binaryName}`);

            // 4. Copy assets
            console.log('   📂 Copying assets...');
            for (const item of includeItems) {
                const src = path.join(rootDir, item);
                const dest = path.join(platformDist, item);
                if (fs.existsSync(src)) {
                    fs.copySync(src, dest);
                    console.log(`      ✅ Copied: ${item}`);
                } else {
                    console.warn(`      ⚠️  Warning: ${item} not found, skipping.`);
                }
            }

            // 5. Create startup scripts
            console.log('   📄 Creating startup scripts...');
            if (platform.name === 'windows') {
                const batContent = `@echo off\ntitle BRT Audiovisual Server\necho Iniciando BRT Audiovisual...\n"${binaryName}"\npause`;
                fs.writeFileSync(path.join(platformDist, 'INICIAR_SERVIDOR.bat'), batContent);
            } else {
                const shContent = `#!/bin/bash\necho "Iniciando BRT Audiovisual..."\n./${binaryName}`;
                fs.writeFileSync(path.join(platformDist, 'iniciar_servidor.sh'), shContent);
                execSync(`chmod +x "${path.join(platformDist, 'iniciar_servidor.sh')}"`);
            }
        }

        console.log('\n✅ Packaging completed successfully! Check the dist/ folder.');

    } catch (error) {
        console.error('\n❌ Packaging failed:', error);
        process.exit(1);
    }
}

// Simple check for fs-extra, install if missing
try {
    require('fs-extra');
    packageApp();
} catch (e) {
    console.log('📦 Installing fs-extra for packaging...');
    execSync('npm install fs-extra --no-save');
    packageApp();
}
