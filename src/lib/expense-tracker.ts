import { getSetting, setSetting } from "@/lib/settings";

const STORAGE_KEY = "EXPENSE_TRACKER_DATA";

export type TrackerMonth = {
  id: number;
  year: number;
  month: number;
  is_current: 0 | 1;
  created_at: string;
};

export type ExpenseItem = {
  id: number;
  month_id: number;
  name: string;
  expected_amount: number;
  paid_amount: number;
  is_recurring: 0 | 1;
  sort_order: number;
};

export type IncomeItem = {
  id: number;
  month_id: number;
  source: string;
  expected_amount: number;
  received_amount: number;
  income_type: string;
  invoice_ninja_id: string | null;
  sort_order: number;
};

type TrackerData = {
  months: TrackerMonth[];
  expenses: ExpenseItem[];
  income: IncomeItem[];
};

const EMPTY_DATA: TrackerData = {
  months: [],
  expenses: [],
  income: [],
};

async function loadData(): Promise<TrackerData> {
  const raw = await getSetting(STORAGE_KEY);
  if (!raw) return { ...EMPTY_DATA };

  try {
    const parsed = JSON.parse(raw) as Partial<TrackerData>;
    return {
      months: Array.isArray(parsed.months) ? parsed.months : [],
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      income: Array.isArray(parsed.income) ? parsed.income : [],
    };
  } catch {
    return { ...EMPTY_DATA };
  }
}

async function saveData(data: TrackerData): Promise<void> {
  await setSetting(STORAGE_KEY, JSON.stringify(data));
}

function nextId(items: Array<{ id: number }>): number {
  if (items.length === 0) return 1;
  return Math.max(...items.map((i) => i.id)) + 1;
}

export async function getCurrentMonth(): Promise<TrackerMonth | null> {
  const data = await loadData();
  return data.months.find((m) => m.is_current === 1) || null;
}

export async function getAllMonths(): Promise<TrackerMonth[]> {
  const data = await loadData();
  return [...data.months].sort((a, b) => (b.year - a.year) || (b.month - a.month));
}

export async function getOrCreateMonth(year: number, month: number): Promise<TrackerMonth> {
  const data = await loadData();
  const found = data.months.find((m) => m.year === year && m.month === month);
  if (found) return found;

  const created: TrackerMonth = {
    id: nextId(data.months),
    year,
    month,
    is_current: 0,
    created_at: new Date().toISOString(),
  };

  data.months.push(created);
  await saveData(data);
  return created;
}

export async function setCurrentMonth(monthId: number): Promise<void> {
  const data = await loadData();
  data.months = data.months.map((m) => ({ ...m, is_current: m.id === monthId ? 1 : 0 }));
  await saveData(data);
}

export async function getExpensesForMonth(monthId: number): Promise<ExpenseItem[]> {
  const data = await loadData();
  return data.expenses
    .filter((e) => e.month_id === monthId)
    .sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));
}

export async function addExpense(
  monthId: number,
  name: string,
  expectedAmount: number,
  paidAmount = 0,
  isRecurring: 0 | 1 = 1
): Promise<number> {
  const data = await loadData();
  const nextOrder =
    data.expenses
      .filter((e) => e.month_id === monthId)
      .reduce((max, e) => Math.max(max, e.sort_order), 0) + 1;

  const id = nextId(data.expenses);
  data.expenses.push({
    id,
    month_id: monthId,
    name,
    expected_amount: expectedAmount,
    paid_amount: paidAmount,
    is_recurring: isRecurring,
    sort_order: nextOrder,
  });

  await saveData(data);
  return id;
}

export async function updateExpense(id: number, fields: Partial<ExpenseItem>): Promise<void> {
  const data = await loadData();
  const idx = data.expenses.findIndex((e) => e.id === id);
  if (idx === -1) return;

  const current = data.expenses[idx];
  data.expenses[idx] = {
    ...current,
    name: typeof fields.name === "string" ? fields.name : current.name,
    expected_amount: typeof fields.expected_amount === "number" ? fields.expected_amount : current.expected_amount,
    paid_amount: typeof fields.paid_amount === "number" ? fields.paid_amount : current.paid_amount,
    is_recurring: typeof fields.is_recurring === "number" ? (fields.is_recurring ? 1 : 0) : current.is_recurring,
  };

  await saveData(data);
}

export async function deleteExpense(id: number): Promise<void> {
  const data = await loadData();
  data.expenses = data.expenses.filter((e) => e.id !== id);
  await saveData(data);
}

export async function getIncomeForMonth(monthId: number): Promise<IncomeItem[]> {
  const data = await loadData();
  return data.income
    .filter((i) => i.month_id === monthId)
    .sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));
}

export async function addIncome(
  monthId: number,
  source: string,
  expectedAmount: number,
  receivedAmount = 0,
  incomeType = "manual",
  invoiceNinjaId: string | null = null
): Promise<number> {
  const data = await loadData();
  const nextOrder =
    data.income
      .filter((i) => i.month_id === monthId)
      .reduce((max, i) => Math.max(max, i.sort_order), 0) + 1;

  const id = nextId(data.income);
  data.income.push({
    id,
    month_id: monthId,
    source,
    expected_amount: expectedAmount,
    received_amount: receivedAmount,
    income_type: incomeType,
    invoice_ninja_id: invoiceNinjaId,
    sort_order: nextOrder,
  });

  await saveData(data);
  return id;
}

export async function updateIncome(id: number, fields: Partial<IncomeItem>): Promise<void> {
  const data = await loadData();
  const idx = data.income.findIndex((i) => i.id === id);
  if (idx === -1) return;

  const current = data.income[idx];
  data.income[idx] = {
    ...current,
    source: typeof fields.source === "string" ? fields.source : current.source,
    expected_amount: typeof fields.expected_amount === "number" ? fields.expected_amount : current.expected_amount,
    received_amount: typeof fields.received_amount === "number" ? fields.received_amount : current.received_amount,
    income_type: typeof fields.income_type === "string" ? fields.income_type : current.income_type,
  };

  await saveData(data);
}

export async function deleteIncome(id: number): Promise<void> {
  const data = await loadData();
  data.income = data.income.filter((i) => i.id !== id);
  await saveData(data);
}

export async function clearInvoiceNinjaIncome(monthId: number): Promise<void> {
  const data = await loadData();
  data.income = data.income.filter(
    (i) => !(i.month_id === monthId && ["invoice", "quote", "recurring_invoice"].includes(i.income_type))
  );
  await saveData(data);
}

export async function rolloverMonth(
  fromMonthId: number,
  toYear: number,
  toMonth: number
): Promise<{ monthId: number; created: boolean }> {
  const data = await loadData();

  let target = data.months.find((m) => m.year === toYear && m.month === toMonth);
  if (!target) {
    target = {
      id: nextId(data.months),
      year: toYear,
      month: toMonth,
      is_current: 0,
      created_at: new Date().toISOString(),
    };
    data.months.push(target);
  }

  const hasExpenses = data.expenses.some((e) => e.month_id === target!.id);
  if (!hasExpenses) {
    const recurringExpenses = data.expenses
      .filter((e) => e.month_id === fromMonthId && e.is_recurring === 1)
      .sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));

    for (const e of recurringExpenses) {
      data.expenses.push({
        ...e,
        id: nextId(data.expenses),
        month_id: target.id,
        paid_amount: 0,
      });
    }

    const recurringIncome = data.income
      .filter((i) => i.month_id === fromMonthId && i.income_type === "recurring")
      .sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));

    for (const i of recurringIncome) {
      data.income.push({
        ...i,
        id: nextId(data.income),
        month_id: target.id,
        received_amount: 0,
        invoice_ninja_id: null,
      });
    }
  }

  data.months = data.months.map((m) => ({ ...m, is_current: m.id === target!.id ? 1 : 0 }));
  await saveData(data);
  return { monthId: target.id, created: !hasExpenses };
}
