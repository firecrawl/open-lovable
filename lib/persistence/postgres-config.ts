import type {PoolConfig} from 'pg';
/** Server configuration only: no query-string TLS overrides or implicit ambient pg credentials. */
export function postgresConfiguration(connectionString:string,options:{allowLoopback?:boolean}={}):PoolConfig {
 const url=new URL(connectionString);
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.username||!url.password||url.search||url.hash||!/^\/[a-zA-Z0-9_-]+$/.test(url.pathname))throw new Error('Invalid explicit PostgreSQL connection configuration');
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(local&&!options.allowLoopback)throw new Error('Loopback database requires explicit authorization');
 return {host:url.hostname.replace(/^\[|\]$/g,''),port:url.port?Number(url.port):5432,database:url.pathname.slice(1),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),
  ssl:local?false:{rejectUnauthorized:true},max:4,idleTimeoutMillis:30000,connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000,idle_in_transaction_session_timeout:15000,application_name:'open-lovable-control'};
}
