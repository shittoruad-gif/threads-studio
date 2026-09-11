import { SignJWT } from "jose";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync("/Users/kabushikikaishashitsutoru/CODE/threads_studio/.env","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const [openId, name] = process.argv.slice(2);
const token = await new SignJWT({ openId, appId: env.VITE_APP_ID, name }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode(env.JWT_SECRET));
console.log(token);
