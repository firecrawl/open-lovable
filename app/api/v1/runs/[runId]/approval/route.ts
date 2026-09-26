export const dynamic='force-dynamic';
export const runtime='nodejs';
import {readApproval,resolveApproval} from '@/lib/runs/http';
export const GET=readApproval;
export const POST=resolveApproval;
