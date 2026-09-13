import assert from 'node:assert/strict';
import test from 'node:test';

import { parseSalesWorkbook } from '../lib/workbook-import.ts';

const headers = [
  '合同号',
  '公司名称',
  '签单人',
  '合同金额',
  '分期金额',
  '付款日期',
  '备注',
  '版本',
  '合同签订时间',
  '系统生效时间',
  '系统失效时间',
  '客户来源',
  '是否发放',
];

void test('按合同号合并分期并只采用可验证的字段', () => {
  const parsed = parseSalesWorkbook([
    {
      sheet: '月提成表头',
      data: [
        headers,
        [
          'JRCG-006',
          '巨融能源',
          '赵伟',
          58000,
          29000,
          '2026年8月13日',
          '用户确认本合同独立计提；累计前计提基数0元；应收日期2026年8月11日；首款已触发',
          'LNG云与一卡通对接定制开发',
          '2026年8月8日',
          null,
          null,
          '自拓',
          '是',
        ],
        [
          'JRCG-006',
          '巨融能源',
          '赵伟',
          null,
          29000,
          null,
          '尾款尚未到账；验收确认后5个工作日内支付',
          'LNG云与一卡通对接定制开发',
          '2026年8月8日',
          null,
          null,
          '自拓',
          null,
        ],
        ['备注：灰色为提成已经发放完毕'],
      ],
    },
  ]);

  assert.equal(parsed.contracts.length, 1);
  assert.equal(parsed.ignored_rows, 1);
  const item = parsed.contracts[0];
  assert.equal(item.contract.business_type, 'enterprise');
  assert.equal(item.contract.customer_source, 'self');
  assert.equal(item.contract.related_contract_status, 'checked_none');
  assert.equal(item.contract.installments.length, 2);
  assert.equal(item.contract.installments[0].received_amount, 29000);
  assert.equal(item.contract.installments[0].received_date, '2026-08-13');
  assert.equal(item.contract.installments[0].due_date, '2026-08-11');
  assert.equal(item.contract.installments[0].cumulative_basis_before, 0);
  assert.equal(item.contract.installments[1].received_amount, 0);
  assert.equal(item.contract.any_prior_commission_paid, true);
  assert.equal(item.errors.length, 0);
  assert(item.warnings.some((warning) => warning.includes('原始报价')));
});

void test('无法确认的客户来源和业务类型保持待补全', () => {
  const parsed = parseSalesWorkbook([
    {
      sheet: '签单表',
      data: [
        headers,
        [
          '202608051801',
          '云南省天然气销售有限公司',
          '李胜',
          29800,
          null,
          null,
          '合同约定签订后3个工作日内全额支付；截至2026年8月14日未回款',
          '运贸一体旗舰版',
          '2026年8月7日',
          '2026年8月7日',
          '2027年2月6日',
          '自拓',
          '否',
        ],
      ],
    },
  ]);

  const item = parsed.contracts[0];
  assert.equal(item.contract.business_type, 'unknown');
  assert.equal(item.contract.customer_source, 'self');
  assert.equal(item.contract.installments[0].received_amount, 0);
  assert(item.warnings.some((warning) => warning.includes('业务类型')));
});
