export const STATUS=Object.freeze({PROPOSED:"PROPOSED",IMPLEMENTED:"IMPLEMENTED",TESTED:"TESTED",VERIFIED:"VERIFIED",FAILED:"FAILED",BLOCKED:"BLOCKED",UNKNOWN:"UNKNOWN",NOT_RUN:"NOT_RUN",NOT_AVAILABLE:"NOT_AVAILABLE",FILE_READ_FAILED:"FILE_READ_FAILED",TOOL_FAILED:"TOOL_FAILED"});
export const PERMISSIONS=Object.freeze(["READ_PROJECT","WRITE_PROJECT","READ_FILE","WRITE_FILE","DELETE_FILE","RUN_TEST","RUN_CODE","NETWORK_ACCESS","RESEARCH","GIT_READ","GIT_WRITE","DEPLOY","ADMIN"]);
export function now(){return new Date().toISOString()}
export function id(prefix="id"){return prefix+"_"+crypto.randomUUID()}
export function evidence(status,detail="",extra={}){return {status,detail:String(detail),at:now(),...extra}}