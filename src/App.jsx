import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  LayoutDashboard, Wallet, ShieldCheck, Plane, TrendingUp,
  Plus, Trash2, ChevronRight, Info, LogOut, Sparkles, ArrowUp, ArrowDown, Check
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase.js';
import { useAuth } from './AuthContext.jsx';
import Login from './Login.jsx';

const STORAGE_KEY = 'financas:estado:v1';

const defaultState = {
  incomes: [{ id: 'i1', name: 'Salário', amount: 6000 }],
  expenses: [
    { id: 'a1', name: 'Moradia', amount: 1800, installment: false, totalInstallments: 1, paidInstallments: 0 },
    { id: 'a2', name: 'Alimentação', amount: 900, installment: false, totalInstallments: 1, paidInstallments: 0 },
    { id: 'a3', name: 'Transporte', amount: 400, installment: false, totalInstallments: 1, paidInstallments: 0 },
    { id: 'a4', name: 'Contas fixas', amount: 350, installment: false, totalInstallments: 1, paidInstallments: 0 },
    { id: 'a5', name: 'Moto (parcelada)', amount: 650, installment: true, totalInstallments: 48, paidInstallments: 5 },
  ],
  emergency: { multiplier: 6, current: 1500, monthlyContribution: 300, entries: [] },
  travel: {
    name: 'Viagem dos sonhos',
    target: 12000,
    current: 800,
    monthlyContribution: 250,
    targetDate: '',
    entries: [],
  },
  investment: {
    monthlyAmount: 0,
    useAuto: true,
    allocation: { rendaFixa: 40, fiis: 30, acoes: 30 },
    // referências de mercado (jul/2026): Selic 14,25% a.a. / CDI ~14,15% a.a.;
    // IFIX com dividend yield médio histórico de ~8% a.a. + valorização de cota;
    // Ibovespa com retorno nominal de longo prazo na casa de 11-12% a.a.
    returns: { rendaFixa: 13, fiis: 11, acoes: 12 },
  },
  wishlist: [
    { id: 'w1', name: 'Tênis novo', price: 400 },
    { id: 'w2', name: 'Roupa', price: 250 },
    { id: 'w3', name: 'Sair com os amigos', price: 150 },
  ],
};

const fmtBRL = (v) =>
  (isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const uid = () => Math.random().toString(36).slice(2, 9);

// Parcelas: quanto falta pagar de uma despesa parcelada
const remainingInstallments = (e) => Math.max(0, (e.totalInstallments || 0) - (e.paidInstallments || 0));
const isQuitado = (e) => e.installment && remainingInstallments(e) <= 0;
const remainingInstallmentValue = (e) => remainingInstallments(e) * (Number(e.amount) || 0);
// valor que efetivamente pesa no mês: se parcelado e já quitado, deixa de contar
const effectiveMonthlyAmount = (e) => (isQuitado(e) ? 0 : Number(e.amount) || 0);

function projectInvestment(monthlyAmount, allocation, returns, months = 36) {
  const alloc = {
    rendaFixa: (monthlyAmount * allocation.rendaFixa) / 100,
    fiis: (monthlyAmount * allocation.fiis) / 100,
    acoes: (monthlyAmount * allocation.acoes) / 100,
  };
  const rates = {
    rendaFixa: Math.pow(1 + returns.rendaFixa / 100, 1 / 12) - 1,
    fiis: Math.pow(1 + returns.fiis / 100, 1 / 12) - 1,
    acoes: Math.pow(1 + returns.acoes / 100, 1 / 12) - 1,
  };
  let bal = { rendaFixa: 0, fiis: 0, acoes: 0 };
  const data = [{ month: 0, ano: 0, rendaFixa: 0, fiis: 0, acoes: 0, total: 0 }];
  for (let m = 1; m <= months; m++) {
    bal.rendaFixa = (bal.rendaFixa + alloc.rendaFixa) * (1 + rates.rendaFixa);
    bal.fiis = (bal.fiis + alloc.fiis) * (1 + rates.fiis);
    bal.acoes = (bal.acoes + alloc.acoes) * (1 + rates.acoes);
    const total = bal.rendaFixa + bal.fiis + bal.acoes;
    data.push({
      month: m,
      ano: +(m / 12).toFixed(2),
      rendaFixa: bal.rendaFixa,
      fiis: bal.fiis,
      acoes: bal.acoes,
      total,
    });
  }
  return data;
}

const NAV = [
  { id: 'painel', label: 'Painel', icon: LayoutDashboard },
  { id: 'renda', label: 'Renda & Despesas', icon: Wallet },
  { id: 'emergencia', label: 'Reserva de Emergência', icon: ShieldCheck },
  { id: 'viagem', label: 'Viagem', icon: Plane },
  { id: 'prosperar', label: 'Prosperar', icon: Sparkles },
  { id: 'investimento', label: 'Plano de Investimento', icon: TrendingUp },
];

const PIE_COLORS = ['#1F6F54', '#B8862E', '#8B3A2B', '#4A5C55', '#5E8C7C', '#C9A64A'];

function AppShell({ user }) {
  const { logout } = useAuth();
  const [state, setState] = useState(defaultState);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('painel');

  // Carrega os dados do Firestore, no documento do usuário logado.
  // Cada usuário só enxerga o próprio documento (veja firestore.rules).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ref = doc(db, 'livrocaixa', user.uid);
        const snap = await getDoc(ref);
        if (!cancelled && snap.exists()) {
          setState(snap.data().state || defaultState);
        }
      } catch (e) {
        console.error('Falha ao carregar dados do usuário', e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user.uid]);

  // Salva no Firestore (documento do próprio usuário) sempre que o estado muda,
  // com um pequeno debounce para não gravar a cada tecla digitada.
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      const ref = doc(db, 'livrocaixa', user.uid);
      setDoc(ref, { state, updatedAt: new Date().toISOString() }).catch((e) => {
        console.error('Falha ao salvar', e);
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [state, loaded, user.uid]);

  const totalIncome = useMemo(
    () => state.incomes.reduce((s, i) => s + (Number(i.amount) || 0), 0),
    [state.incomes]
  );

  const totalExpenses = useMemo(
    () => state.expenses.reduce((s, e) => s + effectiveMonthlyAmount(e), 0),
    [state.expenses]
  );
  // saldo bruto: renda menos despesas, antes de separar dinheiro para metas
  const grossBalance = totalIncome - totalExpenses;

  const emergencyTarget = state.emergency.multiplier * totalExpenses;
  const emergencyRemaining = Math.max(0, emergencyTarget - state.emergency.current);
  const emergencyMonths =
    state.emergency.monthlyContribution > 0
      ? Math.ceil(emergencyRemaining / state.emergency.monthlyContribution)
      : Infinity;

  const travelRemaining = Math.max(0, state.travel.target - state.travel.current);
  const travelMonths =
    state.travel.monthlyContribution > 0
      ? Math.ceil(travelRemaining / state.travel.monthlyContribution)
      : Infinity;

  const committed = state.emergency.monthlyContribution + state.travel.monthlyContribution;
  const suggestedInvest = Math.max(0, grossBalance - committed);
  const investMonthly = state.investment.useAuto ? suggestedInvest : state.investment.monthlyAmount;

  // saldo livre: o que sobra depois de já reservar emergência, viagem e investimento
  const balance = grossBalance - committed - investMonthly;

  const projection = useMemo(
    () => projectInvestment(investMonthly, state.investment.allocation, state.investment.returns, 36),
    [investMonthly, state.investment.allocation, state.investment.returns]
  );
  const finalValue = projection[36]?.total || 0;
  const totalInvested = investMonthly * 36;
  const totalGain = finalValue - totalInvested;

  // "Prosperar": com o saldo livre do mês (balance), verifica em ordem de
  // prioridade (ordem da lista) o que já dá pra comprar. Um item só é
  // considerado liberado se, somado a todos os itens antes dele na lista,
  // ainda couber dentro do saldo livre — assim a prioridade é sempre respeitada.
  const wishlistComputed = useMemo(() => {
    let acc = 0;
    return state.wishlist.map((item) => {
      acc += item.price;
      const unlocked = balance > 0 && acc <= balance;
      const monthsToSave = balance > 0 ? Math.ceil(acc / balance) : Infinity;
      return { ...item, unlocked, monthsToSave };
    });
  }, [state.wishlist, balance]);

  const nextWishlistUnlock = wishlistComputed.find((i) => !i.unlocked);

  const allocSum =
    state.investment.allocation.rendaFixa +
    state.investment.allocation.fiis +
    state.investment.allocation.acoes;

  const updateIncome = (id, field, value) => {
    setState((s) => ({
      ...s,
      incomes: s.incomes.map((i) => (i.id === id ? { ...i, [field]: value } : i)),
    }));
  };
  const addIncome = () => {
    setState((s) => ({ ...s, incomes: [...s.incomes, { id: uid(), name: 'Nova renda', amount: 0 }] }));
  };
  const removeIncome = (id) => {
    setState((s) => ({ ...s, incomes: s.incomes.filter((i) => i.id !== id) }));
  };

  const updateExpense = (id, field, value) => {
    setState((s) => ({
      ...s,
      expenses: s.expenses.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    }));
  };
  const addExpense = () => {
    setState((s) => ({
      ...s,
      expenses: [
        ...s.expenses,
        { id: uid(), name: 'Nova despesa', amount: 0, installment: false, totalInstallments: 1, paidInstallments: 0 },
      ],
    }));
  };
  const removeExpense = (id) => {
    setState((s) => ({ ...s, expenses: s.expenses.filter((e) => e.id !== id) }));
  };
  const markInstallmentPaid = (id) => {
    setState((s) => ({
      ...s,
      expenses: s.expenses.map((e) =>
        e.id === id
          ? { ...e, paidInstallments: Math.min(e.totalInstallments, (e.paidInstallments || 0) + 1) }
          : e
      ),
    }));
  };

  const addEntry = (goal) => {
    setState((s) => {
      const g = s[goal];
      const amount = g.monthlyContribution || 0;
      if (amount <= 0) return s;
      const entry = { id: uid(), date: new Date().toISOString().slice(0, 10), amount };
      return {
        ...s,
        [goal]: {
          ...g,
          current: g.current + amount,
          entries: [entry, ...g.entries].slice(0, 12),
        },
      };
    });
  };

  if (!loaded) {
    return (
      <div style={{ padding: 40, fontFamily: 'IBM Plex Sans, sans-serif', color: '#4A5C55' }}>
        Carregando seu livro-caixa…
      </div>
    );
  }

  return (
    <div className="fw-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

        .fw-root {
          --paper: #F6F3EC;
          --paper-card: #FFFEFA;
          --line: #DED7C4;
          --ink: #1C2B26;
          --ink-soft: #5B6B63;
          --emerald: #1F6F54;
          --emerald-dark: #16503D;
          --emerald-tint: #E4EFE9;
          --gold: #B8862E;
          --gold-tint: #F3E9D2;
          --brick: #8B3A2B;
          --brick-tint: #F1E1DB;
          font-family: 'IBM Plex Sans', sans-serif;
          color: var(--ink);
          background: var(--paper);
          min-height: 100vh;
          display: flex;
          width: 100%;
        }
        .fw-root * { box-sizing: border-box; }
        .fw-num { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
        .fw-display { font-family: 'Fraunces', serif; }

        .fw-sidebar {
          width: 220px;
          flex-shrink: 0;
          background: var(--ink);
          color: #EFEAE0;
          padding: 28px 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-height: 100vh;
        }
        .fw-brand {
          font-family: 'Fraunces', serif;
          font-size: 20px;
          font-weight: 600;
          padding: 0 24px 24px 24px;
          border-bottom: 1px solid rgba(239,234,224,0.15);
          margin-bottom: 12px;
        }
        .fw-brand span { color: var(--gold); }
        .fw-navitem {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 24px;
          font-size: 14px;
          color: #C9C2B2;
          cursor: pointer;
          border-left: 3px solid transparent;
          transition: all 0.15s ease;
        }
        .fw-navitem:hover { color: #EFEAE0; background: rgba(255,255,255,0.04); }
        .fw-navitem.active {
          color: #fff;
          border-left: 3px solid var(--gold);
          background: rgba(255,255,255,0.06);
        }
        .fw-main {
          flex: 1;
          padding: 36px 44px 60px 44px;
          max-width: 980px;
        }
        .fw-pagehead {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          border-bottom: 2px solid var(--ink);
          padding-bottom: 14px;
          margin-bottom: 28px;
        }
        .fw-pagehead h1 {
          font-family: 'Fraunces', serif;
          font-size: 30px;
          font-weight: 600;
          margin: 0;
        }
        .fw-eyebrow {
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-soft);
        }

        .fw-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
        .fw-card {
          background: var(--paper-card);
          border: 1px solid var(--line);
          border-radius: 4px;
          padding: 18px 18px 16px 18px;
          position: relative;
        }
        .fw-card-label { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft); margin-bottom: 8px; }
        .fw-card-value { font-family: 'IBM Plex Mono', monospace; font-size: 22px; font-weight: 600; }
        .fw-card-value.pos { color: var(--emerald-dark); }
        .fw-card-value.neg { color: var(--brick); }

        .fw-section {
          background: var(--paper-card);
          border: 1px solid var(--line);
          border-radius: 4px;
          padding: 24px 26px;
          margin-bottom: 24px;
        }
        .fw-section h2 {
          font-family: 'Fraunces', serif;
          font-size: 18px;
          font-weight: 600;
          margin: 0 0 4px 0;
        }
        .fw-section .fw-sub { font-size: 13px; color: var(--ink-soft); margin-bottom: 18px; }

        .fw-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 9px 0;
          border-bottom: 1px dashed var(--line);
          font-size: 14px;
        }
        .fw-row:last-child { border-bottom: none; }
        .fw-row input[type="text"], .fw-row input[type="number"] {
          font-family: inherit;
          border: none;
          background: transparent;
          font-size: 14px;
          padding: 4px 2px;
          border-bottom: 1px solid transparent;
        }
        .fw-row input[type="text"]:focus, .fw-row input[type="number"]:focus {
          outline: none;
          border-bottom: 1px solid var(--emerald);
        }
        .fw-amount-input {
          font-family: 'IBM Plex Mono', monospace;
          text-align: right;
          width: 110px;
        }

        .fw-field { margin-bottom: 16px; }
        .fw-field label { display: block; font-size: 12.5px; color: var(--ink-soft); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em; }
        .fw-field input, .fw-field select {
          width: 100%;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 15px;
          padding: 9px 10px;
          border: 1px solid var(--line);
          border-radius: 3px;
          background: #fff;
          color: var(--ink);
        }
        .fw-field input:focus, .fw-field select:focus { outline: none; border-color: var(--emerald); }
        .fw-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .fw-grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }

        .fw-btn {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--emerald); color: #fff; border: none;
          padding: 9px 16px; font-size: 13.5px; font-weight: 500;
          border-radius: 3px; cursor: pointer;
        }
        .fw-btn:hover { background: var(--emerald-dark); }
        .fw-btn.ghost {
          background: transparent; color: var(--ink); border: 1px solid var(--line);
        }
        .fw-btn.ghost:hover { border-color: var(--ink); }
        .fw-iconbtn {
          background: none; border: none; cursor: pointer; color: var(--ink-soft); padding: 4px;
        }
        .fw-iconbtn:hover { color: var(--brick); }

        .fw-progress-track {
          height: 10px; background: var(--paper); border: 1px solid var(--line);
          border-radius: 6px; overflow: hidden; margin: 10px 0 6px 0;
        }
        .fw-progress-fill { height: 100%; background: var(--emerald); }
        .fw-progress-fill.gold { background: var(--gold); }

        .fw-seg { display: flex; gap: 8px; margin-bottom: 4px; }
        .fw-seg button {
          flex: 1; padding: 10px; font-family: 'IBM Plex Mono', monospace; font-size: 13px;
          border: 1px solid var(--line); background: #fff; border-radius: 3px; cursor: pointer; color: var(--ink-soft);
        }
        .fw-seg button.active { background: var(--emerald-tint); border-color: var(--emerald); color: var(--emerald-dark); font-weight: 600; }

        .fw-stamps { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
        .fw-stamp {
          border: 2px dashed var(--gold);
          color: var(--gold);
          border-radius: 50%;
          width: 84px; height: 84px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          transform: rotate(-4deg);
          background: var(--gold-tint);
          flex-shrink: 0;
        }
        .fw-stamp b { font-size: 12.5px; margin-bottom: 2px; }

        .fw-note {
          display: flex; gap: 8px; align-items: flex-start;
          background: var(--gold-tint); border: 1px solid var(--gold);
          border-radius: 4px; padding: 12px 14px; font-size: 13px; color: #6B4E1B; margin-top: 4px;
        }
        .fw-note svg { flex-shrink: 0; margin-top: 1px; }

        .fw-disclaimer {
          font-size: 12px; color: var(--ink-soft); border-top: 1px solid var(--line);
          padding-top: 14px; margin-top: 8px; line-height: 1.5;
        }

        .fw-allocrow { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
        .fw-allocrow .swatch { width: 12px; height: 12px; border-radius: 2px; flex-shrink: 0; }
        .fw-allocrow .name { width: 150px; font-size: 13.5px; }
        .fw-allocrow input[type="range"] { flex: 1; accent-color: var(--emerald); }
        .fw-allocrow .pct { width: 42px; text-align: right; font-family: 'IBM Plex Mono', monospace; font-size: 13.5px; }
        .fw-allocrow .ret { width: 90px; }
        .fw-allocrow .ret input { width: 60px; font-family: 'IBM Plex Mono', monospace; text-align: right; border: 1px solid var(--line); border-radius: 3px; padding: 4px 6px; }

        @media (max-width: 860px) {
          .fw-cards { grid-template-columns: 1fr 1fr; }
          .fw-grid2, .fw-grid3 { grid-template-columns: 1fr; }
          .fw-sidebar { width: 72px; }
          .fw-brand, .fw-navitem span.label { display: none; }
          .fw-navitem { justify-content: center; padding: 12px; }
          .fw-main { padding: 24px 18px 50px 18px; }
        }
      `}</style>

      <nav className="fw-sidebar">
        <div className="fw-brand">Livro<span>Caixa</span></div>
        {NAV.map((n) => {
          const Icon = n.icon;
          return (
            <div
              key={n.id}
              className={`fw-navitem ${tab === n.id ? 'active' : ''}`}
              onClick={() => setTab(n.id)}
            >
              <Icon size={17} />
              <span className="label">{n.label}</span>
            </div>
          );
        })}
        <div className="fw-navitem" style={{ marginTop: 'auto' }} onClick={logout} title="Sair">
          <LogOut size={17} />
          <span className="label">Sair</span>
        </div>
      </nav>

      <main className="fw-main">
        {tab === 'painel' && (
          <PainelTab
            totalIncome={totalIncome}
            totalExpenses={totalExpenses}
            grossBalance={grossBalance}
            committed={committed}
            investMonthly={investMonthly}
            balance={balance}
            emergency={state.emergency}
            emergencyTarget={emergencyTarget}
            travel={state.travel}
            finalValue={finalValue}
            expenses={state.expenses}
            setTab={setTab}
            wishlist={wishlistComputed}
            nextWishlistUnlock={nextWishlistUnlock}
          />
        )}

        {tab === 'renda' && (
          <RendaTab
            incomes={state.incomes}
            updateIncome={updateIncome}
            addIncome={addIncome}
            removeIncome={removeIncome}
            totalIncome={totalIncome}
            expenses={state.expenses}
            updateExpense={updateExpense}
            addExpense={addExpense}
            removeExpense={removeExpense}
            markInstallmentPaid={markInstallmentPaid}
            totalExpenses={totalExpenses}
            grossBalance={grossBalance}
            committed={committed}
            emergency={state.emergency}
            travel={state.travel}
            investMonthly={investMonthly}
            balance={balance}
          />
        )}

        {tab === 'emergencia' && (
          <EmergenciaTab
            emergency={state.emergency}
            setEmergency={(fn) => setState((s) => ({ ...s, emergency: fn(s.emergency) }))}
            totalExpenses={totalExpenses}
            target={emergencyTarget}
            remaining={emergencyRemaining}
            months={emergencyMonths}
            onAporte={() => addEntry('emergency')}
          />
        )}

        {tab === 'viagem' && (
          <ViagemTab
            travel={state.travel}
            setTravel={(fn) => setState((s) => ({ ...s, travel: fn(s.travel) }))}
            remaining={travelRemaining}
            months={travelMonths}
            onAporte={() => addEntry('travel')}
          />
        )}

        {tab === 'prosperar' && (
          <ProsperarTab
            wishlist={wishlistComputed}
            balance={balance}
            nextWishlistUnlock={nextWishlistUnlock}
            addWishlistItem={(name, price) =>
              setState((s) => ({
                ...s,
                wishlist: [...s.wishlist, { id: `w${Date.now()}`, name, price }],
              }))
            }
            removeWishlistItem={(id) =>
              setState((s) => ({ ...s, wishlist: s.wishlist.filter((w) => w.id !== id) }))
            }
            moveWishlistItem={(id, dir) =>
              setState((s) => {
                const list = [...s.wishlist];
                const idx = list.findIndex((w) => w.id === id);
                const swapWith = idx + dir;
                if (swapWith < 0 || swapWith >= list.length) return s;
                [list[idx], list[swapWith]] = [list[swapWith], list[idx]];
                return { ...s, wishlist: list };
              })
            }
          />
        )}

        {tab === 'investimento' && (
          <InvestimentoTab
            investment={state.investment}
            setInvestment={(fn) => setState((s) => ({ ...s, investment: fn(s.investment) }))}
            suggestedInvest={suggestedInvest}
            investMonthly={investMonthly}
            projection={projection}
            finalValue={finalValue}
            totalInvested={totalInvested}
            totalGain={totalGain}
            allocSum={allocSum}
          />
        )}
      </main>
    </div>
  );
}

export default function App() {
  const { user, checking } = useAuth();

  if (checking) {
    return (
      <div style={{ padding: 40, fontFamily: 'IBM Plex Sans, sans-serif', color: '#4A5C55' }}>
        Verificando login…
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <AppShell user={user} />;
}

function ProgressBar({ value, gold }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div className="fw-progress-track">
      <div className={`fw-progress-fill ${gold ? 'gold' : ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// Lê o saldo livre do mês e devolve uma leitura em texto da situação:
// no vermelho (gastando mais que ganha), no limite (sobra pouco), ou
// tranquilo (dá pra gastar algo fora da rotina).
function getFinancialStatus(balance, totalIncome) {
  const cushion = Math.max(100, totalIncome * 0.03); // "zona de aperto": até 3% da renda (mín. R$100)
  if (balance < 0) {
    return {
      level: 'neg',
      title: 'Atenção com os gastos',
      text: `Seus gastos e contribuições estão ${fmtBRL(Math.abs(balance))} acima da sua renda este mês. Vale rever alguma despesa ou reduzir uma contribuição (reserva, viagem ou investimento) até as contas fecharem.`,
    };
  }
  if (balance <= cushion) {
    return {
      level: 'neutral',
      title: 'Contas em dia, sem muita folga',
      text: `Suas contas fecham no positivo, mas sobra pouco (${fmtBRL(balance)}) pra gastar fora da rotina esse mês. Bom mês pra manter os gastos como estão.`,
    };
  }
  return {
    level: 'pos',
    title: 'Você está indo bem',
    text: `Suas metas e contas já estão cobertas, e sobrou ${fmtBRL(balance)} esse mês pra gastar com algo fora da rotina — dá uma olhada na aba Prosperar pra ver o que já pode tirar da lista.`,
  };
}

function PainelTab({ totalIncome, totalExpenses, grossBalance, committed, investMonthly, balance, emergency, emergencyTarget, travel, finalValue, expenses, setTab, wishlist, nextWishlistUnlock }) {
  const pieData = expenses
    .map((e) => ({ name: e.name, value: effectiveMonthlyAmount(e) }))
    .filter((e) => e.value > 0);
  const status = getFinancialStatus(balance, totalIncome);
  return (
    <>
      <div className="fw-pagehead">
        <div>
          <div className="fw-eyebrow">Visão geral</div>
          <h1>Painel</h1>
        </div>
      </div>

      <div
        className="fw-card"
        style={{
          borderLeft: `4px solid var(--${status.level === 'neg' ? 'brick' : status.level === 'neutral' ? 'gold' : 'emerald'})`,
          background: `var(--${status.level === 'neg' ? 'brick' : status.level === 'neutral' ? 'gold' : 'emerald'}-tint)`,
          marginBottom: 20,
        }}
      >
        <div
          className="fw-card-label"
          style={{ color: `var(--${status.level === 'neg' ? 'brick' : status.level === 'neutral' ? 'gold' : 'emerald-dark'})` }}
        >
          {status.title}
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ink)', marginTop: 6, lineHeight: 1.5 }}>{status.text}</div>
      </div>

      <div className="fw-cards">
        <div className="fw-card">
          <div className="fw-card-label">Saldo livre</div>
          <div className={`fw-card-value ${balance >= 0 ? 'pos' : 'neg'}`}>{fmtBRL(balance)}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>já descontando reserva, viagem e investimento</div>
        </div>
        <div className="fw-card">
          <div className="fw-card-label">Reserva de emergência</div>
          <div className="fw-card-value">{fmtBRL(emergency.current)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 4 }}>
            meta {fmtBRL(emergencyTarget)}
          </div>
        </div>
        <div className="fw-card">
          <div className="fw-card-label">{travel.name || 'Viagem'}</div>
          <div className="fw-card-value">{fmtBRL(travel.current)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 4 }}>
            meta {fmtBRL(travel.target)}
          </div>
        </div>
        <div className="fw-card">
          <div className="fw-card-label">Projeção em 3 anos</div>
          <div className="fw-card-value pos">{fmtBRL(finalValue)}</div>
        </div>
      </div>

      <div className="fw-grid2">
        <div className="fw-section">
          <h2>De onde vem, para onde vai</h2>
          <div className="fw-sub">Como sua renda mensal é distribuída</div>
          <div className="fw-row">
            <span>Renda total</span>
            <span className="fw-num">{fmtBRL(totalIncome)}</span>
          </div>
          <div className="fw-row">
            <span>Despesas</span>
            <span className="fw-num" style={{ color: 'var(--brick)' }}>− {fmtBRL(totalExpenses)}</span>
          </div>
          <div className="fw-row">
            <span>Saldo bruto</span>
            <span className="fw-num">{fmtBRL(grossBalance)}</span>
          </div>
          <div className="fw-row">
            <span>Reserva de emergência + Viagem</span>
            <span className="fw-num" style={{ color: 'var(--brick)' }}>− {fmtBRL(committed)}</span>
          </div>
          <div className="fw-row">
            <span>Investimento mensal</span>
            <span className="fw-num" style={{ color: 'var(--brick)' }}>− {fmtBRL(investMonthly)}</span>
          </div>
          <div className="fw-row" style={{ fontWeight: 600 }}>
            <span>Saldo livre</span>
            <span className="fw-num" style={{ color: balance >= 0 ? 'var(--emerald-dark)' : 'var(--brick)' }}>
              {fmtBRL(balance)}
            </span>
          </div>

          <div style={{ width: '100%', height: 200, marginTop: 18 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={46} outerRadius={74} paddingAngle={2}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmtBRL(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="fw-section">
          <h2>Progresso das metas</h2>
          <div className="fw-sub">Reserva de emergência e viagem</div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>Reserva de emergência</span>
              <span className="fw-num">{Math.round((emergency.current / (emergencyTarget || 1)) * 100)}%</span>
            </div>
            <ProgressBar value={emergency.current / (emergencyTarget || 1)} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{travel.name || 'Viagem'}</span>
              <span className="fw-num">{Math.round((travel.current / (travel.target || 1)) * 100)}%</span>
            </div>
            <ProgressBar value={travel.current / (travel.target || 1)} gold />
          </div>

          <div style={{ marginTop: 24, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="fw-btn ghost" onClick={() => setTab('emergencia')}>
              Ver reserva <ChevronRight size={14} />
            </button>
            <button className="fw-btn ghost" onClick={() => setTab('viagem')}>
              Ver viagem <ChevronRight size={14} />
            </button>
            <button className="fw-btn ghost" onClick={() => setTab('investimento')}>
              Ver investimentos <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {wishlist && wishlist.length > 0 && (
          <div className="fw-card" style={{ marginTop: 20 }}>
            <div className="fw-card-label">Prosperar — o que dá pra comprar esse mês</div>
            {wishlist.filter((w) => w.unlocked).length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--ink-soft, #5B6B63)', marginTop: 8 }}>
                Nenhum item liberado ainda este mês.
                {nextWishlistUnlock && (
                  <> Com o saldo livre atual, "{nextWishlistUnlock.name}" ({fmtBRL(nextWishlistUnlock.price)})
                  {' '}fica ao alcance em {nextWishlistUnlock.monthsToSave === Infinity ? '—' : `${nextWishlistUnlock.monthsToSave} ${nextWishlistUnlock.monthsToSave === 1 ? 'mês' : 'meses'}`}.</>
                )}
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              {wishlist.filter((w) => w.unlocked).map((w) => (
                <div className="fw-row" key={w.id}>
                  <span>✅ {w.name}</span>
                  <span className="fw-num">{fmtBRL(w.price)}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <button className="fw-btn ghost" onClick={() => setTab('prosperar')}>
                Ver lista completa <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ExpenseRow({ e, updateExpense, removeExpense, markInstallmentPaid }) {
  const quitado = isQuitado(e);
  const remaining = remainingInstallments(e);

  return (
    <div style={{ borderBottom: '1px dashed var(--line)', padding: '10px 0' }}>
      <div className="fw-row" style={{ borderBottom: 'none', padding: 0 }}>
        <input
          type="text"
          value={e.name}
          onChange={(ev) => updateExpense(e.id, 'name', ev.target.value)}
          style={{ flex: 1 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="number"
            className="fw-amount-input"
            value={e.amount}
            onChange={(ev) => updateExpense(e.id, 'amount', Number(ev.target.value))}
          />
          <button className="fw-iconbtn" onClick={() => removeExpense(e.id)}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 6, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={!!e.installment}
          onChange={(ev) => updateExpense(e.id, 'installment', ev.target.checked)}
        />
        Essa despesa é parcelada
      </label>

      {e.installment && (
        <div style={{ marginTop: 10, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 4, padding: '12px 14px' }}>
          <div className="fw-grid3">
            <div className="fw-field" style={{ marginBottom: 0 }}>
              <label>Total de parcelas</label>
              <input
                type="number"
                min="1"
                value={e.totalInstallments}
                onChange={(ev) => updateExpense(e.id, 'totalInstallments', Math.max(1, Number(ev.target.value)))}
              />
            </div>
            <div className="fw-field" style={{ marginBottom: 0 }}>
              <label>Parcelas já pagas</label>
              <input
                type="number"
                min="0"
                value={e.paidInstallments}
                onChange={(ev) =>
                  updateExpense(e.id, 'paidInstallments', Math.min(e.totalInstallments, Math.max(0, Number(ev.target.value))))
                }
              />
            </div>
            <div className="fw-field" style={{ marginBottom: 0 }}>
              <label>Valor da parcela</label>
              <input type="text" disabled value={fmtBRL(e.amount)} />
            </div>
          </div>

          <ProgressBar value={(e.paidInstallments || 0) / (e.totalInstallments || 1)} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: 13 }}>
              {quitado ? (
                <b style={{ color: 'var(--emerald-dark)' }}>Parcelamento quitado 🎉</b>
              ) : (
                <>
                  Parcela <span className="fw-num">{(e.paidInstallments || 0) + 1}</span> de{' '}
                  <span className="fw-num">{e.totalInstallments}</span> · faltam{' '}
                  <span className="fw-num">{remaining}</span> parcelas ·{' '}
                  <span className="fw-num">{fmtBRL(remainingInstallmentValue(e))}</span> restantes
                </>
              )}
            </span>
            {!quitado && (
              <button className="fw-btn ghost" onClick={() => markInstallmentPaid(e.id)}>
                <Plus size={13} /> Marcar parcela deste mês como paga
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RendaTab({
  incomes, updateIncome, addIncome, removeIncome, totalIncome,
  expenses, updateExpense, addExpense, removeExpense, markInstallmentPaid, totalExpenses,
  grossBalance, committed, emergency, travel, investMonthly, balance,
}) {
  return (
    <>
      <div className="fw-pagehead">
        <div>
          <div className="fw-eyebrow">Entradas e saídas</div>
          <h1>Renda & Despesas</h1>
        </div>
      </div>

      <div className="fw-section">
        <h2>Fontes de renda</h2>
        <div className="fw-sub">Adicione quantas fontes precisar: salário, freelas, aluguel recebido, etc.</div>

        {incomes.map((i) => (
          <div className="fw-row" key={i.id}>
            <input
              type="text"
              value={i.name}
              onChange={(ev) => updateIncome(i.id, 'name', ev.target.value)}
              style={{ flex: 1 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="number"
                className="fw-amount-input"
                value={i.amount}
                onChange={(ev) => updateIncome(i.id, 'amount', Number(ev.target.value))}
              />
              <button className="fw-iconbtn" onClick={() => removeIncome(i.id)} disabled={incomes.length <= 1}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}

        <div style={{ marginTop: 16 }}>
          <button className="fw-btn ghost" onClick={addIncome}>
            <Plus size={14} /> Adicionar renda
          </button>
        </div>

        <div className="fw-row" style={{ marginTop: 16, fontWeight: 600 }}>
          <span>Renda total</span>
          <span className="fw-num">{fmtBRL(totalIncome)}</span>
        </div>
      </div>

      <div className="fw-section">
        <h2>Despesas fixas e variáveis</h2>
        <div className="fw-sub">
          Liste tudo que sai da sua conta todo mês. Para compras parceladas (moto, celular, móveis...), marque a
          caixinha e acompanhe quantas parcelas ainda faltam.
        </div>

        {expenses.map((e) => (
          <ExpenseRow
            key={e.id}
            e={e}
            updateExpense={updateExpense}
            removeExpense={removeExpense}
            markInstallmentPaid={markInstallmentPaid}
          />
        ))}

        <div style={{ marginTop: 16 }}>
          <button className="fw-btn ghost" onClick={addExpense}>
            <Plus size={14} /> Adicionar despesa
          </button>
        </div>

        <div className="fw-row" style={{ marginTop: 16, fontWeight: 600 }}>
          <span>Total de despesas do mês</span>
          <span className="fw-num">{fmtBRL(totalExpenses)}</span>
        </div>
        <div className="fw-note" style={{ marginTop: 14 }}>
          <Info size={15} />
          <span>
            Despesas parceladas só entram no total do mês enquanto ainda têm parcelas em aberto. Quando você marca o
            parcelamento como quitado, ele some do cálculo do saldo automaticamente.
          </span>
        </div>
      </div>

      <div className="fw-section">
        <h2>Saldo do mês</h2>
        <div className="fw-sub">O que sobra depois de tirar despesas, reserva de emergência, viagem e investimento</div>
        <div className="fw-row">
          <span>Renda total</span>
          <span className="fw-num">{fmtBRL(totalIncome)}</span>
        </div>
        <div className="fw-row">
          <span>Despesas</span>
          <span className="fw-num" style={{ color: 'var(--brick)' }}>− {fmtBRL(totalExpenses)}</span>
        </div>
        <div className="fw-row">
          <span>Saldo bruto</span>
          <span className="fw-num">{fmtBRL(grossBalance)}</span>
        </div>
        <div className="fw-row">
          <span>Aporte reserva de emergência</span>
          <span className="fw-num" style={{ color: 'var(--brick)' }}>− {fmtBRL(emergency.monthlyContribution)}</span>
        </div>
        <div className="fw-row">
          <span>Aporte {travel.name || 'viagem'}</span>
          <span className="fw-num" style={{ color: 'var(--brick)' }}>− {fmtBRL(travel.monthlyContribution)}</span>
        </div>
        <div className="fw-row">
          <span>Investimento mensal</span>
          <span className="fw-num" style={{ color: 'var(--brick)' }}>− {fmtBRL(investMonthly)}</span>
        </div>
        <div className="fw-row" style={{ fontWeight: 600 }}>
          <span>Saldo livre</span>
          <span className="fw-num" style={{ color: balance >= 0 ? 'var(--emerald-dark)' : 'var(--brick)' }}>
            {fmtBRL(balance)}
          </span>
        </div>
      </div>
    </>
  );
}

function EmergenciaTab({ emergency, setEmergency, totalExpenses, target, remaining, months, onAporte }) {
  return (
    <>
      <div className="fw-pagehead">
        <div>
          <div className="fw-eyebrow">Colchão de segurança</div>
          <h1>Reserva de Emergência</h1>
        </div>
      </div>

      <div className="fw-section">
        <h2>Quantos meses de gastos você quer guardar?</h2>
        <div className="fw-sub">
          Para o perfil moderado, o mais comum é guardar 6 meses de despesas. Ajuste conforme sua realidade.
        </div>
        <div className="fw-seg">
          {[3, 6, 12].map((m) => (
            <button
              key={m}
              className={emergency.multiplier === m ? 'active' : ''}
              onClick={() => setEmergency((g) => ({ ...g, multiplier: m }))}
            >
              {m} meses
            </button>
          ))}
        </div>
        <div className="fw-note">
          <Info size={15} />
          <span>
            Sua meta é calculada como {emergency.multiplier}× suas despesas mensais atuais ({fmtBRL(totalExpenses)}),
            o que dá <b>{fmtBRL(target)}</b>.
          </span>
        </div>
      </div>

      <div className="fw-section">
        <h2>Seu progresso</h2>
        <div className="fw-grid2">
          <div className="fw-field">
            <label>Valor já guardado (R$)</label>
            <input
              type="number"
              value={emergency.current}
              onChange={(e) => setEmergency((g) => ({ ...g, current: Number(e.target.value) }))}
            />
          </div>
          <div className="fw-field">
            <label>Aporte mensal planejado (R$)</label>
            <input
              type="number"
              value={emergency.monthlyContribution}
              onChange={(e) => setEmergency((g) => ({ ...g, monthlyContribution: Number(e.target.value) }))}
            />
          </div>
        </div>

        <ProgressBar value={emergency.current / (target || 1)} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-soft)' }}>
          <span>{fmtBRL(emergency.current)} de {fmtBRL(target)}</span>
          <span>
            {isFinite(months)
              ? `faltam ${fmtBRL(remaining)} · ~${months} ${months === 1 ? 'mês' : 'meses'}`
              : 'defina um aporte mensal para calcular o prazo'}
          </span>
        </div>

        <div style={{ marginTop: 18 }}>
          <button className="fw-btn" onClick={onAporte} disabled={!emergency.monthlyContribution}>
            <Plus size={14} /> Registrar aporte do mês ({fmtBRL(emergency.monthlyContribution)})
          </button>
        </div>

        {emergency.entries.length > 0 && (
          <div className="fw-stamps">
            {emergency.entries.map((en) => (
              <div className="fw-stamp" key={en.id}>
                <b>{fmtBRL(en.amount)}</b>
                <span>{en.date.split('-').reverse().join('/')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ViagemTab({ travel, setTravel, remaining, months, onAporte }) {
  const now = new Date();
  const monthsUntilDate = travel.targetDate
    ? Math.max(
        0,
        (new Date(travel.targetDate).getFullYear() - now.getFullYear()) * 12 +
          (new Date(travel.targetDate).getMonth() - now.getMonth())
      )
    : null;

  return (
    <>
      <div className="fw-pagehead">
        <div>
          <div className="fw-eyebrow">Meta de curto/médio prazo</div>
          <h1>Viagem</h1>
        </div>
      </div>

      <div className="fw-section">
        <h2>Sua meta</h2>
        <div className="fw-grid2">
          <div className="fw-field">
            <label>Nome da meta</label>
            <input
              type="text"
              value={travel.name}
              onChange={(e) => setTravel((g) => ({ ...g, name: e.target.value }))}
            />
          </div>
          <div className="fw-field">
            <label>Data pretendida (opcional)</label>
            <input
              type="date"
              value={travel.targetDate}
              onChange={(e) => setTravel((g) => ({ ...g, targetDate: e.target.value }))}
            />
          </div>
        </div>
        <div className="fw-grid3">
          <div className="fw-field">
            <label>Valor da meta (R$)</label>
            <input
              type="number"
              value={travel.target}
              onChange={(e) => setTravel((g) => ({ ...g, target: Number(e.target.value) }))}
            />
          </div>
          <div className="fw-field">
            <label>Já guardado (R$)</label>
            <input
              type="number"
              value={travel.current}
              onChange={(e) => setTravel((g) => ({ ...g, current: Number(e.target.value) }))}
            />
          </div>
          <div className="fw-field">
            <label>Aporte mensal (R$)</label>
            <input
              type="number"
              value={travel.monthlyContribution}
              onChange={(e) => setTravel((g) => ({ ...g, monthlyContribution: Number(e.target.value) }))}
            />
          </div>
        </div>

        <ProgressBar value={travel.current / (travel.target || 1)} gold />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-soft)' }}>
          <span>{fmtBRL(travel.current)} de {fmtBRL(travel.target)}</span>
          <span>
            {isFinite(months)
              ? `faltam ${fmtBRL(remaining)} · ~${months} ${months === 1 ? 'mês' : 'meses'} no ritmo atual`
              : 'defina um aporte mensal para calcular o prazo'}
          </span>
        </div>

        {monthsUntilDate !== null && isFinite(months) && (
          <div className="fw-note" style={{ marginTop: 14 }}>
            <Info size={15} />
            <span>
              Faltam {monthsUntilDate} meses até a data escolhida.{' '}
              {months <= monthsUntilDate
                ? 'No ritmo atual, você chega lá a tempo.'
                : `No ritmo atual, faltariam ${months - monthsUntilDate} meses a mais — considere aumentar o aporte mensal.`}
            </span>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <button className="fw-btn" onClick={onAporte} disabled={!travel.monthlyContribution}>
            <Plus size={14} /> Registrar aporte do mês ({fmtBRL(travel.monthlyContribution)})
          </button>
        </div>

        {travel.entries.length > 0 && (
          <div className="fw-stamps">
            {travel.entries.map((en) => (
              <div className="fw-stamp" key={en.id}>
                <b>{fmtBRL(en.amount)}</b>
                <span>{en.date.split('-').reverse().join('/')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ProsperarTab({ wishlist, balance, nextWishlistUnlock, addWishlistItem, removeWishlistItem, moveWishlistItem }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');

  const handleAdd = (e) => {
    e.preventDefault();
    const p = parseFloat(price);
    if (!name.trim() || !p || p <= 0) return;
    addWishlistItem(name.trim(), p);
    setName('');
    setPrice('');
  };

  const unlockedCount = wishlist.filter((w) => w.unlocked).length;

  return (
    <>
      <div className="fw-card">
        <div className="fw-card-label">Prosperar</div>
        <div style={{ fontSize: 13, color: '#5B6B63', marginTop: 4, lineHeight: 1.5 }}>
          Cadastre aqui as coisas que você quer se dar de presente — roupa, tênis, sair com os
          amigos, o que for. A lista funciona por prioridade: o item do topo é liberado primeiro.
          Um item só é marcado como <b>liberado esse mês</b> quando o seu saldo livre atual
          (depois de contas, reserva de emergência e viagem) já dá conta dele <b>e</b> de tudo que
          está à frente dele na lista.
        </div>

        <div className="fw-row" style={{ marginTop: 16 }}>
          <span>Saldo livre este mês</span>
          <span className="fw-num" style={{ color: balance >= 0 ? 'var(--emerald-dark)' : 'var(--brick)' }}>
            {fmtBRL(balance)}
          </span>
        </div>

        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <input
            style={{ flex: 2, minWidth: 160, padding: '9px 11px', border: '1px solid var(--line, #DED7C4)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
            placeholder="O que você quer comprar?"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            style={{ flex: 1, minWidth: 110, padding: '9px 11px', border: '1px solid var(--line, #DED7C4)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
            type="number"
            step="0.01"
            min="0"
            placeholder="Preço (R$)"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <button className="fw-btn" type="submit">
            <Plus size={14} /> Adicionar
          </button>
        </form>
      </div>

      <div className="fw-card" style={{ marginTop: 20 }}>
        <div className="fw-card-label">
          Sua lista ({unlockedCount} de {wishlist.length} liberado{unlockedCount === 1 ? '' : 's'})
        </div>

        {wishlist.length === 0 && (
          <div style={{ fontSize: 13, color: '#5B6B63', marginTop: 10 }}>
            Sua lista está vazia. Adicione o primeiro item ali em cima.
          </div>
        )}

        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {wishlist.map((item, idx) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--line, #DED7C4)',
                background: item.unlocked ? 'rgba(31,111,84,0.08)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button
                  className="fw-btn ghost"
                  style={{ padding: 2 }}
                  disabled={idx === 0}
                  onClick={() => moveWishlistItem(item.id, -1)}
                  title="Subir prioridade"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  className="fw-btn ghost"
                  style={{ padding: 2 }}
                  disabled={idx === wishlist.length - 1}
                  onClick={() => moveWishlistItem(item.id, 1)}
                  title="Descer prioridade"
                >
                  <ArrowDown size={13} />
                </button>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</div>
                <div style={{ fontSize: 12, color: '#5B6B63' }}>
                  {item.unlocked
                    ? 'Liberado esse mês ✅'
                    : item.monthsToSave === Infinity
                    ? 'Ainda sem saldo livre suficiente'
                    : `Em ${item.monthsToSave} ${item.monthsToSave === 1 ? 'mês' : 'meses'} no ritmo atual`}
                </div>
              </div>

              <div className="fw-num">{fmtBRL(item.price)}</div>

              {item.unlocked && (
                <button
                  className="fw-btn ghost"
                  title="Marcar como comprado"
                  onClick={() => removeWishlistItem(item.id)}
                >
                  <Check size={14} />
                </button>
              )}
              <button
                className="fw-btn ghost"
                title="Remover da lista"
                onClick={() => removeWishlistItem(item.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function InvestimentoTab({ investment, setInvestment, suggestedInvest, investMonthly, projection, finalValue, totalInvested, totalGain, allocSum }) {
  const allocKeys = [
    { key: 'rendaFixa', name: 'Renda Fixa', color: PIE_COLORS[0] },
    { key: 'fiis', name: 'FIIs', color: PIE_COLORS[1] },
    { key: 'acoes', name: 'Ações', color: PIE_COLORS[2] },
  ];

  const marks = [12, 24, 36].map((m) => projection[m]);

  return (
    <>
      <div className="fw-pagehead">
        <div>
          <div className="fw-eyebrow">Perfil moderado · horizonte de 3 anos</div>
          <h1>Plano de Investimento</h1>
        </div>
      </div>

      <div className="fw-section">
        <h2>Quanto investir por mês</h2>
        <div className="fw-sub">
          Sugestão automática com base no que sobra depois da reserva de emergência e da viagem: {fmtBRL(suggestedInvest)}
        </div>
        <div className="fw-seg" style={{ maxWidth: 340 }}>
          <button
            className={investment.useAuto ? 'active' : ''}
            onClick={() => setInvestment((g) => ({ ...g, useAuto: true }))}
          >
            Usar sugestão
          </button>
          <button
            className={!investment.useAuto ? 'active' : ''}
            onClick={() => setInvestment((g) => ({ ...g, useAuto: false }))}
          >
            Definir manualmente
          </button>
        </div>
        {!investment.useAuto && (
          <div className="fw-field" style={{ maxWidth: 260, marginTop: 14 }}>
            <label>Aporte mensal (R$)</label>
            <input
              type="number"
              value={investment.monthlyAmount}
              onChange={(e) => setInvestment((g) => ({ ...g, monthlyAmount: Number(e.target.value) }))}
            />
          </div>
        )}
      </div>

      <div className="fw-section">
        <h2>Alocação (perfil moderado)</h2>
        <div className="fw-sub">
          Distribua o percentual entre as classes e ajuste a rentabilidade anual esperada de cada uma. Total: {' '}
          <span className="fw-num" style={{ color: allocSum === 100 ? 'var(--emerald-dark)' : 'var(--brick)' }}>
            {allocSum}%
          </span>
          {allocSum !== 100 && ' (ajuste para somar 100%)'}
        </div>
        {allocKeys.map((a) => (
          <div className="fw-allocrow" key={a.key}>
            <div className="swatch" style={{ background: a.color }} />
            <div className="name">{a.name}</div>
            <input
              type="range"
              min="0"
              max="100"
              value={investment.allocation[a.key]}
              onChange={(e) =>
                setInvestment((g) => ({
                  ...g,
                  allocation: { ...g.allocation, [a.key]: Number(e.target.value) },
                }))
              }
            />
            <div className="pct">{investment.allocation[a.key]}%</div>
            <div className="ret">
              <input
                type="number"
                value={investment.returns[a.key]}
                onChange={(e) =>
                  setInvestment((g) => ({
                    ...g,
                    returns: { ...g.returns, [a.key]: Number(e.target.value) },
                  }))
                }
              />
              % a.a.
            </div>
          </div>
        ))}

        <div className="fw-note" style={{ marginTop: 14 }}>
          <Info size={15} />
          <span>
            Rentabilidades pré-preenchidas como referência de mercado (jul/2026): Renda Fixa próxima da Selic/CDI
            atual (14,25%/14,15% a.a.), FIIs com base no dividend yield médio histórico do IFIX (~8% a.a.) somado à
            valorização de cota, e Ações com base no retorno nominal de longo prazo do Ibovespa. São só um ponto de
            partida — ajuste livremente conforme sua visão de mercado.
          </span>
        </div>
      </div>

      <div className="fw-cards" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="fw-card">
          <div className="fw-card-label">Total aportado (36 meses)</div>
          <div className="fw-card-value">{fmtBRL(totalInvested)}</div>
        </div>
        <div className="fw-card">
          <div className="fw-card-label">Valor projetado</div>
          <div className="fw-card-value pos">{fmtBRL(finalValue)}</div>
        </div>
        <div className="fw-card">
          <div className="fw-card-label">Rendimento estimado</div>
          <div className="fw-card-value pos">{fmtBRL(totalGain)}</div>
        </div>
      </div>

      <div className="fw-section">
        <h2>Projeção de crescimento</h2>
        <div className="fw-sub">Aporte mensal de {fmtBRL(investMonthly)}, ao longo de 36 meses</div>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <AreaChart data={projection}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis
                dataKey="month"
                tickFormatter={(m) => (m % 6 === 0 ? `${m}m` : '')}
                tick={{ fontSize: 11 }}
              />
              <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} width={40} />
              <Tooltip formatter={(v) => fmtBRL(v)} labelFormatter={(m) => `Mês ${m}`} />
              <Area type="monotone" dataKey="total" stroke="#1F6F54" fill="#1F6F54" fillOpacity={0.18} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={{ marginTop: 20 }}>
          {marks.map((m, i) => (
            <div className="fw-row" key={i}>
              <span>Ano {i + 1}</span>
              <span className="fw-num">{fmtBRL(m?.total || 0)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="fw-disclaimer">
        As rentabilidades acima são estimativas definidas por você para fins de simulação e não representam garantia
        de retorno. Rentabilidade passada não garante rentabilidade futura, e todo investimento envolve risco. Este
        painel não constitui recomendação de investimento — para decisões reais, consulte um profissional certificado
        (CVM/ANBIMA).
      </div>
    </>
  );
}
