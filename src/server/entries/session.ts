import { handleLogSession, productionDeps } from '../http';

export default function logSession(request: Request): Promise<Response> {
  return handleLogSession(request, productionDeps(request));
}
