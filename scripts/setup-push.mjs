import webpush from 'web-push';
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const subject=process.argv[2];
if(!subject||!/^https:\/\/|^mailto:/.test(subject)){
  console.error('Usage: npm run setup:push -- https://your-app.vercel.app');process.exit(1);
}
const keys=webpush.generateVAPIDKeys();
const destination='.env.push.local';
writeFileSync(destination,[`VAPID_PUBLIC_KEY=${keys.publicKey}`,`VAPID_PRIVATE_KEY=${keys.privateKey}`,`VAPID_SUBJECT=${subject}`,`CRON_SECRET=${randomBytes(32).toString('hex')}`,''].join('\n'),{flag:'wx',mode:0o600});
console.log(`Created ${destination}. Add its four values to Vercel Production environment variables. Keep this file private; it is ignored by Git.`);
