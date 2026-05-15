import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Building2, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { showToast, ToastContainer } from '@/components/ui/Toast';
import { getRegistrationOptions, type AccountType, type RegistrationOptions } from '@/api/endpoints/auth';
import { TENANTS } from '@/stores/useTenantStore';
import { useAuthStore } from '@/stores/useAuthStore';

const fallbackOptions: RegistrationOptions = {
  companies: TENANTS,
  roles: {
    ops: [
      { value: 'ops_content', label: '运营 · 内容审核员' },
      { value: 'ops_distribution', label: '运营 · 分发执行员' },
      { value: 'ops_admin', label: '运营 · 平台管理员' },
    ],
    pharma: [
      { value: 'pharma_compliance', label: '药企 · 合规' },
      { value: 'pharma_marketing', label: '药企 · 市场' },
      { value: 'pharma_bd', label: '药企 · BD' },
      { value: 'pharma_viewer', label: '药企 · 查看' },
    ],
  },
};

interface LocationState {
  from?: { pathname?: string };
}

export function LoginRegister(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, initialized, loading, error, fetchMe, login, register, clearError } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [options, setOptions] = useState<RegistrationOptions>(fallbackOptions);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('pharma');
  const [role, setRole] = useState('pharma_compliance');
  const [companyId, setCompanyId] = useState('T-NV');
  const [companyName, setCompanyName] = useState('');

  const from = (location.state as LocationState | null)?.from?.pathname || '/';

  useEffect(() => {
    if (!initialized) void fetchMe();
  }, [fetchMe, initialized]);

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [from, navigate, user]);

  useEffect(() => {
    void getRegistrationOptions()
      .then((res) => {
        setOptions({
          companies: res.data.companies.length > 0 ? res.data.companies : fallbackOptions.companies,
          roles: res.data.roles,
        });
      })
      .catch(() => setOptions(fallbackOptions));
  }, []);

  const pharmaCompanies = useMemo(() => options.companies.filter((company) => company.type === 'pharma'), [options.companies]);
  const selectedCompany = pharmaCompanies.find((company) => company.id === companyId);
  const roleOptions = options.roles[accountType] ?? fallbackOptions.roles[accountType];

  const handleAccountTypeChange = (nextType: string): void => {
    const typed = nextType === 'ops' ? 'ops' : 'pharma';
    setAccountType(typed);
    setRole((options.roles[typed] ?? fallbackOptions.roles[typed])[0]?.value ?? (typed === 'ops' ? 'ops_content' : 'pharma_compliance'));
    if (typed === 'ops') setCompanyId('T-PX');
    else setCompanyId(pharmaCompanies[0]?.id ?? '');
  };

  const switchMode = (nextMode: 'login' | 'register'): void => {
    clearError();
    setMode(nextMode);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    clearError();

    try {
      if (mode === 'login') {
        await login({ email, password });
        showToast('登录成功', 'success');
      } else {
        await register({
          name,
          email,
          password,
          accountType,
          role,
          companyId: accountType === 'pharma' && companyId !== '__custom' ? companyId : undefined,
          companyName: accountType === 'pharma' ? (companyId === '__custom' ? companyName : selectedCompany?.name) : 'Px Ops',
        });
        showToast('注册成功，已按角色进入对应视图', 'success');
      }
      navigate(from, { replace: true });
    } catch (submitError) {
      showToast(submitError instanceof Error ? submitError.message : '操作失败，请重试', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-[-15%] top-[-20%] h-[520px] w-[520px] rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] h-[520px] w-[520px] rounded-full bg-accent-blue/10 blur-[120px]" />
      </div>

      <main className="relative mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 items-center gap-8 px-6 py-10 lg:grid-cols-[1.05fr_.95fr]">
        <section className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            账号角色决定视图，无需手动切换租户
          </div>
          <div>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              Px Lite 登录与注册
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
              注册时填写账号角色和所属公司。运营账号登录后固定进入运营视图；药企账号登录后固定进入自身公司的药企视图。
            </p>
          </div>
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <Card className="p-4">
              <Building2 className="mb-3 h-5 w-5 text-primary" />
              <div className="text-sm font-semibold text-foreground">公司绑定</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">注册时选择 Px Ops 或药企公司，后续数据范围锁定到该公司。</p>
            </Card>
            <Card className="p-4">
              <UserRound className="mb-3 h-5 w-5 text-primary" />
              <div className="text-sm font-semibold text-foreground">角色驱动</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Header 仅显示当前身份，不再提供“切换租户视角”。</p>
            </Card>
          </div>
        </section>

        <Card className="relative p-6 md:p-7">
          <div className="mb-6 flex rounded-lg border border-border bg-bg-secondary p-1">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${mode === 'login' ? 'bg-bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${mode === 'register' ? 'bg-bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              注册
            </button>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {mode === 'register' && <Input label="姓名" value={name} onChange={(event) => setName(event.target.value)} placeholder="请输入真实姓名" required />}
            <Input label="邮箱" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" required />
            <Input label="密码" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'register' ? '至少 8 位' : '请输入密码'} required minLength={mode === 'register' ? 8 : undefined} />

            {mode === 'register' && (
              <div className="space-y-4 rounded-xl border border-border bg-bg-secondary/40 p-4">
                <Select
                  label="账号类型"
                  value={accountType}
                  onChange={handleAccountTypeChange}
                  options={[
                    { value: 'pharma', label: '药企账号 · 进入药企视图' },
                    { value: 'ops', label: 'Px 运营账号 · 进入运营视图' },
                  ]}
                />
                <Select label="角色" value={role} onChange={setRole} options={roleOptions} />
                {accountType === 'pharma' ? (
                  <>
                    <Select
                      label="所属公司"
                      value={companyId}
                      onChange={setCompanyId}
                      options={[
                        ...pharmaCompanies.map((company) => ({ value: company.id, label: `${company.shortName} · ${company.name}` })),
                        { value: '__custom', label: '新增公司' },
                      ]}
                    />
                    {companyId === '__custom' && <Input label="公司名称" value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="例如：某某制药（中国）" required />}
                  </>
                ) : (
                  <Input label="所属公司" value="Px Ops · Px 自营运营组" disabled />
                )}
              </div>
            )}

            {error && <div className="rounded-lg border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">{error}</div>}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              <LockKeyhole className="h-4 w-4" />
              {loading ? '处理中…' : mode === 'login' ? '登录' : '注册并进入系统'}
            </Button>
          </form>
        </Card>
      </main>
      <ToastContainer />
    </div>
  );
}
