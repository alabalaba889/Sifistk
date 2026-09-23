import {PERMISSIONS} from "./types.js";
const READ_ONLY=new Set(["READ_PROJECT","READ_FILE","RESEARCH","GIT_READ"]);
const SENSITIVE=new Set(["WRITE_PROJECT","WRITE_FILE","DELETE_FILE","RUN_TEST","RUN_CODE","NETWORK_ACCESS","GIT_WRITE","DEPLOY","ADMIN"]);
export function validatePermission(permission){if(!PERMISSIONS.includes(permission))throw new Error("Unknown permission: "+permission);return true}
export function classify(permission){validatePermission(permission);return READ_ONLY.has(permission)?"READ":SENSITIVE.has(permission)?"SENSITIVE":"UNKNOWN"}
export function authorize(request,{granted=[],confirmed=false}={}){validatePermission(request.permission);if(!granted.includes(request.permission))return {allowed:false,status:"BLOCKED",reason:"Permission not granted"};if(classify(request.permission)==="SENSITIVE"&&!confirmed)return {allowed:false,status:"BLOCKED",reason:"Explicit confirmation required"};return {allowed:true,status:"PROPOSED"}}
export function destructiveAction(action){return ["DELETE_FILE","DEPLOY","ADMIN"].includes(action.permission)}