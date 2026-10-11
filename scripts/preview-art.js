'use strict';

// 在终端预览像素画 (npm run preview-art), 校验宽度与配色完整性
const PET_ART = require('../public/pet-art.js');

for (const key of Object.keys(PET_ART.STAGES)) {
  const errors = PET_ART.validate(key);
  console.log(`\n=== ${key} ${errors.length ? '❌' : '✓'} ===`);
  errors.forEach((e) => console.log('  ! ' + e));
  const { rows } = PET_ART.buildMap(key);
  rows.forEach((row) => console.log('  ' + row));

  const states = { blink: { blink: true }, eat: { eat: true }, sad: { sad: true }, happy: { happy: true } };
  for (const [name, st] of Object.entries(states)) {
    if (key === 'egg') continue;
    const m = PET_ART.buildMap(key, st);
    console.log(`  -- ${name} --`);
    m.rows.forEach((row, i) => {
      if (i === m.stage.eyesRow || i === m.stage.mouthRow || name === 'happy') console.log('  ' + row);
    });
  }
}
