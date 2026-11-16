import { handleLogSession, productionDeps } from '../http';

export function POST(request: Request): Promise<Response> {
  return handleLogSession(request, productionDeps(request));
}
