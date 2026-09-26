import {healthReport} from '@/lib/observability/metrics';
import {authenticateStudio} from '@/lib/identity/request';
export const dynamic='force-dynamic';
export async function GET(request:Request){const identity=await authenticateStudio(request);if(identity instanceof Response)return identity;const report=healthReport({dependencies:{process:'ok'},queue:{queued:0,running:0,stuck:0}});return Response.json(report,{status:report.status==='ok'?200:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
