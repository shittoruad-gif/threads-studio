import { SignJWT } from 'jose';
const COOLIFY='http://163.44.103.9:8000', APP_UUID='g89zg5s4u6xr08gp2b0dptcn', BASE='https://threads-studio.com';
const r0 = await fetch(`${COOLIFY}/api/v1/applications/${APP_UUID}/envs`, { headers:{Authorization:`Bearer ${process.env.COOLIFY_TOKEN}`}});
const list = await r0.json(); const e={}; for(const x of list) if(!(x.key in e)) e[x.key]=x.value;
const secret=new TextEncoder().encode(e.JWT_SECRET);
const jwt = await new SignJWT({ openId:'email_norijdh@gmail.com', appId:e.VITE_APP_ID, name:'ops'})
  .setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('20m').sign(secret);
const r = await fetch(`${BASE}/api/trpc/autoPost.generateNow?batch=1`, {
  method:'POST', headers:{Cookie:`app_session_id=${jwt}`,'Content-Type':'application/json', Origin: BASE},
  body: JSON.stringify({"0":{"json":null}}) });
console.log('status', r.status, (await r.text()).slice(0,400));
