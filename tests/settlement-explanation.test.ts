import assert from 'node:assert/strict';
import test from 'node:test';

import type { CommissionCalculation } from '../lib/commission-engine.ts';
import { buildSettlementExplanation } from '../lib/contracts.ts';

function calculation(
  results: CommissionCalculation['results'],
): CommissionCalculation {
  return {
    settlement_month: '2026-08',
    results,
    summary: {
      normal_sales_payable: results.reduce(
        (sum, result) => sum + (result.normal_sales_payable ?? 0),
        0,
      ),
      normal_supervisor_pool: results.reduce(
        (sum, result) => sum + (result.normal_supervisor_pool ?? 0),
        0,
      ),
      normal_gross_commission: 0,
      pending_approval_gross_preview: 0,
      review_gross_preview: 0,
      counts_by_status: {
        normal: 0,
        review: 0,
        pending_approval: 0,
        no_commission: 0,
        route_to_enterprise: 0,
        gm_special: 0,
      },
    },
  };
}

void test('uses friendly wording and hides neutral coefficients', () => {
  const text = buildSettlementExplanation(
    calculation([
      {
        record_id: 'saas-1',
        customer_name: '成都金克星物流有限公司',
        salesperson: '赵伟',
        contract_id: 'SaaS-001',
        contract_name: '飞舟物流通用版（SaaS）',
        business_type: 'saas_first',
        status: 'normal',
        issues: [],
        commission_basis: 12_800,
        rate: 0.1,
        overdue_days: 2,
        time_coefficient: 1,
        special_coefficient: 1,
        gross_commission_preview: 1_280,
        sales_payable_preview: 1_280,
        supervisor_pool_preview: 0,
        normal_sales_payable: 1_280,
        normal_supervisor_pool: 0,
        input_index: 1,
      },
      {
        record_id: 'project-1',
        customer_name: '巨融能源（新疆）股份有限公司',
        salesperson: '赵伟',
        contract_id: 'JRCG-001',
        contract_name: 'LNG 云与一卡通对接定制开发',
        business_type: 'enterprise',
        status: 'normal',
        issues: [],
        commission_basis: 29_000,
        tier_or_segment: '0->29000',
        overdue_days: 0,
        time_coefficient: 1,
        discount_rate: 1,
        discount_coefficient: 1,
        special_coefficient: 1,
        gross_commission_preview: 2_900,
        sales_payable_preview: 2_610,
        supervisor_pool_preview: 290,
        normal_sales_payable: 2_610,
        normal_supervisor_pool: 290,
        input_index: 2,
      },
    ]),
    '赵伟',
  );

  assert.match(text, /你在 2026 年 8 月可计发的销售提成为/);
  assert.match(text, /本笔你可获得：¥1,280\.00（可计发）/);
  assert.match(text, /累计计提基数由 ¥0\.00 增至 ¥29,000\.00/);
  assert.match(text, /销售本人 90%、主管池 10%/);
  assert.doesNotMatch(text, /时效系数 1/);
  assert.doesNotMatch(text, /特殊系数 1/);
  assert.doesNotMatch(text, /折扣系数 1/);
});

void test('explains every non-neutral coefficient in plain language', () => {
  const text = buildSettlementExplanation(
    calculation([
      {
        record_id: 'adjusted-1',
        customer_name: '测试客户',
        salesperson: '测试销售',
        contract_id: 'ENT-001',
        contract_name: '定制项目',
        business_type: 'enterprise',
        status: 'normal',
        issues: [],
        commission_basis: 80_000,
        tier_or_segment: '0->80000',
        overdue_days: 12,
        time_coefficient: 0.9,
        discount_rate: 0.75,
        discount_coefficient: 0.8,
        special_coefficient: 1.05,
        gross_commission_preview: 8_694,
        sales_payable_preview: 7_824.6,
        supervisor_pool_preview: 869.4,
        normal_sales_payable: 7_824.6,
        normal_supervisor_pool: 869.4,
        input_index: 1,
      },
    ]),
    '测试销售',
  );

  assert.match(text, /晚 12 天/);
  assert.match(text, /正常提成的 90% 计发（时效系数 0\.9）/);
  assert.match(text, /回款按 80% 折算为计提基数（折扣系数 0\.8）/);
  assert.match(text, /提成上浮 5%（特殊系数 1\.05）/);
});
