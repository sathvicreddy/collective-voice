const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, '..');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            if (file !== 'vendor') results = results.concat(walk(filePath));
        } else if (file.endsWith('.js') && file !== 'migrate.js' && file !== 'delegate.js') {
            results.push(filePath);
        }
    });
    return results;
}

const files = walk(jsDir);

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');

    // misc
    content = content.replace(/onclick="exportAnalyticsData\(\)"/g, 'data-action="exportAnalyticsData"');
    content = content.replace(/onclick="renderActivity\('([^']+)'\)"/g, 'data-action="renderActivity" data-tab="$1"');
    content = content.replace(/onclick="showHelpToast\('([^']+)'\)"/g, 'data-action="showHelpToast" data-msg="$1"');
    content = content.replace(/onclick="helpLiveChat\(\)"/g, 'data-action="helpLiveChat"');
    content = content.replace(/onclick="scrollToLandingTop\(\)"/g, 'data-action="scrollToLandingTop"');
    content = content.replace(/onclick="window\.moderatorAnswerQuestion && moderatorAnswerQuestion\('([^']+)'\)"/g, 'data-action="moderatorAnswerQuestion" data-id="$1"');
    content = content.replace(/onclick="window\.moderatorDeferQuestion && moderatorDeferQuestion\('([^']+)'\)"/g, 'data-action="moderatorDeferQuestion" data-id="$1"');

    // some weird string alerts
    content = content.replace(/onclick="alert\('[^']+'\);\s*return false;"/g, 'data-action="alertNotConfigured"');

    fs.writeFileSync(file, content, 'utf8');
});

console.log('Migration script 6 completed.');
