'use strict';

const minMajor = 22;
const maxMajor = 24;
const current = process.versions.node;
const major = Number(current.split('.')[0] || 0);

if (major < minMajor || major > maxMajor) {
    console.error(
        `[valorantapi] Node.js incompatível: v${current}. Use Node ${minMajor}.x - ${maxMajor}.x (ex.: \`nvm use ${maxMajor}\`).`,
    );
    process.exit(1);
}
