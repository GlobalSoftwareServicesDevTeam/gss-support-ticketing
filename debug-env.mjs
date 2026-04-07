import { readFileSync } from 'fs';
const c = readFileSync('.env', 'utf8');
const lines = c.split('\n');
for (const l of lines) {
  if (l.includes('INVOICE')) {
    console.log('RAW:', JSON.stringify(l));
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) {
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"'))) val = val.slice(1,-1);
      console.log('KEY:', m[1].trim(), 'VAL:', val.substring(0, 30) + '...');
    } else {
      console.log('NO MATCH');
    }
  }
}
