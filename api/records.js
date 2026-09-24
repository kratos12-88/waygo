import crypto from 'node:crypto';
import { catalog, config } from '../public/data.js';
const apps = new Set(['chowcart','rentsmall','waygo','sureplug','workchop','lightpadi','pricepal','flipam','shoppadi','borrowbeta']);
let db;
async function storage() {
  if(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN){
    return async(cmd,...args)=>{
      const response=await fetch(process.env.KV_REST_API_URL,{method:'POST',headers:{Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify([cmd,...args])});
      if(!response.ok)throw new Error('Storage unavailable'); const data=await response.json();if(data.error)throw new Error('Storage unavailable');return data.result;
    };
  }
  if(process.env.VERCEL)throw new Error('Configure durable storage before enabling live records');
  if(!db){const {DatabaseSync}=await import('node:sqlite');db=new DatabaseSync(process.env.DB_PATH||'app.sqlite');db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)');}
  return async(cmd,key,val)=>cmd==='GET'?db.prepare('SELECT value FROM kv WHERE key=?').get(key)?.value:db.prepare('INSERT INTO kv VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,val);
}
function clean(value,max=500){return typeof value==='string'?value.trim().slice(0,max):'';}
export function validate(input){
  const item=catalog.find(x=>x.id===input.itemId);
  const details={};for(const [k,v]of Object.entries(input.details||{})){if(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/.test(k))details[k]=clean(String(v));}
  const quantity=Number(input.quantity||1);if(!Number.isInteger(quantity)||quantity<1||quantity>30)throw new Error('Quantity must be between 1 and 30');
  if(!input.custom && !item)throw new Error('Choose an available item');
  if(input.custom && !['sureplug','workchop','flipam','shoppadi'].includes(config.id))throw new Error('Custom records are not supported');
  let title=item?.name||clean(input.title,120);if(title.length<3)throw new Error('Enter a title of at least 3 characters');
  const price=item?.price??Number(input.price);if(!Number.isFinite(price)||price<0||price>100000000)throw new Error('Enter a valid amount');
  if(details.date && (!/^\d{4}-\d{2}-\d{2}$/.test(details.date)||details.date<new Date().toISOString().slice(0,10)))throw new Error('Choose today or a future date');
  if(item?.capacity && quantity>item.capacity)throw new Error('Quantity exceeds available capacity');
  let total=config.id==='borrowbeta'?price*quantity+(item?.deposit||0):price*quantity+(item?.fee||0);
  if(config.id==='pricepal'){
    let basket;try{basket=JSON.parse(details.basket)}catch{throw new Error('Enter a valid basket')}
    if(!basket||typeof basket!=='object'||Array.isArray(basket))throw new Error('Enter a valid basket');
    const stores={market:{factor:1,delivery:1200,name:'Neighbourhood Market'},corner:{factor:1.08,delivery:500,name:'Corner Groceries'},bulk:{factor:.94,delivery:2000,name:'Bulk Mart'}};
    const store=stores[details.store];if(!store)throw new Error('Choose a store');let count=0;total=store.delivery;
    for(const [id,q] of Object.entries(basket)){const product=catalog.find(x=>x.id===id);if(!product||!Number.isInteger(q)||q<0||q>30)throw new Error('Enter valid basket quantities');count+=q;total+=Math.round(product.price*store.factor)*q;}
    if(!count)throw new Error('Choose at least one item');title=store.name+' shopping basket';
  }
  if(config.id==='shoppadi'){const cost=Number(details.cost||0);if(!Number.isFinite(cost)||cost<0||cost>100000000)throw new Error('Enter a valid cost');details.cost=String(cost);if(!['sale','expense','debt'].includes(details.type))throw new Error('Choose a transaction type');}
  return {id:crypto.randomUUID(),app:config.id,title,itemId:item?.id||null,quantity,price,total,details,status:config.id==='flipam'&&!input.custom?'Requested':config.initialStatus,createdAt:new Date().toISOString()};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const reply=(code,data)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  try{
    if(!apps.has(config.id))return reply(500,{error:'Unknown product'});
    if(!['GET','POST','PATCH'].includes(req.method)){res.setHeader('Allow','GET, POST, PATCH');return reply(405,{error:'Method not allowed'});}
    if(req.method!=='GET'){
      if(!String(req.headers['content-type']||'').startsWith('application/json'))return reply(415,{error:'JSON required'});
      const origin=req.headers.origin;if(origin && new URL(origin).host!==req.headers.host)return reply(403,{error:'Origin not allowed'});
    }
    const secret=process.env.SESSION_SECRET||(process.env.VERCEL?null:'local-development-secret-not-for-production');if(!secret)return reply(503,{error:'Live records are not configured. Use the clearly labelled demo.'});
    const sign=id=>crypto.createHmac('sha256',secret).update(id).digest('hex');
    const raw=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('session='))?.slice(8)||'';let[id,sig]=raw.split('.');
    if(!id||!/^[a-f0-9]{32}$/.test(id)||!sig||!/^[a-f0-9]{64}$/.test(sig)||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(sign(id)))){id=crypto.randomBytes(16).toString('hex');res.setHeader('Set-Cookie',`session=${id}.${sign(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${process.env.VERCEL?'; Secure':''}`);}
    const store=await storage();const key=`${config.id}:${id}`;
    const records=JSON.parse(await store('GET',key)||'[]');
    if(req.method==='GET')return reply(200,{records,mode:'server'});
    let body=req.body;if(body===undefined){let rawBody='';for await(const chunk of req){rawBody+=chunk;if(rawBody.length>20000)return reply(413,{error:'Request too large'});}try{body=JSON.parse(rawBody)}catch{return reply(400,{error:'Invalid JSON'})}}
    if(typeof body==='string'){try{body=JSON.parse(body)}catch{return reply(400,{error:'Invalid JSON'})}}
    if(!body||typeof body!=='object'||Array.isArray(body))return reply(400,{error:'Invalid request'});
    if(req.method==='POST'){
      if(records.length>=500)return reply(409,{error:'This workspace has reached its 500-record limit'});
      const record=validate(body);records.unshift(record);await store('SET',key,JSON.stringify(records));return reply(201,{record});
    }
    const record=records.find(x=>x.id===body.id);if(!record)return reply(404,{error:'Record not found'});
    const allowed=config.transitions[record.status]||[];if(!allowed.includes(body.status))return reply(409,{error:'This status change is not allowed'});
    record.status=body.status;record.updatedAt=new Date().toISOString();await store('SET',key,JSON.stringify(records));return reply(200,{record});
  }catch(error){const client=/Choose|Enter|Quantity|Custom/.test(error.message);reply(client?400:503,{error:client?error.message:'Storage is unavailable. Your change was not saved. Please retry.'});}
}
