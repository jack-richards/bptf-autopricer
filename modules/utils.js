// utils.js
const fs = require('fs');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

module.exports = { loadJson, saveJson };
