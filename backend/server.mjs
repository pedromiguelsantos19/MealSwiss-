import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||8080);
const DB_FILE=process.env.DB_FILE||path.join(ROOT,'data.json');
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'';
const COOKIE_SECRET=process.env.COOKIE_SECRET||'';
const PUBLIC_BASE_URL=String(process.env.PUBLIC_BASE_URL||`http://localhost:${PORT}`).replace(/\/$/,'');
const PRODUCTION=process.env.NODE_ENV==='production';
const CATEGORIES=['recipes','users','cooks','offers','products','priceSources','promotions','adSlots','orders'];
const STORE_HOSTS={Coop:['coop.ch','www.coop.ch'],Migros:['migros.ch','www.migros.ch'],Denner:['denner.ch','www.denner.ch'],Lidl:['lidl.ch','www.lidl.ch'],Aldi:['aldi-suisse.ch','www.aldi-suisse.ch']};
let db={recipes:[],users:[],cooks:[],offers:[],products:[],priceSources:[],prices:[],promotions:[],adSlots:[],orders:[],webhookEvents:[],updatedAt:null};
try{db={...db,...JSON.parse(fs.readFileSync(DB_FILE,'utf8'))}}catch(e){if(e.code!=='ENOENT')console.error('Failed to read data',e.message)}
let saveQueue=Promise.resolve();
function save(){db.updatedAt=new Date().toISOString();const payload=JSON.stringify(db,null,2);saveQueue=saveQueue.then(async()=>{const temp=DB_FILE+'.tmp';await fs.promises.writeFile(temp,payload,{mode:0o600});await fs.promises.rename(temp,DB_FILE)});return saveQueue}
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body))}
function fail(res,status,message){json(res,status,{error:message})}
function now(){return new Date().toISOString()}
function uid(){return crypto.randomUUID()}
function trimmed(x,n=200){return String(x??'').trim().slice(0,n)}
function nonNeg(x){return Number.isFinite(Number(x))&&Number(x)>=0?Number(x):null}
function parseCookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=').map(y=>y.trim())).filter(x=>x.length===2))}
function token(payload){let b=Buffer.from(JSON.stringify(payload)).toString('base64url');return b+'.'+crypto.createHmac('sha256',COOKIE_SECRET).update(b).digest('base64url')}
function admin(req){const t=parseCookies(req).ms_admin||'';const [a,b]=t.split('.');if(!a||!b||!COOKIE_SECRET)return false;const expected=crypto.createHmac('sha256',COOKIE_SECRET).update(a).digest('base64url');const left=Buffer.from(expected),right=Buffer.from(b);if(left.length!==right.length||!crypto.timingSafeEqual(left,right))return false;try{const p=JSON.parse(Buffer.from(a,'base64url'));return p.scope==='admin'&&p.exp>Date.now()}catch{return false}}
function passwordOK(password){if(!ADMIN_PASSWORD)return false;const a=crypto.createHash('sha256').update(String(password)).digest(),b=crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();return crypto.timingSafeEqual(a,b)}
const limits=new Map();
function rateOK(ip,key,limit=30,windowMs=60000){const id=ip+':'+key;const previous=limits.get(id)||{count:0,until:Date.now()+windowMs};if(previous.until<Date.now()){previous.count=0;previous.until=Date.now()+windowMs}previous.count++;limits.set(id,previous);return previous.count<=limit}
setInterval(()=>{for(const [k,v] of limits){if(v.until<Date.now())limits.delete(k)}},600000).unref();
function allowWrite(req){const origin=req.headers.origin;if(!origin)return true;try{return new URL(origin).origin===new URL(PUBLIC_BASE_URL).origin}catch{return false}}
async function body(req,max=131072){let out=[];let size=0;for await(const c of req){size+=c.length;if(size>max)throw Error('Payload demasiado grande');out.push(c)}return Buffer.concat(out).toString('utf8')}
function cleanRecord(type,input){const allowed={
 recipes:['name','description','category','minutes','servings','ingredients','steps','equipment','imageUrl','published'],
 users:['displayName','email','role','status','notes'],
 cooks:['displayName','location','description','verified','foodComplianceVerified','stripeConnectId','status'],
 offers:['cookId','name','description','priceCHF','servings','pickup','imageUrl','status'],
 products:['name','brand','unit','category','ean','status'],
 priceSources:['productId','store','url','permissionGranted','productName','status'],
 promotions:['title','description','url','status','startsAt','endsAt','brand','sponsorLabel'],
 adSlots:['placement','network','adUnitId','status','notes'],
 orders:['status','notes']
 };
 const obj={};for(const k of allowed[type]||[])if(Object.hasOwn(input,k))obj[k]=input[k];
 for(const [k,v] of Object.entries(obj)){if(typeof v==='string')obj[k]=trimmed(v,k==='description'?1500:500)}
 if(type==='offers'){const p=nonNeg(obj.priceCHF);if(p===null||p===0)throw Error('Preço da refeição inválido');obj.priceCHF=p}
 if(type==='priceSources'){if(!STORE_HOSTS[obj.store])throw Error('Loja não suportada');const url=validateSource(obj.url,obj.store);obj.url=url.href;obj.permissionGranted=obj.permissionGranted===true}
 if(type==='recipes'){if(!Array.isArray(obj.ingredients)||!Array.isArray(obj.steps))throw Error('Ingredientes e passos são obrigatórios')}
 if(type==='cooks'){obj.verified=obj.verified===true;obj.foodComplianceVerified=obj.foodComplianceVerified===true}
 return obj;
}
function validateSource(input,store){let u;try{u=new URL(input)}catch{throw Error('URL inválido')};if(u.protocol!=='https:'||u.username||u.password||u.port||!STORE_HOSTS[store].includes(u.hostname))throw Error('Só são permitidos links HTTPS oficiais da loja');return u}
function simpleDecode(x){return String(x).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')}
function jsonLdOffers(html){const found=[];const reg=/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;let m;while((m=reg.exec(html))){try{const ob=JSON.parse(simpleDecode(m[1]));const walk=o=>{if(Array.isArray(o))return o.forEach(walk);if(!o||typeof o!=='object')return;if(o['@graph'])walk(o['@graph']);const types=String(o['@type']||'');if(types.includes('Product')){const offers=Array.isArray(o.offers)?o.offers:[o.offers];for(const offer of offers){if(!offer)continue;const price=Number(offer.price||offer.lowPrice);const cur=String(offer.priceCurrency||'CHF').toUpperCase();if(Number.isFinite(price)&&price>0&&cur==='CHF')found.push({name:String(o.name||''),amount:price,currency:cur})}}};walk(ob)}catch{}}return found}
async function collectOne(source){if(!source.permissionGranted||source.status!=='active')return {status:'skipped',reason:'not authorized/enabled'};
 let u=validateSource(source.url,source.store);let resp=await fetch(u,{redirect:'manual',headers:{'User-Agent':'MealSwissPriceMonitor/1.0 (+contact admin; authorized public metadata only)','Accept':'text/html,application/ld+json'},signal:AbortSignal.timeout(12000)});
 if(!resp.ok)throw Error(`HTTP ${resp.status}`);if(!String(resp.headers.get('content-type')||'').includes('html'))throw Error('No HTML');
 const length=Number(resp.headers.get('content-length')||0);if(length>1_500_000)throw Error('Page too large');let html=(await resp.text()).slice(0,1_500_000);const offers=jsonLdOffers(html);if(!offers.length)throw Error('No verified CHF JSON-LD price');
 const target=String(source.productName||db.products.find(p=>p.id===source.productId)?.name||'').toLowerCase();let p=offers.find(x=>x.name.toLowerCase().includes(target)&&target.length>=3);if(!p)throw Error('Product identity differs from configured mapping');
 const observation={id:uid(),productId:source.productId,store:source.store,amount:p.amount,currency:'CHF',verifiedAt:now(),sourceUrl:u.href,sourceId:source.id,rawName:p.name};db.prices.push(observation);db.prices=db.prices.slice(-20000);await save();return {status:'ok',amount:p.amount};
}
let checking=false;
async function refreshPrices(){if(checking)return;checking=true;try{for(const src of db.priceSources.filter(x=>x.status==='active'&&x.permissionGranted)){try{let result=await collectOne(src);console.info('Source checked',src.id,result.status)}catch(e){console.warn('Price source unavailable',src.id,e.message)}}}finally{checking=false}}
setInterval(refreshPrices,24*60*60*1000).unref();
if(process.env.AUTO_REFRESH_PRICES==='true')setTimeout(refreshPrices,4000).unref();
function publicPrices(){return db.products.filter(p=>p.status==='active').map(p=>{const found=db.prices.filter(x=>x.productId===p.id).sort((a,b)=>b.verifiedAt.localeCompare(a.verifiedAt));const latestByStore=new Map();for(const f of found){if(!latestByStore.has(f.store)&&Date.now()-Date.parse(f.verifiedAt)<72*3600*1000)latestByStore.set(f.store,f)}return {id:p.id,name:p.name,brand:p.brand,unit:p.unit,prices:[...latestByStore.values()].map(x=>({store:x.store,amount:x.amount,verifiedAt:x.verifiedAt,sourceUrl:x.sourceUrl,productId:x.productId})),history:found.slice(0,60).map(x=>({date:x.verifiedAt.slice(0,10),store:x.store,amount:x.amount}))}})}
async function aiRecipes(payload){const key=process.env.OPENAI_API_KEY;if(!key)throw Error('IA não configurada');const equipment=Array.isArray(payload.equipment)?payload.equipment.filter(x=>['forno','fogao','airfryer','microondas'].includes(x)):[];const pantry=Array.isArray(payload.pantry)?payload.pantry.slice(0,60).map(p=>({name:trimmed(p.name,70),qty:nonNeg(p.qty),unit:trimmed(p.unit,10)})):[];
 if(!pantry.length)throw Error('Adiciona produtos à despensa primeiro');
 const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',temperature:.5,response_format:{type:'json_object'},messages:[{role:'system',content:'És um assistente culinário em português de Portugal. Devolve JSON válido com chave recipes, lista de no máximo 5 receitas, cada uma com name, description e ingredients (nome, quantidade, unidade), steps e equipment. Baseia-te apenas nos ingredientes fornecidos e no equipamento disponível; quando faltar ingrediente identifica-o explicitamente. Evita conselhos de segurança alimentar arriscados. Não inventes preços em CHF.'},{role:'user',content:JSON.stringify({pantry,equipment,servings:Math.max(1,Math.min(12,Number(payload.servings)||2))})}]}),signal:AbortSignal.timeout(30000)});
 const data=await response.json();if(!response.ok)throw Error('Serviço de IA indisponível');let json=JSON.parse(data.choices?.[0]?.message?.content||'{}');return {recipes:Array.isArray(json.recipes)?json.recipes.slice(0,5):[]};
}
function safeStripeSig(header,raw,secret){const vals=Object.fromEntries(String(header||'').split(',').map(x=>x.split('=').map(v=>v.trim())));const timestamp=Number(vals.t);if(!Number.isFinite(timestamp)||Math.abs(Date.now()/1000-timestamp)>300)return false;const sig=crypto.createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex');const a=Buffer.from(sig),b=Buffer.from(vals.v1||'');return a.length===b.length&&crypto.timingSafeEqual(a,b)}
async function stripeRequest(endpoint,fields){const b=new URLSearchParams();for(const [k,v] of Object.entries(fields))b.append(k,String(v));const r=await fetch(`https://api.stripe.com/v1/${endpoint}`,{method:'POST',headers:{Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded'},body:b,signal:AbortSignal.timeout(15000)});const j=await r.json();if(!r.ok)throw Error(j.error?.message||'Gateway unavailable');return j}
async function checkout(req,res){if(process.env.MARKETPLACE_READY!=='true'||!process.env.STRIPE_SECRET_KEY||!process.env.STRIPE_WEBHOOK_SECRET)return fail(res,503,'Pagamentos TWINT indisponíveis: contrato e integração ainda não ativos');
 const p=JSON.parse(await body(req));const offer=db.offers.find(x=>x.id===p.offerId&&x.status==='active');const chef=db.cooks.find(x=>x.id===offer?.cookId&&x.verified&&x.foodComplianceVerified&&x.status==='active'&&/^acct_/.test(x.stripeConnectId||''));if(!offer||!chef)return fail(res,404,'Refeição ou cozinheiro não validado');const q=Math.round(Number(p.quantity));if(!(q>=1&&q<=20))return fail(res,400,'Quantidade inválida');const price=Math.round(Number(offer.priceCHF)*100);const gross=price*q;const comm=Math.round(gross*Math.min(3000,Math.max(0,Number(process.env.COMMISSION_BPS||1000)))/10000);const id=uid();
 const order={id,chefId:chef.id,offerId:offer.id,quantity:q,grossRappen:gross,commissionRappen:comm,currency:'CHF',status:'pending',createdAt:now(),stripeSessionId:null};db.orders.push(order);await save();
 try{const session=await stripeRequest('checkout/sessions',{'mode':'payment','payment_method_types[0]':'twint','success_url':`${PUBLIC_BASE_URL}/payment/result?order=${encodeURIComponent(id)}&result=return`,'cancel_url':`${PUBLIC_BASE_URL}/payment/result?order=${encodeURIComponent(id)}&result=cancel`,'line_items[0][price_data][currency]':'chf','line_items[0][price_data][product_data][name]':offer.name,'line_items[0][price_data][unit_amount]':price,'line_items[0][quantity]':q,'client_reference_id':id,'metadata[order_id]':id,'payment_intent_data[application_fee_amount]':comm,'payment_intent_data[transfer_data][destination]':chef.stripeConnectId,'customer_creation':'always','phone_number_collection[enabled]':'true'});order.stripeSessionId=session.id;await save();return json(res,200,{orderId:id,paymentUrl:session.url,status:'pending'})}
 catch(e){order.status='checkout_error';await save();return fail(res,502,`Pagamento não iniciado: ${e.message}`)}
}
const WEB_HEADERS={'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'"};
const server=http.createServer(async(req,res)=>{
 try{
   const u=new URL(req.url,'http://localhost');const pathName=u.pathname;const ip=req.socket.remoteAddress||'unknown';
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Access-Control-Allow-Origin','*');
   if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type'});return res.end()}
   if(!rateOK(ip,'all',150))return fail(res,429,'Demasiadas chamadas');
   if(req.method==='GET'&&pathName==='/health')return json(res,200,{ok:true,backend:'MealSwiss',ai:!!process.env.OPENAI_API_KEY,twint:process.env.MARKETPLACE_READY==='true'&&!!process.env.STRIPE_SECRET_KEY,prices:db.prices.length});
   if(req.method==='GET'&&pathName==='/api/prices')return json(res,200,{items:publicPrices(),checkedAt:db.updatedAt});
   if(req.method==='GET'&&pathName==='/api/cooks')return json(res,200,{items:db.cooks.filter(x=>x.verified&&x.foodComplianceVerified&&x.status==='active').map(x=>({id:x.id,displayName:x.displayName,description:x.description,location:x.location}))});
   if(req.method==='GET'&&pathName==='/api/offers')return json(res,200,{items:db.offers.filter(x=>x.status==='active'&&db.cooks.some(c=>c.id===x.cookId&&c.verified&&c.foodComplianceVerified&&c.status==='active')).map(x=>({id:x.id,cookId:x.cookId,name:x.name,description:x.description,priceCHF:x.priceCHF,servings:x.servings,pickup:x.pickup}))});
   if(req.method==='GET'&&pathName==='/api/promotions')return json(res,200,{items:db.promotions.filter(x=>x.status==='active').map(x=>({id:x.id,title:x.title,description:x.description,url:x.url,status:x.status,sponsorLabel:x.sponsorLabel||'Patrocinado'}))});
   if(req.method==='GET'&&pathName==='/api/recipes')return json(res,200,{items:db.recipes.filter(x=>x.published===true)});
   if(req.method==='POST'&&pathName==='/api/ai/recipes'){if(!rateOK(ip,'ai',5,600000))return fail(res,429,'Limite de pedidos atingido');try{return json(res,200,await aiRecipes(JSON.parse(await body(req))))}catch(e){return fail(res,503,e.message)}}
   if(req.method==='POST'&&pathName==='/api/checkout')return await checkout(req,res);
   if(req.method==='POST'&&pathName==='/webhooks/stripe'){const raw=await body(req,1000000);if(!process.env.STRIPE_WEBHOOK_SECRET||!safeStripeSig(req.headers['stripe-signature'],raw,process.env.STRIPE_WEBHOOK_SECRET))return fail(res,401,'Assinatura inválida');const ev=JSON.parse(raw);if(db.webhookEvents.includes(ev.id))return json(res,200,{duplicate:true});if(ev.type==='checkout.session.completed'&&ev.data?.object?.payment_status==='paid'){const s=ev.data.object;const order=db.orders.find(o=>o.id===s.client_reference_id&&o.stripeSessionId===s.id);if(order&&order.grossRappen===s.amount_total&&s.currency==='chf'){order.status='paid';order.paidAt=now();order.paymentIntentId=s.payment_intent;order.customerEmail=trimmed(s.customer_details?.email||'',180);order.customerPhone=trimmed(s.customer_details?.phone||'',80)}}else if(ev.type==='checkout.session.expired'){const s=ev.data.object;const order=db.orders.find(o=>o.stripeSessionId===s.id&&o.status==='pending');if(order)order.status='expired'}db.webhookEvents.push(ev.id);db.webhookEvents=db.webhookEvents.slice(-2000);await save();return json(res,200,{received:true})}
   if(req.method==='GET'&&pathName==='/payment/result'){res.writeHead(200,WEB_HEADERS);return res.end('<!doctype html><html lang="pt"><meta name="viewport" content="width=device-width"><title>MealSwiss</title><body style="font-family:sans-serif;padding:20px"><h2>MealSwiss</h2><p>O regresso do TWINT não prova que o pagamento ficou concluído. Confirma o estado da encomenda no MealSwiss.</p></body></html>')}
   if(req.method==='GET'&&pathName==='/admin'){return fs.createReadStream(path.join(ROOT,'public','admin.html')).on('error',()=>fail(res,500,'Admin page missing')).pipe(res.writeHead(200,WEB_HEADERS))}
   if(req.method==='GET'&&pathName==='/admin/app.js'){return fs.createReadStream(path.join(ROOT,'public','admin.js')).pipe(res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'}))}
   if(req.method==='GET'&&pathName==='/admin/style.css'){return fs.createReadStream(path.join(ROOT,'public','style.css')).pipe(res.writeHead(200,{'Content-Type':'text/css; charset=utf-8','Cache-Control':'no-store'}))}
   if(req.method==='POST'&&pathName==='/admin/login'){if(!rateOK(ip,'login',8,900000))return fail(res,429,'Demasiadas tentativas');const p=JSON.parse(await body(req));if(!passwordOK(p.password))return fail(res,401,'Credenciais inválidas');res.setHeader('Set-Cookie',`ms_admin=${token({scope:'admin',exp:Date.now()+8*3600000})}; HttpOnly; Path=/admin; SameSite=Strict${PRODUCTION?'; Secure':''}`);return json(res,200,{ok:true})}
   if(pathName.startsWith('/admin/api/')){
     if(!admin(req))return fail(res,401,'Sessão necessária');if(['POST','PUT','DELETE'].includes(req.method)&&!allowWrite(req))return fail(res,403,'Origem inválida');
     const parts=pathName.split('/').filter(Boolean);const collection=parts[2];
     if(req.method==='GET'&&collection==='stats')return json(res,200,{counts:Object.fromEntries(CATEGORIES.map(k=>[k,db[k].length])),priceObservations:db.prices.length,aiConfigured:!!process.env.OPENAI_API_KEY,twintActive:process.env.MARKETPLACE_READY==='true'&&!!process.env.STRIPE_SECRET_KEY});
     if(req.method==='POST'&&collection==='prices'&&parts[3]==='refresh'){refreshPrices().catch(console.error);return json(res,202,{message:'Recolha solicitada; verificar logs e novas observações depois'})}
     if(req.method==='GET'&&collection==='prices')return json(res,200,{items:db.prices.slice(-300).reverse()});
     if(!CATEGORIES.includes(collection))return fail(res,404,'Área desconhecida');
     if(req.method==='GET')return json(res,200,{items:db[collection]});
     if(req.method==='POST'&&parts.length===3){let input=JSON.parse(await body(req));let item={id:uid(),...cleanRecord(collection,input),createdAt:now(),updatedAt:now()};db[collection].push(item);await save();return json(res,201,{item})}
     if(req.method==='PUT'&&parts[3]){let item=db[collection].find(x=>x.id===parts[3]);if(!item)return fail(res,404,'Registo não encontrado');Object.assign(item,cleanRecord(collection,JSON.parse(await body(req))),{updatedAt:now()});await save();return json(res,200,{item})}
     if(req.method==='DELETE'&&parts[3]){db[collection]=db[collection].filter(x=>x.id!==parts[3]);await save();return json(res,200,{ok:true})}
   }
   return fail(res,404,'Rota não encontrada');
 }catch(e){console.error('Request failed',e.message);return fail(res,e.message?.includes('Payload demasiado grande')?413:400,String(e.message||'Erro'))}
});
if(!ADMIN_PASSWORD||ADMIN_PASSWORD.length<12||!COOKIE_SECRET||COOKIE_SECRET.length<24){console.error('Configuração obrigatória: ADMIN_PASSWORD (>=12) e COOKIE_SECRET (>=24).');process.exit(1)}
server.listen(PORT,()=>console.log(`MealSwiss backend on port ${PORT}`));
