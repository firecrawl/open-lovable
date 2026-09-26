import {randomBytes,randomUUID} from 'node:crypto';
export interface TraceContext {requestId:string;traceId:string;}
export function createTraceContext(input?:Partial<TraceContext>):TraceContext{return {requestId:input?.requestId&&/^[0-9a-f-]{36}$/i.test(input.requestId)?input.requestId:randomUUID(),traceId:input?.traceId&&/^[a-f0-9]{32}$/.test(input.traceId)?input.traceId:randomBytes(16).toString('hex')}}
export function traceFromRequest(request:Request):TraceContext{return createTraceContext({requestId:request.headers.get('x-request-id')??undefined,traceId:request.headers.get('x-trace-id')??undefined})}
export function traceHeaders(trace:TraceContext):Record<string,string>{return {'X-Request-ID':trace.requestId,'X-Trace-ID':trace.traceId,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}
