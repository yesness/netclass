const ncc = require('@vercel/ncc');
const fs = require('fs');
const path = require('path');

ncc(path.join(__dirname, 'lib/index.js'), {
    minify: true,
}).then(({ code }) => {
    fs.writeFileSync(path.join(__dirname, 'lib/netclass.min.js'), code);
});
