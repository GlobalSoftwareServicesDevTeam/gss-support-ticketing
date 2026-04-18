module.exports=[918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},120635,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/action-async-storage.external.js",()=>require("next/dist/server/app-render/action-async-storage.external.js"))},324725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},463021,(e,t,r)=>{t.exports=e.x("@prisma/client-2c3a283f134fdcb6",()=>require("@prisma/client-2c3a283f134fdcb6"))},698043,e=>{"use strict";var t=e.i(463021);let r=globalThis.prisma||new t.PrismaClient;e.s(["default",0,r])},824285,e=>{"use strict";var t=e.i(698043),r=e.i(493458);async function a(e){try{let a=null,n=null;try{let e=await (0,r.headers)();a=e.get("x-forwarded-for")?.split(",")[0]?.trim()||e.get("x-real-ip")||null,n=e.get("user-agent")||null}catch{}await t.default.auditLog.create({data:{action:e.action,entity:e.entity,entityId:e.entityId||null,description:e.description,metadata:e.metadata?JSON.stringify(e.metadata):null,ipAddress:a,userAgent:n,userId:e.userId||null,userName:e.userName||null}})}catch(e){console.error("Audit log error:",e)}}e.s(["logAudit",0,a])},547740,e=>{"use strict";var t=e.i(254799);let r="aes-256-gcm";function a(){let e=process.env.VAULT_ENCRYPTION_KEY||process.env.AUTH_SECRET;if(!e)throw Error("VAULT_ENCRYPTION_KEY or AUTH_SECRET must be set");return(0,t.scryptSync)(e,"gss-vault-salt",32)}e.s(["decrypt",0,function(e){let n=a(),s=Buffer.from(e,"base64");s.subarray(0,16);let i=s.subarray(16,32),o=s.subarray(32,48),l=s.subarray(48),u=(0,t.createDecipheriv)(r,n,i);return u.setAuthTag(o),Buffer.concat([u.update(l),u.final()]).toString("utf8")},"encrypt",0,function(e){let n=a(),s=(0,t.randomBytes)(16),i=(0,t.randomBytes)(16),o=(0,t.createCipheriv)(r,n,i),l=Buffer.concat([o.update(e,"utf8"),o.final()]),u=o.getAuthTag();return Buffer.concat([s,i,u,l]).toString("base64")}])},859776,e=>{"use strict";var t=e.i(698043),r=e.i(547740);let a=new Set(["PLESK_API_PASSWORD","SMTP_PASSWORD","IMAP_PASSWORD","DIGICERT_API_KEY","GOOGLE_PLAY_SERVICE_ACCOUNT_KEY","APPLE_CONNECT_PRIVATE_KEY","SENTRY_WEBHOOK_SECRET","IIS_API_KEY"]);async function n(e){let a=await t.default.systemSetting.findUnique({where:{key:e}});if(!a)return process.env[e]||null;if(a.encrypted)try{return(0,r.decrypt)(a.value)}catch{return null}return a.value}async function s(e){let a=await t.default.systemSetting.findMany({where:{key:{in:e}}}),n={},s=new Set;for(let e of a)if(s.add(e.key),e.encrypted)try{n[e.key]=(0,r.decrypt)(e.value)}catch{}else n[e.key]=e.value;for(let t of e)!s.has(t)&&process.env[t]&&(n[t]=process.env[t]);return n}async function i(e,n){let s=a.has(e)||e.endsWith("_SENTRY_SECRET"),i=s?(0,r.encrypt)(n):n;await t.default.systemSetting.upsert({where:{key:e},update:{value:i,encrypted:s},create:{key:e,value:i,encrypted:s}})}async function o(e){let n=Object.entries(e).map(([e,n])=>{let s=a.has(e)||e.endsWith("_SENTRY_SECRET"),i=s?(0,r.encrypt)(n):n;return t.default.systemSetting.upsert({where:{key:e},update:{value:i,encrypted:s},create:{key:e,value:i,encrypted:s}})});await t.default.$transaction(n)}async function l(e){await t.default.systemSetting.deleteMany({where:{key:e}})}async function u(){return s(["PLESK_API_URL","PLESK_API_LOGIN","PLESK_API_PASSWORD"])}async function c(){return s(["SMTP_HOST","SMTP_PORT","SMTP_SECURE","SMTP_USER","SMTP_PASSWORD","SMTP_FROM_EMAIL","SMTP_FROM_NAME"])}async function d(){return s(["GOOGLE_PLAY_SERVICE_ACCOUNT_KEY"])}async function p(){return s(["APPLE_CONNECT_KEY_ID","APPLE_CONNECT_ISSUER_ID","APPLE_CONNECT_PRIVATE_KEY"])}e.s(["deleteSetting",0,l,"getAppleConnectConfig",0,p,"getGooglePlayConfig",0,d,"getPleskConfig",0,u,"getSetting",0,n,"getSettings",0,s,"getSmtpConfig",0,c,"setSetting",0,i,"setSettings",0,o])},871068,e=>{"use strict";var t=e.i(254799),r=e.i(859776);let a=process.env.PLESK_API_URL||"",n=process.env.PLESK_API_LOGIN||"",s=process.env.PLESK_API_PASSWORD||"";async function i(){let e=await (0,r.getPleskConfig)();return{url:(e.PLESK_API_URL||a).replace(/\/+$/,""),login:e.PLESK_API_LOGIN||n,password:e.PLESK_API_PASSWORD||s}}async function o(){let e=await i();return!!(e.url&&e.login&&e.password)}async function l(e,t={}){let r=await i();if(!r.url||!r.login||!r.password)throw Error("Plesk not configured");let a=Buffer.from(`${r.login}:${r.password}`).toString("base64"),n=`${r.url}/api/v2/${e}`,s=await fetch(n,{...t,headers:{Authorization:`Basic ${a}`,"Content-Type":"application/json",Accept:"application/json",...t.headers}});if(!s.ok){let e=await s.text();throw Error(`Plesk API ${s.status}: ${e}`)}let o=await s.text();return o?JSON.parse(o):null}async function u(e){let t=await i();if(!t.url||!t.login||!t.password)throw Error("Plesk not configured");let r=await fetch(`${t.url}/enterprise/control/agent.php`,{method:"POST",headers:{HTTP_AUTH_LOGIN:t.login,HTTP_AUTH_PASSWD:t.password,"Content-Type":"text/xml"},body:e});if(!r.ok)throw Error(`Plesk XML-RPC ${r.status}: ${await r.text()}`);return r.text()}async function c(){let e,t=await u("<packet><service-plan><get><filter/></get></service-plan></packet>"),r=[],a=/<result>[\s\S]*?<status>ok<\/status>[\s\S]*?<id>(\d+)<\/id>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/result>/g;for(;null!==(e=a.exec(t));)r.push({id:parseInt(e[1],10),name:e[2]});return r}async function d(e){try{let t=(await l("clients")).find(t=>t.email?.toLowerCase()===e.toLowerCase());if(!t)return null;return{id:t.id,login:t.login,name:t.name||t.login,email:t.email}}catch{return null}}async function p(e){let t={name:e.name,login:e.login,password:e.password,email:e.email,type:"customer",company:e.company||""},r=await l("clients",{method:"POST",body:JSON.stringify(t)});return{id:r.id,login:r.login||e.login,name:e.name,email:e.email}}async function m(e){let r={name:e.domain,owner_client:{id:e.customerId},plan:{name:e.planName},hosting_type:"virtual",hosting_settings:{ftp_login:e.login||e.domain.replace(/\./g,"_").substring(0,16),ftp_password:e.password||function(){let e="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%",r="",a=new Uint8Array(12);for(let n of(t.default.randomFillSync(a),a))r+=e[n%e.length];return r}()}};return{id:(await l("domains",{method:"POST",body:JSON.stringify(r)})).id,domain:e.domain}}async function f(e){return e?l(`clients/${e}/domains`):l("domains")}async function g(e){return l(`domains/${e}`)}async function y(e){return l(`domains/${e}/status`,{method:"PUT",body:JSON.stringify({status:"disabled"})})}async function S(e){return l(`domains/${e}/status`,{method:"PUT",body:JSON.stringify({status:"active"})})}async function x(e){return l(`domains/${e}`,{method:"DELETE"})}async function _(e){let t=await l(`dns/records?domain=${encodeURIComponent(e)}`);return Array.isArray(t)?t.map(e=>({id:e.id,type:e.type,host:e.host,value:e.value,opt:e.opt||void 0,ttl:e.ttl})):[]}async function w(e,t){let r={type:t.type,host:t.host,value:t.value};return t.opt&&(r.opt=t.opt),await l(`dns/records?domain=${encodeURIComponent(e)}`,{method:"POST",body:JSON.stringify(r)})}async function h(e,t){let r={};return t.type&&(r.type=t.type),void 0!==t.host&&(r.host=t.host),void 0!==t.value&&(r.value=t.value),void 0!==t.opt&&(r.opt=t.opt),await l(`dns/records/${e}`,{method:"PUT",body:JSON.stringify(r)})}async function P(e){await l(`dns/records/${e}`,{method:"DELETE"})}function E(e){if(-1===e||0===e)return"Unlimited";let t=e/0x40000000;return t>=1?`${Math.round(10*t)/10} GB`:`${Math.round(e/1048576)} MB`}function b(e){return void 0===e||-1===e?"Unlimited":String(e)}async function v(){let e,t=await u("<packet><service-plan><get><filter/></get></service-plan></packet>"),r=[],a=/<result>[\s\S]*?<status>ok<\/status>([\s\S]*?)<\/result>/g;for(;null!==(e=a.exec(t));){let t,a,n=e[1],s=parseInt($(n,"id")||"0",10),i=$(n,"name")||"",o={},l=/<limit>\s*<name>([^<]+)<\/name>\s*<value>([^<]+)<\/value>\s*<\/limit>/g;for(;null!==(t=l.exec(n));)o[t[1]]=parseInt(t[2],10);let u={},c=/<property>\s*<name>([^<]+)<\/name>\s*<value>([^<]*)<\/value>\s*<\/property>/g;for(;null!==(a=c.exec(n));)"php"===a[1]?u.php="true"===a[2]:"ssl"===a[1]?u.ssl="true"===a[2]:"cgi"===a[1]?u.cgi="true"===a[2]:"webstat"===a[1]&&(u.webstat=a[2]);r.push({id:s,name:i,limits:o,hosting:u})}return r}function $(e,t){let r=RegExp(`<${t}>([^<]*)</${t}>`).exec(e);return r?r[1]:null}async function k(){let e=await v(),t=[];for(let r of e){let e=r.limits||{},a=r.hosting||{};t.push({id:r.id,name:r.name,diskSpace:E(e.disk_space??-1),bandwidth:E(e.max_traffic??-1),databases:b(e.max_db),emailAccounts:b(e.max_box),emailStorage:e.mbox_quota?E(e.mbox_quota):"Default",ftpAccounts:b(e.max_subftp_users),subdomains:b(e.max_subdom),sslSupport:!1!==a.ssl,phpSupport:!1!==a.php})}return t}async function A(){try{if(!await o())return{success:!1,message:"Plesk API credentials are not configured"};let e=await l("server"),t=await c();return{success:!0,message:`Connected to ${e.hostname} (Plesk ${e.panel_version}). Found ${t.length} service plan(s).`,planCount:t.length}}catch(e){return{success:!1,message:`Connection failed: ${e instanceof Error?e.message:String(e)}`}}}async function T(e,t){let r=await i(),a=t?`<user_ip>${t}</user_ip>`:"",n=await u(`<packet>
      <server>
        <create_session>
          <login>${e}</login>
          <data>
            ${a}
            <starting_url>/</starting_url>
            <source_server></source_server>
          </data>
        </create_session>
      </server>
    </packet>`),s=/<status>error<\/status>[\s\S]*?<errtext>([^<]+)<\/errtext>/.exec(n);if(s)throw Error(`Plesk error: ${s[1]}`);let o=/<id>([^<]+)<\/id>/.exec(n);if(!o)throw Error("Failed to create Plesk session — unexpected response");return`${r.url}/enterprise/rsession_init.php?PHPSESSID=${o[1]}`}async function I(e){let t=await N(e),r=await u(`<packet>
      <mail>
        <get_info>
          <filter>
            <site-id>${t}</site-id>
          </filter>
          <mailbox/>
          <aliases/>
          <autoresponder/>
          <mailbox-usage/>
        </get_info>
      </mail>
    </packet>`),a=C(r,e);if(a.accounts.length>0)return a.accounts;if(0===a.errors.length){let a=r.replace(/\s+/g," ").trim();console.warn(`[plesk.mail] Empty account list for domain ${e} (site-id=${t}) from full get_info response. Sample: ${a.slice(0,600)}`)}if(a.errors.length>0){let r=await u(`<packet>
        <mail>
          <get_info>
            <filter>
              <site-id>${t}</site-id>
            </filter>
          </get_info>
        </mail>
      </packet>`),a=C(r,e);if(a.accounts.length>0)return a.accounts;if(a.errors.length>0)throw Error(a.errors[0]);let n=r.replace(/\s+/g," ").trim();console.warn(`[plesk.mail] Empty account list for domain ${e} (site-id=${t}) from fallback get_info response. Sample: ${n.slice(0,600)}`)}return[]}function C(e,t){let r=[],a=[];for(let n of e.match(/<result>[\s\S]*?<\/result>/g)||[]){let e=/<status>([^<]+)<\/status>/.exec(n),s=e?.[1]?.toLowerCase()||"";if(s&&"ok"!==s){let e=$(n,"errtext")||"Unknown mail API error";a.push(e);continue}for(let e of n.match(/<mailname[\s\S]*?>[\s\S]*?<\/mailname>/g)||[n]){let a=$(e,"name")||$(e,"mailname"),n=a&&!a.includes("@")?a:a?.split("@")[0];if(!n)continue;let s=/<mailbox>/.test(e)||/<mailbox>true<\/mailbox>/.test(e),i=!/<enabled>false<\/enabled>/.test(e)&&!/<status>disabled<\/status>/.test(e),o=/<autoresponder>[\s\S]*?<status>on<\/status>[\s\S]*?<\/autoresponder>/.test(e),l=[];for(let t of e.match(/<alias>([^<]+)<\/alias>/g)||[]){let e=t.replace(/<\/?alias>/g,"");e&&l.push(e)}let u=0,c=0,d=/<mbox_quota>(\d+)<\/mbox_quota>/.exec(e);d&&(u=parseInt(d[1],10));let p=/<mailbox-usage>(\d+)<\/mailbox-usage>/.exec(e);if(p)c=parseInt(p[1],10);else{let t=/<mailbox-usage>[\s\S]*?<\/mailbox-usage>/.exec(e);if(t){let e=/(\d+)/.exec(t[0]);e&&(c=parseInt(e[1],10))}}let m=`${n}@${t}`;r.some(e=>e.email===m)||r.push({name:n,domain:t,email:m,mailbox:s,enabled:i,aliases:l,autoresponder:o,mailboxQuota:u,mailboxUsage:c})}}return{accounts:r,errors:a}}async function O(e){let t=await N(e.domain),r=!1!==e.mailbox,a=e.quota?`<mbox_quota>${e.quota}</mbox_quota>`:"",n=await u(`<packet>
      <mail>
        <create>
          <filter>
            <site-id>${t}</site-id>
            <mailname>
              <name>${U(e.name)}</name>
              <mailbox>
                <enabled>${r}</enabled>
                ${a}
              </mailbox>
              <password>
                <value>${U(e.password)}</value>
                <type>plain</type>
              </password>
            </mailname>
          </filter>
        </create>
      </mail>
    </packet>`),s=/<status>error<\/status>[\s\S]*?<errtext>([^<]+)<\/errtext>/.exec(n);if(s)throw Error(s[1])}async function R(e){let t=await N(e.domain),r="";if(e.password&&(r+=`<password><value>${U(e.password)}</value><type>plain</type></password>`),void 0!==e.enabled||void 0!==e.quota){let t="";void 0!==e.enabled&&(t+=`<enabled>${e.enabled}</enabled>`),void 0!==e.quota&&(t+=`<mbox_quota>${e.quota}</mbox_quota>`),r+=`<mailbox>${t}</mailbox>`}if(!r)return;let a=await u(`<packet>
      <mail>
        <update>
          <set>
            <filter>
              <site-id>${t}</site-id>
              <mailname>
                <name>${U(e.name)}</name>
                ${r}
              </mailname>
            </filter>
          </set>
        </update>
      </mail>
    </packet>`),n=/<status>error<\/status>[\s\S]*?<errtext>([^<]+)<\/errtext>/.exec(a);if(n)throw Error(n[1])}async function L(e,t){let r=await N(e),a=await u(`<packet>
      <mail>
        <remove>
          <filter>
            <site-id>${r}</site-id>
            <mailname>
              <name>${U(t)}</name>
            </mailname>
          </filter>
        </remove>
      </mail>
    </packet>`),n=/<status>error<\/status>[\s\S]*?<errtext>([^<]+)<\/errtext>/.exec(a);if(n)throw Error(n[1])}async function N(e){let t=await u(`<packet>
      <site>
        <get>
          <filter>
            <name>${U(e)}</name>
          </filter>
          <dataset><gen_info/></dataset>
        </get>
      </site>
    </packet>`),r=/<id>(\d+)<\/id>/.exec(t);if(!r){let t=await u(`<packet>
        <webspace>
          <get>
            <filter>
              <name>${U(e)}</name>
            </filter>
            <dataset><gen_info/></dataset>
          </get>
        </webspace>
      </packet>`),r=/<id>(\d+)<\/id>/.exec(t);if(!r)throw Error(`Domain "${e}" not found in Plesk`);return parseInt(r[1],10)}return parseInt(r[1],10)}function U(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}async function q(e){let t=await i(),r=await u(`<packet>
      <server>
        <create_session>
          <login>${U(e)}</login>
          <data>
            <starting_url>/smb/email/addresses</starting_url>
            <source_server></source_server>
          </data>
        </create_session>
      </server>
    </packet>`),a=/<status>error<\/status>[\s\S]*?<errtext>([^<]+)<\/errtext>/.exec(r);if(a)throw Error(`Plesk error: ${a[1]}`);let n=/<id>([^<]+)<\/id>/.exec(r);if(!n)throw Error("Failed to create Plesk webmail session");return`${t.url}/enterprise/rsession_init.php?PHPSESSID=${n[1]}`}e.s(["activateSubscription",0,S,"addDnsRecord",0,w,"createCustomer",0,p,"createMailAccount",0,O,"createSessionUrl",0,T,"createSubscription",0,m,"createWebmailSessionUrl",0,q,"deleteDnsRecord",0,P,"findCustomerByEmail",0,d,"getDnsRecords",0,_,"getSubscription",0,g,"getWebmailUrl",0,function(e){return`https://webmail.${e}`},"isPleskConfigured",0,function(){return!!(a&&n&&s)},"isPleskConfiguredAsync",0,o,"listMailAccounts",0,I,"listServicePlansDetailed",0,k,"listSubscriptions",0,f,"removeMailAccount",0,L,"removeSubscription",0,x,"suspendSubscription",0,y,"testConnection",0,A,"updateDnsRecord",0,h,"updateMailAccount",0,R])},719901,(e,t,r)=>{t.exports=e.x("dns/promises",()=>require("dns/promises"))}];

//# sourceMappingURL=%5Broot-of-the-server%5D__0tnzk-q._.js.map