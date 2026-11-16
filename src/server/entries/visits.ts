import { handleVisits, productionDeps } from '../http';

export function GET(request: Request): Promise<Response> {
  return handleVisits(request, productionDeps(request));
}

export function POST(request: Request): Promise<Response> {
  return handleVisits(request, productionDeps(request));
}
