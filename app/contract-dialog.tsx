'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, CirclePlus, FileCheck2, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { readApiResponse } from '@/lib/api-response';
import {
  type ContractInput,
  type StoredContract,
  contractSchema,
  emptyContract,
  emptyInstallment,
} from '@/lib/contracts';

interface ContractDialogProps {
  initialContract?: StoredContract | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
}

const numberOptions = { valueAsNumber: true } as const;
const nullableNumberOptions = {
  setValueAs: (value: string) => (value === '' ? null : Number(value)),
};

export function ContractDialog({ initialContract, open, onOpenChange, onSaved }: ContractDialogProps) {
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
    watch,
  } = useForm<ContractInput>({
    resolver: zodResolver(contractSchema),
    defaultValues: emptyContract(),
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'installments' });
  const businessType = watch('business_type');
  const commissionMode = watch('commission_mode');
  const installments = watch('installments');
  const relatedContractStatus = watch('related_contract_status');
  const isEditing = Boolean(initialContract?.id);
  const supportsUnifiedCommission = businessType === 'saas_first' ||
    businessType === 'saas_private_first';

  useEffect(() => {
    if (open) reset(initialContract ?? emptyContract());
  }, [initialContract, open, reset]);

  useEffect(() => {
    if (relatedContractStatus !== 'checked_grouped') setValue('related_12m_amount', null);
  }, [relatedContractStatus, setValue]);

  useEffect(() => {
    if (!supportsUnifiedCommission && commissionMode !== 'per_payment') {
      setValue('commission_mode', 'per_payment');
    }
  }, [commissionMode, setValue, supportsUnifiedCommission]);

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) reset(emptyContract());
  };

  const save = handleSubmit(async (values) => {
    try {
      const response = await fetch(isEditing ? '/api/contracts/update' : '/api/contracts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(isEditing ? { ...values, id: initialContract!.id } : values),
      });
      await readApiResponse<{ id: string }>(response, '合同保存失败');
      await onSaved();
      close(false);
    } catch (error) {
      setError('root', {
        message:
          error instanceof Error
            ? error.message
            : '暂时无法连接台账，请稍后重试',
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-[980px] gap-0 overflow-hidden p-0 sm:max-h-[92dvh]">
        <DialogHeader className="border-b border-border px-4 py-4 pr-14 sm:px-6 sm:py-5">
          <DialogTitle className="text-xl">{isEditing ? '修正合同与分期回款' : '录入合同与分期回款'}</DialogTitle>
          <DialogDescription>
            金额单位为人民币元。实际到账日期决定计提月份；缺失内容会在计算结果中直接提示补全。
          </DialogDescription>
        </DialogHeader>

        <form className="contents" onSubmit={save}>
          <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto px-4 py-4 sm:max-h-[calc(92dvh-9rem)] sm:px-6 sm:py-5">
            {errors.root?.message && (
              <Alert variant="destructive" className="mb-5">
                <AlertCircle />
                <AlertDescription>{errors.root.message}</AlertDescription>
              </Alert>
            )}

            <section className="form-section" aria-labelledby="contract-basic-title">
              <div className="form-section-heading">
                <span>01</span>
                <div>
                  <h2 id="contract-basic-title">合同主要信息</h2>
                  <p>用于业务归类、反拆单检查和销售归属。</p>
                </div>
              </div>
              <div className="form-grid sm:grid-cols-2 lg:grid-cols-3">
                <FormField label="客户名称" error={errors.customer_name?.message}>
                  <Input placeholder="如：远岸科技" {...register('customer_name')} />
                </FormField>
                <FormField label="合同名称" error={errors.contract_name?.message}>
                  <Input placeholder="如：企业知识库 SaaS" {...register('contract_name')} />
                </FormField>
                <FormField label="合同编号" error={errors.contract_number?.message}>
                  <Input placeholder="如：SaaS-2026-018" {...register('contract_number')} />
                </FormField>
                <FormField label="签单人 / 销售人员" error={errors.salesperson?.message}>
                  <Input placeholder="填写姓名" {...register('salesperson')} />
                </FormField>
                <FormField label="业务类型" error={errors.business_type?.message}>
                  <NativeSelect className="w-full" {...register('business_type')}>
                    <NativeSelectOption value="unknown">待判断</NativeSelectOption>
                    <NativeSelectOption value="saas_first">标准 SaaS 首年</NativeSelectOption>
                    <NativeSelectOption value="saas_renewal">标准 SaaS 续费</NativeSelectOption>
                    <NativeSelectOption value="saas_private_first">私有云 SaaS 首年</NativeSelectOption>
                    <NativeSelectOption value="enterprise">定制 / 大客户项目</NativeSelectOption>
                  </NativeSelect>
                </FormField>
                <FormField label="客户来源" error={errors.customer_source?.message}>
                  <NativeSelect className="w-full" {...register('customer_source')}>
                    <NativeSelectOption value="unknown">待补全</NativeSelectOption>
                    <NativeSelectOption value="self">销售自拓</NativeSelectOption>
                    <NativeSelectOption value="lead">公司线索</NativeSelectOption>
                    <NativeSelectOption value="referral">客户转介绍</NativeSelectOption>
                  </NativeSelect>
                </FormField>
                <FormField label="签约日期" error={errors.signed_date?.message}>
                  <Input type="date" {...register('signed_date')} />
                </FormField>
                <FormField label="合同 / 年度金额" error={errors.annual_contract_amount?.message}>
                  <Input min="0" step="0.01" type="number" {...register('annual_contract_amount', numberOptions)} />
                </FormField>
                {businessType === 'enterprise' && (
                  <FormField label="原始报价（建议填写）" error={errors.quoted_amount?.message}>
                    <Input min="0" step="0.01" type="number" {...register('quoted_amount', nullableNumberOptions)} />
                  </FormField>
                )}
                <FormField label="同客户 / 同项目近 12 个月是否还有其他合同？" error={errors.related_contract_status?.message}>
                  <NativeSelect className="w-full" {...register('related_contract_status')}>
                    <NativeSelectOption value="unknown">暂不确定</NativeSelectOption>
                    <NativeSelectOption value="checked_none">没有其他相关合同</NativeSelectOption>
                    <NativeSelectOption value="checked_grouped">有，按相关合同合计判断</NativeSelectOption>
                  </NativeSelect>
                  <p className="field-hint">用于防止拆单后绕开 30 万项目型或 300 万专项处理门槛，不是审批。</p>
                </FormField>
                {relatedContractStatus === 'checked_grouped' && (
                  <FormField label="相关合同合计金额（含本合同）" error={errors.related_12m_amount?.message}>
                    <Input
                      min="0"
                      placeholder="填写近 12 个月合计金额"
                      step="0.01"
                      type="number"
                      {...register('related_12m_amount', nullableNumberOptions)}
                    />
                  </FormField>
                )}
                <FormField
                  className="sm:col-span-2 lg:col-span-3"
                  label="交付时间要求"
                  error={errors.delivery_requirement?.message}
                >
                  <Textarea
                    className="min-h-20"
                    placeholder="填写合同约定的上线、交付或验收时间要求"
                    {...register('delivery_requirement')}
                  />
                </FormField>
              </div>

              <div className="check-grid">
                <CheckField
                  control={control}
                  name="has_customization"
                  label="包含定制化开发"
                  hint="选择后按项目型规则处理"
                />
                <CheckField
                  control={control}
                  name="has_staged_acceptance"
                  label="分阶段验收交付"
                  hint="选择后按项目型规则处理"
                />
              </div>
            </section>

            {supportsUnifiedCommission && (
              <section className="form-section" aria-labelledby="commission-mode-title">
                <div className="form-section-heading">
                  <span>02</span>
                  <div>
                    <h2 id="commission-mode-title">SaaS 计提方式</h2>
                    <p>默认每期独立判断档位；统一计提必须有事前依据。</p>
                  </div>
                </div>
                <div className="form-grid sm:grid-cols-2">
                  <FormField label="计提方式">
                    <NativeSelect className="w-full" {...register('commission_mode')}>
                      <NativeSelectOption value="per_payment">按每期实际回款计提</NativeSelectOption>
                      <NativeSelectOption value="hold_until_full">全额到账后统一计提</NativeSelectOption>
                    </NativeSelect>
                  </FormField>
                  {commissionMode === 'hold_until_full' && (
                    <FormField label="统一计提书面依据">
                      <Input placeholder="合同条款、确认日期与适用范围" {...register('hold_approval_reference')} />
                    </FormField>
                  )}
                </div>
                {commissionMode === 'hold_until_full' && (
                  <div className="check-grid">
                    <CheckField control={control} name="hold_approved" label="已有事前统一计提依据" />
                    <CheckField control={control} name="any_prior_commission_paid" label="此前已有一期正式发放" />
                  </div>
                )}
              </section>
            )}

            {businessType === 'enterprise' && (
              <section className="form-section" aria-labelledby="enterprise-title">
                <div className="form-section-heading">
                  <span>02</span>
                  <div>
                    <h2 id="enterprise-title">项目型分成与专项方案</h2>
                    <p>默认销售 90%、主管池 10%；300 万及以上需填写已确定的专项方案。</p>
                  </div>
                </div>
                <div className="form-grid sm:grid-cols-2 lg:grid-cols-4">
                  <FormField label="销售分成">
                    <Input max="1" min="0" step="0.01" type="number" {...register('sales_share', numberOptions)} />
                  </FormField>
                  <FormField label="主管池分成">
                    <Input max="1" min="0" step="0.01" type="number" {...register('supervisor_share', numberOptions)} />
                  </FormField>
                  <FormField className="sm:col-span-2" label="特殊分成书面依据">
                    <Input placeholder="非 90/10 时必填" {...register('team_split_approval_reference')} />
                  </FormField>
                  <FormField label="专项方案提成总额">
                    <Input min="0" step="0.01" type="number" {...register('approved_gm_gross_commission', nullableNumberOptions)} />
                  </FormField>
                  <FormField className="sm:col-span-2 lg:col-span-3" label="专项方案书面依据">
                    <Input placeholder="确认人、日期与适用合同 / 里程碑" {...register('gm_approval_reference')} />
                  </FormField>
                </div>
              </section>
            )}

            <section className="form-section border-b-0 pb-0" aria-labelledby="installment-title">
              <div className="form-section-heading">
                <span>{businessType === 'enterprise' ? '03' : '03'}</span>
                <div>
                  <h2 id="installment-title">分期付款与实际回款</h2>
                  <p>每一期都保留应收、到账、费用分摊与必要的书面依据。</p>
                </div>
                <Button
                  className="ml-auto"
                  type="button"
                  variant="outline"
                  onClick={() => append(emptyInstallment(fields.length + 1))}
                >
                  <CirclePlus data-icon="inline-start" /> 添加一期
                </Button>
              </div>

              <div className="space-y-4">
                {fields.map((field, index) => {
                  const installment = installments[index];
                  return (
                    <article className="installment-card" key={field.id}>
                      <div className="installment-heading">
                        <div>
                          <span>第 {index + 1} 期</span>
                          <p>
                            {installment?.received_amount > 0 ? '已录入实际回款' : '付款计划'}
                          </p>
                        </div>
                        {fields.length > 1 && (
                          <Button
                            aria-label={`移除第 ${index + 1} 期`}
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(index)}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                      <input type="hidden" value={index + 1} {...register(`installments.${index}.installment_no`, numberOptions)} />
                      <div className="form-grid sm:grid-cols-2 lg:grid-cols-4">
                        <FormField label="计划回款金额" error={errors.installments?.[index]?.planned_amount?.message}>
                          <Input min="0" step="0.01" type="number" {...register(`installments.${index}.planned_amount`, numberOptions)} />
                        </FormField>
                        <FormField label="合同应收日" error={errors.installments?.[index]?.due_date?.message}>
                          <Input type="date" {...register(`installments.${index}.due_date`)} />
                        </FormField>
                        <FormField label="本次实际到账" error={errors.installments?.[index]?.received_amount?.message}>
                          <Input min="0" step="0.01" type="number" {...register(`installments.${index}.received_amount`, numberOptions)} />
                        </FormField>
                        <FormField label="实际到账日" error={errors.installments?.[index]?.received_date?.message}>
                          <Input type="date" {...register(`installments.${index}.received_date`)} />
                        </FormField>

                        {(businessType === 'saas_first' || businessType === 'saas_private_first') && (
                          <>
                            <FormField label="本期实施费分摊">
                              <Input min="0" step="0.01" type="number" {...register(`installments.${index}.implementation_fee_allocated`, numberOptions)} />
                            </FormField>
                            <FormField label="本期商务费分摊">
                              <Input min="0" step="0.01" type="number" {...register(`installments.${index}.business_fee_allocated`, numberOptions)} />
                            </FormField>
                          </>
                        )}

                        {businessType === 'enterprise' && (
                          <>
                            <FormField label="此前累计折算基数">
                              <Input
                                min="0"
                                placeholder="留空则按已录入各期推算"
                                step="0.01"
                                type="number"
                                {...register(`installments.${index}.cumulative_basis_before`, nullableNumberOptions)}
                              />
                            </FormField>
                            <FormField className="sm:col-span-2 lg:col-span-3" label="低折扣书面依据">
                              <Input placeholder="成交折扣低于 80% 时填写" {...register(`installments.${index}.discount_approval_reference`)} />
                            </FormField>
                          </>
                        )}
                      </div>

                      <div className="check-grid mt-4">
                        {businessType === 'enterprise' && (
                          <CheckField control={control} name={`installments.${index}.milestone_complete`} label="本期里程碑已完成" />
                        )}
                        <CheckField control={control} name={`installments.${index}.non_sales_delay`} label="延期已确认非销售责任" />
                        {businessType === 'enterprise' && (
                          <>
                            <CheckField control={control} name={`installments.${index}.early_payment_60_days`} label="主动提前回款至少 60 天" />
                            <CheckField control={control} name={`installments.${index}.delivery_ahead_30_days`} label="交付提前至少 30 天" />
                          </>
                        )}
                      </div>

                      {(installment?.non_sales_delay ||
                        installment?.early_payment_60_days ||
                        installment?.delivery_ahead_30_days) && (
                        <div className="form-grid mt-4 sm:grid-cols-2">
                          {installment.non_sales_delay && (
                            <>
                              <FormField label="非销售责任原因">
                                <Input {...register(`installments.${index}.non_sales_delay_reason`)} />
                              </FormField>
                              <FormField label="非销售责任书面依据">
                                <Input {...register(`installments.${index}.non_sales_approval_reference`)} />
                              </FormField>
                            </>
                          )}
                          {installment.early_payment_60_days && (
                            <FormField label="提前回款证据">
                              <Input {...register(`installments.${index}.early_payment_evidence`)} />
                            </FormField>
                          )}
                          {installment.delivery_ahead_30_days && (
                            <FormField label="提前交付证据">
                              <Input {...register(`installments.${index}.delivery_evidence`)} />
                            </FormField>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          <DialogFooter className="m-0 px-4 py-4 sm:px-6">
            <Button type="button" variant="outline" onClick={() => close(false)}>
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <FileCheck2 data-icon="inline-start" />
              {isSubmitting ? '正在保存…' : isEditing ? '保存修正' : '保存合同'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormField({
  children,
  className = '',
  error,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  error?: string;
  label: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <p className="text-sm font-medium leading-none">{label}</p>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function CheckField({
  control,
  hint,
  label,
  name,
}: {
  control: ReturnType<typeof useForm<ContractInput>>['control'];
  hint?: string;
  label: string;
  name: Parameters<typeof control.register>[0];
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <label className="check-field">
          <Checkbox
            checked={Boolean(field.value)}
            onCheckedChange={(checked) => field.onChange(Boolean(checked))}
          />
          <span>
            <strong>{label}</strong>
            {hint && <small>{hint}</small>}
          </span>
        </label>
      )}
    />
  );
}
