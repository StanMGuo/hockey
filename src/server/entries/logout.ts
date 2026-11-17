import { handleLogout, productionProfileDeps } from '../profiles';

export function POST(request: Request): Promise<Response> {
  return handleLogout(request, productionProfileDeps(request));
}
