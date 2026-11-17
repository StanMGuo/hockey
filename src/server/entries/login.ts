import { handleLogin, productionProfileDeps } from '../profiles';

export function POST(request: Request): Promise<Response> {
  return handleLogin(request, productionProfileDeps(request));
}
