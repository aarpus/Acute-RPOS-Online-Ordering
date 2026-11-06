import { adminTeam } from '../../../../lib/admin-team';

export async function GET(request: Request) { return adminTeam(request); }
export async function POST(request: Request) { return adminTeam(request); }
