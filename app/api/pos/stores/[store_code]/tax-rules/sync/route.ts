import { syncPosTaxRules } from "../../../../../../../lib/pos-tax-rules";
export async function POST(
  request: Request,
  context: { params: Promise<{ store_code: string }> },
) {
  return syncPosTaxRules(request, (await context.params).store_code);
}
