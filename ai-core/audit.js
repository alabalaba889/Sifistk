import {id,now} from "./types.js";
export function appendAudit(log,{actor="system",action,status,requestId=null,details={}}){return [...log,{id:id("aud"),actor,action,status,requestId,details,at:now()}].slice(-5000)}
export function summarizeAudit(log){return {total:log.length,byStatus:log.reduce((m,x)=>(m[x.status]=(m[x.status]||0)+1,m),{})}}